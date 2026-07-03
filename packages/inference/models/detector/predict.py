"""detector model handler: human typing vs computer-use agent.

Agreed model-handler interface (service.py auto-registers based on it):
  NAME            : str                      Model name, routed at /models/<NAME>/predict
  load()          : Load artifacts at startup (does not raise on failure; status() exposes the reason)
  status() -> dict: Used by /health, reports model load status
  predict(body)   : dict -> dict             Inference; body is the request JSON
"""
from __future__ import annotations

import json
import math
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .extract_features import session_features

NAME = "detector"
# Model weights are private and never baked into the image. In deployed environments
# they are provided at runtime via a bind-mounted volume, located through MODEL_PATH.
# Falls back to the path next to this module (only present if a weights file was placed there).
_MODEL_PATH = os.environ.get("MODEL_PATH") or os.path.join(os.path.dirname(__file__), "model.joblib")

# Component spec: tells the frontend "how to display this detector". Wording/labels/units/descriptions/style
# all live here, and the frontend renders generically from a shared contract. Future detectors just provide
# a spec with the same structure.
# Each feature: label (display name) / format (percent|ms|bits|count|ratio|number) / description (shown when expanded).
SPEC = {
    "id": NAME,
    "title": "Humanly Typing Detector",
    "verdict": {
        # score is the "positive class" probability; the large number is shown as "{pct}% probability of {metricNoun}"
        "positiveClass": "agent",
        "metricNoun": "automated typing, e.g. a computer-use agent",
        "positiveLabel": "Likely automated",
        "negativeLabel": "Likely human",
    },
    "style": {"accent": "#6f5d61"},
    "features": {
        "wb_frac_lt20": {
            "label": "Sub-20ms keystroke gaps",
            "format": "percent",
            "description": "Share of within-burst keystroke gaps under 20ms. Machines can fire near-instant consecutive keystrokes; human fingers physically cannot, so a high share is the strongest agent signal.",
        },
        "wb_frac_lt10": {
            "label": "Sub-10ms keystroke gaps",
            "format": "percent",
            "description": "Share of within-burst keystroke gaps under 10ms; an even more extreme machine-speed signal than the 20ms cutoff.",
        },
        "wb_frac_lt50": {
            "label": "Sub-50ms keystroke gaps",
            "format": "percent",
            "description": "Share of within-burst keystroke gaps under 50ms.",
        },
        "wb_median": {
            "label": "Median within-burst gap",
            "format": "ms",
            "description": "Median gap between consecutive keystrokes inside a typing burst. Humans cluster around 100-200ms; agents are usually much faster.",
        },
        "wb_p90": {
            "label": "90th-pct within-burst gap",
            "format": "ms",
            "description": "90th percentile of within-burst keystroke gaps; the slower tail of in-burst typing.",
        },
        "wb_peak_pm5": {
            "label": "Mode-peak sharpness",
            "format": "percent",
            "description": "How tightly gaps cluster within ±5ms of their mode. Machine timing is unnaturally regular and forms a sharp peak.",
        },
        "wb_entropy": {
            "label": "Keystroke-gap entropy",
            "format": "bits",
            "description": "Shannon entropy of the keystroke-gap distribution. Low entropy means mechanically regular timing; humans are more varied.",
        },
        "wb_autocorr_lag1": {
            "label": "Gap autocorrelation",
            "format": "ratio",
            "description": "Correlation between consecutive keystroke gaps. Strong regularity or periodicity hints at automated input.",
        },
        "pause_gt1000_cnt": {
            "label": "Pauses over 1s",
            "format": "count",
            "description": "Number of pauses longer than 1 second. Humans pause to think; some agents fake sentence-level pauses.",
        },
        "n_bursts": {
            "label": "Typing bursts",
            "format": "count",
            "description": "Number of continuous typing runs, split by pauses longer than 1 second.",
        },
        "delete_rate": {
            "label": "Delete rate",
            "format": "percent",
            "description": "Fraction of edits that are deletions. Humans backspace to fix mistakes; direct-output agents rarely delete.",
        },
        "delete_bursts": {
            "label": "Delete bursts",
            "format": "count",
            "description": "Number of separate backspacing episodes.",
        },
        "typed_cpm": {
            "label": "Typed chars / min",
            "format": "count",
            "description": "Characters typed per minute during active typing (excludes pastes and AI insertions).",
        },
    },
}


def spec() -> dict:
    return SPEC

_artifact: dict[str, Any] | None = None
_load_error: str | None = None


def load() -> None:
    global _artifact, _load_error
    try:
        _artifact = joblib.load(_MODEL_PATH)
        _load_error = None
    except Exception as e:  # noqa: BLE001 (any startup failure must be visible)
        _artifact = None
        _load_error = f"{type(e).__name__}: {e}"


def status() -> dict[str, Any]:
    if _artifact is None:
        return {"loaded": False, "error": _load_error}
    # Operational status only. Training metadata (n_train, note) is intentionally NOT exposed;
    # it is development detail and the note may carry non-English text.
    return {
        "loaded": True,
        "n_features": len(_artifact.get("features", [])),
        "threshold": _artifact.get("threshold"),
        "threshold_trustworthy": _artifact.get("threshold") is not None,
    }


def _normalize_metadata(events: list[dict]) -> list[dict]:
    """session_features calls json.loads(metadata) on page_visible events and expects a string;
    the backend reads it out of jsonb as a dict, so normalize to a string to avoid changing extract_features."""
    out = []
    for e in events:
        m = e.get("metadata")
        if isinstance(m, (dict, list)):
            e = {**e, "metadata": json.dumps(m)}
        out.append(e)
    return out


def predict(body: dict) -> dict[str, Any]:
    if _artifact is None:
        return {"ok": False, "error": f"model not loaded: {_load_error}"}

    events = (body or {}).get("events") or []
    if not events:
        return {"ok": False, "error": "no events provided"}

    feats = session_features(_normalize_metadata(events))

    # Quality gate: too few keystrokes / most of the text not hand-typed → the typing model can't judge (same thresholds as the training quality_gate).
    gate = _artifact.get("quality_gate", {})
    min_kd = gate.get("min_keydown", 50)
    min_ratio = gate.get("min_typed_ratio", 0.5)
    n_keydown = feats.get("n_keydown", 0) or 0
    final_len = feats.get("final_len", 0) or 0
    typed = feats.get("typed_chars", 0) or 0
    typed_ratio = (typed / final_len) if final_len else 0.0
    if n_keydown < min_kd or typed_ratio < min_ratio:
        return {
            "ok": True,
            "label": "unknown",
            "reason": "insufficient_typing",
            "detail": f"n_keydown={n_keydown}(<{min_kd}) or typed ratio={typed_ratio:.2f}(<{min_ratio})",
            "n_keydown": int(n_keydown),
            "typed_ratio": round(typed_ratio, 3),
        }

    # Build the vector in the artifact's feature order; missing/non-numeric → NaN (handled natively by LightGBM).
    # Use a DataFrame with column names, consistent with training, to avoid sklearn feature-name warnings.
    feat_names = _artifact["features"]
    row = {}
    for name in feat_names:
        v = feats.get(name)
        try:
            row[name] = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            row[name] = np.nan
    X = pd.DataFrame([row], columns=feat_names)

    model = _artifact["model"]
    score = float(model.predict_proba(X)[0, 1])  # agent probability
    threshold = _artifact.get("threshold")
    if threshold is not None:
        label = "agent" if score >= threshold else "human"
        trustworthy = True
    else:
        # No trustworthy decision threshold in the artifact: fall back to 0.5 and flag the result
        # as not trustworthy, so callers report a probability without drawing a firm conclusion.
        label = "agent" if score >= 0.5 else "human"
        trustworthy = False

    return {
        "ok": True,
        "label": label,
        "score": round(score, 4),
        "threshold": threshold,
        "threshold_trustworthy": trustworthy,
        "n_keydown": int(n_keydown),
        "typed_ratio": round(typed_ratio, 3),
        "n_events": int(feats.get("n_events", len(events))),
        "features": _top_features(model, X, feat_names, row),
        # Note: the model's internal note is not returned to the frontend (training/debugging only).
    }


def _top_features(model, X, feat_names, row, k: int = 5) -> list[dict]:
    """Use LightGBM's native pred_contrib (SHAP values, no shap dependency needed) to pick the features
    contributing most to this prediction. contribution>0 pushes toward agent, <0 toward human. value is the
    feature's raw value (NaN→None for JSON)."""
    try:
        contribs = model.booster_.predict(X, pred_contrib=True)[0]  # length = n_features+1 (last element is the base value)
    except Exception:
        return []
    pairs = list(zip(feat_names, contribs[:-1]))
    pairs.sort(key=lambda kv: abs(float(kv[1])), reverse=True)
    out = []
    for name, contrib in pairs[:k]:
        v = row.get(name)
        out.append({
            "name": name,
            "value": None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v),
            "contribution": round(float(contrib), 4),
        })
    return out
