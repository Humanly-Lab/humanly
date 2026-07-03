#!/usr/bin/env python3
"""
Extract session-level features from exported writing-log events, for detecting human typing vs
automated typing (e.g. a computer-use agent).

Why gaps are split into bursts:
  A single spread metric (CV/std) over all keystroke gaps is easy to fool: an agent can fire keys
  a few ms apart within a sentence yet pause between sentences, ending up with a spread as high as
  a human's. So adjacent keystroke gaps are first split at large pauses (> GAP_MS) into two streams
  and measured separately: "within-burst typing speed" and "between-burst pauses". The share of
  within-burst gaps under 20ms is the strongest, most robust signal: machines can type that fast,
  human fingers cannot.

Data model: one documentId = one writing session = one sample; submissionUserId identifies the
participant (used to keep one person's sessions from spanning train/test splits).

Usage (offline training tool; session_features() is also imported by the inference service):
  python extract_features.py EXPORT.csv [EXPORT2.csv ...] [--labels labels.csv] [--out features.csv]

When --labels is absent or missing, a labels_template.csv (with a per-document summary) is written
for manual labeling before re-running.
"""
from __future__ import annotations
import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np

# ---- Config ----
GAP_MS = 1000.0          # Burst split threshold: an adjacent typing gap > GAP_MS counts as a burst boundary (a thinking pause)
TYPING_TYPES = {"keydown", "input"}   # Text-advancing events (used for typing rhythm / the gap stream)
DROP_COLS = {"editorStateBefore", "editorStateAfter"}  # Very large and unused by the features

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


# ---------- Loading ----------
def parse_ts(s: str) -> float:
    """ISO timestamp → epoch milliseconds."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt.timestamp() * 1000.0


def load_events(paths: list[str]) -> dict[str, list[dict]]:
    """Read multiple export CSVs, globally dedupe by eventId, drop the editorState columns, then group by documentId and sort."""
    seen = set()
    by_doc: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for p in paths:
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                total += 1
                eid = row.get("eventId")
                if not eid or eid in seen:        # ⚠️ Dedupe: the submissions×events JOIN can duplicate events
                    continue
                seen.add(eid)
                for c in DROP_COLS:
                    row.pop(c, None)
                by_doc[row["documentId"]].append(row)
    for evs in by_doc.values():
        # Sort key: event timestamp → server-side time → eventId (matches the export's ORDER BY)
        evs.sort(key=lambda r: (r["eventTimestamp"], r.get("eventCreatedAt", ""), r["eventId"]))
    dropped = total - len(seen)
    print(f"[load] read {total} rows, {len(seen)} after dedupe (dropped {dropped} duplicates), {len(by_doc)} documents", file=sys.stderr)
    return by_doc


# ---------- Small helpers ----------
def _len(s) -> int:
    return len(s) if isinstance(s, str) else 0


def _safe_div(a, b):
    return a / b if b else float("nan")


def _entropy_loghist(vals: np.ndarray, bins: int = 20) -> float:
    """Shannon entropy (bits) of the log10 gap histogram; low entropy = machine-like regularity."""
    v = vals[vals > 0]
    if v.size < 3:
        return float("nan")
    lv = np.log10(v)
    hist, _ = np.histogram(lv, bins=bins)
    p = hist[hist > 0] / hist.sum()
    return float(-(p * np.log2(p)).sum())


def _lag1_autocorr(x: np.ndarray) -> float:
    if x.size < 3:
        return float("nan")
    a, b = x[:-1], x[1:]
    if a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def _peak_cpm(ts_ms: np.ndarray) -> float:
    """Keystroke count within the busiest 60s window (≈ peak cpm)."""
    if ts_ms.size < 2:
        return float(ts_ms.size)
    t = np.sort(ts_ms)
    j = 0
    best = 1
    for i in range(t.size):
        while t[i] - t[j] > 60_000:
            j += 1
        best = max(best, i - j + 1)
    return float(best)


# ---------- Per-session features ----------
def session_features(evs: list[dict]) -> dict:
    f: dict[str, float] = {}
    types = Counter(e["eventType"] for e in evs)
    n_keydown = types.get("keydown", 0)
    n_input = types.get("input", 0)
    n_delete = types.get("delete", 0)

    # ---- Text deltas / output ----
    final_len = 0
    total_added = 0          # Sum of positive deltas (cumulative characters typed in)
    deltas = []              # Per-typing-event character deltas
    deleted_chars = 0
    for e in evs:
        before, after = _len(e.get("textBefore")), _len(e.get("textAfter"))
        final_len = max(final_len, after)
        if e["eventType"] in TYPING_TYPES:
            d = after - before
            deltas.append(d)
            if d > 0:
                total_added += d
        elif e["eventType"] == "delete":
            if before > after:
                deleted_chars += before - after
    deltas = np.array(deltas, dtype=float) if deltas else np.array([0.0])
    n_typing = n_keydown + n_input

    f["final_len"] = final_len
    f["typed_chars"] = int(total_added)   # Net hand-typed characters (keydown/input only, excludes paste/AI); used by the quality gate
    f["n_keydown"] = n_keydown
    f["n_input"] = n_input
    f["chars_per_keystroke"] = _safe_div(final_len, n_keydown)
    f["delta_gt1_cnt"] = int((deltas > 1).sum())
    f["delta_gt5_cnt"] = int((deltas > 5).sum())
    f["delta_gt20_cnt"] = int((deltas > 20).sum())
    f["delta_max"] = float(deltas.max())
    f["bulk_inserted_chars"] = float(deltas[deltas > 1].sum())   # Sum of large-delta characters (bulk-insert signal)

    # ---- Editing / correction ----
    f["n_delete"] = n_delete
    f["deleted_chars"] = deleted_chars
    f["delete_rate"] = _safe_div(n_delete, n_typing + n_delete)
    f["churn"] = total_added - final_len           # Humans > 0; direct-output agents ≈ 0
    # Number of consecutive delete runs
    runs, prev = 0, False
    for e in evs:
        is_del = e["eventType"] == "delete"
        if is_del and not prev:
            runs += 1
        prev = is_del
    f["delete_bursts"] = runs

    # ---- Gap stream + burst segmentation ----
    ks_ts = np.array([parse_ts(e["eventTimestamp"]) for e in evs if e["eventType"] in TYPING_TYPES])
    ks_ts.sort()
    if ks_ts.size >= 2:
        dt = np.diff(ks_ts)                         # Adjacent typing gaps (ms), zeros not filtered
        within = dt[dt <= GAP_MS]                   # Within-burst typing speed
        between = dt[dt > GAP_MS]                    # Between-burst pauses
        n_bursts = int(between.size + 1)

        # Within-burst typing speed (the primary signal group)
        if within.size:
            f["wb_frac_lt10"] = float((within < 10).mean())
            f["wb_frac_lt20"] = float((within < 20).mean())   # strongest discriminator
            f["wb_frac_lt50"] = float((within < 50).mean())
            f["wb_median"] = float(np.median(within))
            for q in (10, 25, 75, 90):
                f[f"wb_p{q}"] = float(np.percentile(within, q))
            f["wb_iqr"] = float(np.percentile(within, 75) - np.percentile(within, 25))
            med = np.median(within)
            f["wb_peak_pm5"] = float((np.abs(within - med) <= 5).mean())  # Mode-peak sharpness
            f["wb_entropy"] = _entropy_loghist(within)
            f["wb_cv"] = _safe_div(within.std(), within.mean())          # auxiliary / secondary signal
            f["wb_n"] = int(within.size)
        f["wb_autocorr_lag1"] = _lag1_autocorr(within)

        # Between-burst pause structure
        f["n_bursts"] = n_bursts
        f["mean_burst_chars"] = _safe_div(ks_ts.size, n_bursts)
        f["pause_gt500_cnt"] = int((dt > 500).sum())
        f["pause_gt1000_cnt"] = int((dt > 1000).sum())
        f["pause_gt2000_cnt"] = int((dt > 2000).sum())
        f["pause_gt5000_cnt"] = int((dt > 5000).sum())
        f["pause_total_ms"] = float(between.sum())
        f["between_median_ms"] = float(np.median(between)) if between.size else float("nan")

        # Global gap stats (reference only, not primary features)
        f["global_median_ms"] = float(np.median(dt))
        f["global_cv"] = _safe_div(dt.std(), dt.mean())

        # Session structure
        span_s = (ks_ts[-1] - ks_ts[0]) / 1000.0
        f["duration_s"] = span_s
        f["active_typing_s"] = float(within.sum()) / 1000.0
        f["idle_s"] = float(between.sum()) / 1000.0
        f["overall_cpm"] = _safe_div(final_len, span_s / 60.0)
        f["peak_cpm_60s"] = _peak_cpm(ks_ts)
        # Pure hand-typing throughput: keyed-in characters only (total_added, excludes paste/AI) ÷ active typing time.
        # Not polluted by paste/AI, so it is preferred over overall_cpm.
        f["typed_cpm"] = _safe_div(total_added, f["active_typing_s"] / 60.0)

    # time-to-first-keystroke: first typing event − first event
    if evs and ks_ts.size:
        f["time_to_first_keystroke_s"] = (ks_ts[0] - parse_ts(evs[0]["eventTimestamp"])) / 1000.0

    # ---- Workspace / attention (weak signal) ----
    f["n_focus"] = types.get("focus", 0)
    f["n_blur"] = types.get("blur", 0)
    f["n_page_hidden"] = types.get("page_hidden", 0)
    f["n_page_visible"] = types.get("page_visible", 0)
    away = []
    for e in evs:
        if e["eventType"] == "page_visible":
            try:
                m = json.loads(e.get("metadata") or "{}")
                if "hiddenDurationMs" in m:
                    away.append(float(m["hiddenDurationMs"]))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
    f["away_total_ms"] = float(sum(away))
    f["away_max_ms"] = float(max(away)) if away else 0.0

    # ---- Policy signals ----
    f["n_blocked_copy_paste"] = types.get("blocked_copy_paste_attempt", 0)
    f["n_select"] = types.get("select", 0)
    f["n_events"] = len(evs)
    return f


# ---------- Assembly ----------
def build_table(by_doc: dict[str, list[dict]]) -> list[dict]:
    rows = []
    for did, evs in by_doc.items():
        meta = evs[0]
        row = {
            "documentId": did,
            "submissionUserId": meta.get("submissionUserId"),   # participant id (groups a person's sessions)
            "userEmail": meta.get("userEmail"),
            "submittedAt": meta.get("submittedAt"),
        }
        row.update(session_features(evs))
        rows.append(row)
    rows.sort(key=lambda r: r.get("submittedAt") or "")
    return rows


def write_csv(rows: list[dict], path: str):
    if not rows:
        print("[warn] No sessions found; nothing written.", file=sys.stderr)
        return
    cols = list(rows[0].keys())
    for r in rows:                       # Collect all columns (in case sessions have differing columns)
        for k in r:
            if k not in cols:
                cols.append(k)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def load_labels(path: str) -> dict[str, dict]:
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["documentId"]] = {"label": r.get("label", ""), "condition": r.get("condition", "")}
    return out


def main():
    ap = argparse.ArgumentParser(description="Humanly detector feature extraction")
    ap.add_argument("exports", nargs="+", help="One or more Log events CSV export files")
    ap.add_argument("--labels", default="labels.csv", help="documentId→label/condition mapping (default labels.csv)")
    ap.add_argument("--out", default="features.csv", help="Output feature table")
    args = ap.parse_args()

    by_doc = load_events(args.exports)
    rows = build_table(by_doc)

    import os
    if os.path.exists(args.labels):
        labels = load_labels(args.labels)
        unlabeled = [r["documentId"] for r in rows if r["documentId"] not in labels]
        for r in rows:
            lab = labels.get(r["documentId"], {})
            r["label"] = lab.get("label", "")
            r["condition"] = lab.get("condition", "")
        if unlabeled:
            print(f"[warn] {len(unlabeled)} documents have no label in labels.csv; label left blank.", file=sys.stderr)
    else:
        tmpl = "labels_template.csv"
        with open(tmpl, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["documentId", "label", "condition", "_submittedAt", "_n_keydown",
                        "_wb_median", "_wb_frac_lt20", "_chars_per_keystroke"])
            for r in rows:
                w.writerow([r["documentId"], "", "", r.get("submittedAt"), r.get("n_keydown"),
                            round(r.get("wb_median", float("nan")), 1) if r.get("wb_median") == r.get("wb_median") else "",
                            round(r.get("wb_frac_lt20", float("nan")), 3) if r.get("wb_frac_lt20") == r.get("wb_frac_lt20") else "",
                            round(r.get("chars_per_keystroke", float("nan")), 2) if r.get("chars_per_keystroke") == r.get("chars_per_keystroke") else ""])
        print(f"[labels] {args.labels} not found; wrote {tmpl} (with summary). Fill in label (human/agent/exclude) and condition, then re-run with --labels.", file=sys.stderr)

    write_csv(rows, args.out)
    print(f"[done] wrote {len(rows)} rows × {len(rows[0])} columns → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
