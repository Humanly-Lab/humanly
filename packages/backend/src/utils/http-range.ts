export interface ByteRange {
  start: number;
  end: number;
}

export type ParsedByteRange =
  | { kind: 'full'; fileSize: number; contentLength: number }
  | {
      kind: 'partial';
      fileSize: number;
      range: ByteRange;
      contentLength: number;
      contentRange: string;
    }
  | { kind: 'not_satisfiable'; fileSize: number; contentRange: string };

function notSatisfiable(fileSize: number): ParsedByteRange {
  return {
    kind: 'not_satisfiable',
    fileSize,
    contentRange: `bytes */${fileSize}`,
  };
}

export function parseSingleByteRange(
  rangeHeader: string | undefined,
  fileSize: number
): ParsedByteRange {
  const normalizedFileSize = Number.isFinite(fileSize) && fileSize > 0
    ? Math.floor(fileSize)
    : 0;

  if (!rangeHeader) {
    return {
      kind: 'full',
      fileSize: normalizedFileSize,
      contentLength: normalizedFileSize,
    };
  }

  const trimmed = rangeHeader.trim();
  const match = /^bytes=(.+)$/i.exec(trimmed);
  if (!match || match[1].includes(',')) {
    return notSatisfiable(normalizedFileSize);
  }

  const rangeSpec = match[1].trim();
  const rangeMatch = /^(\d*)-(\d*)$/.exec(rangeSpec);
  if (!rangeMatch) {
    return notSatisfiable(normalizedFileSize);
  }

  const [, startRaw, endRaw] = rangeMatch;
  if (!startRaw && !endRaw) {
    return notSatisfiable(normalizedFileSize);
  }

  if (normalizedFileSize === 0) {
    return notSatisfiable(normalizedFileSize);
  }

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return notSatisfiable(normalizedFileSize);
    }
    start = Math.max(normalizedFileSize - suffixLength, 0);
    end = normalizedFileSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : normalizedFileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      return notSatisfiable(normalizedFileSize);
    }
    if (start >= normalizedFileSize) {
      return notSatisfiable(normalizedFileSize);
    }
    end = Math.min(end, normalizedFileSize - 1);
  }

  const contentLength = end - start + 1;
  return {
    kind: 'partial',
    fileSize: normalizedFileSize,
    range: { start, end },
    contentLength,
    contentRange: `bytes ${start}-${end}/${normalizedFileSize}`,
  };
}
