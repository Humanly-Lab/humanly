export type DisplayDateTimeInput = Date | string | number | null | undefined;

export interface FormatDisplayDateTimeOptions {
  locale?: Intl.LocalesArgument;
  fallback?: string;
}

export interface FormatDisplayDateTimeRangeOptions extends FormatDisplayDateTimeOptions {
  emptyFallback?: string;
  endPrefix?: string;
  invalidFallback?: string;
  separator?: string;
  startPrefix?: string;
}

export interface DisplayDateTimeRangeInput {
  end?: DisplayDateTimeInput;
  start?: DisplayDateTimeInput;
}

const DISPLAY_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function hasDisplayDateTimeValue(value: DisplayDateTimeInput): value is Date | string | number {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function parseDisplayDateTime(value: DisplayDateTimeInput): Date | null {
  if (!hasDisplayDateTimeValue(value)) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDateTime(
  value: DisplayDateTimeInput,
  options: FormatDisplayDateTimeOptions = {}
): string {
  const date = parseDisplayDateTime(value);
  if (!date) return options.fallback ?? 'Not available';

  return new Intl.DateTimeFormat(options.locale, DISPLAY_DATE_TIME_OPTIONS).format(date);
}

export function formatDisplayDateTimeRange(
  range: DisplayDateTimeRangeInput,
  options: FormatDisplayDateTimeRangeOptions = {}
): string {
  const start = parseDisplayDateTime(range.start);
  const end = parseDisplayDateTime(range.end);
  const format = (date: Date) => formatDisplayDateTime(date, options);

  if (start && end) {
    return `${format(start)}${options.separator ?? ' to '}${format(end)}`;
  }

  if (start) {
    return `${options.startPrefix ?? 'Opens'} ${format(start)}`;
  }

  if (end) {
    return `${options.endPrefix ?? 'Closes'} ${format(end)}`;
  }

  if (hasDisplayDateTimeValue(range.start) || hasDisplayDateTimeValue(range.end)) {
    return options.invalidFallback ?? 'Date unavailable';
  }

  return options.emptyFallback ?? 'No date range';
}

export function formatCompactDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, '0');
    const paddedSeconds = seconds.toString().padStart(2, '0');
    if (seconds > 0) return `${hours}h${paddedMinutes}min${paddedSeconds}s`;
    if (minutes > 0) return `${hours}h${paddedMinutes}min`;
    return `${hours}h`;
  }

  if (minutes > 0) {
    if (seconds > 0) return `${minutes}min${seconds.toString().padStart(2, '0')}s`;
    return `${minutes}min`;
  }

  return `${seconds}s`;
}
