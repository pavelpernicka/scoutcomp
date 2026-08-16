const SERVER_DATE_TZ_RE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a server-supplied datetime string as UTC and return a local Date.
 *
 * The backend stores and sends naive UTC datetimes (e.g. "2026-08-11T18:00:00")
 * without a timezone marker. JavaScript's `new Date(string)` would interpret such
 * a string as local time, so we append the UTC marker ourselves. Strings that
 * already carry a timezone marker (Z or offset) are used as-is.
 */
export const parseServerDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== "string") return null;

  const candidate = DATE_ONLY_RE.test(value) || SERVER_DATE_TZ_RE.test(value) ? value : `${value}Z`;
  const date = new Date(candidate);
  if (!Number.isNaN(date.getTime())) return date;

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const formatDateToLocal = (utcDateString, locale) => {
  const date = parseServerDate(utcDateString);
  if (!date) return '';

  return date.toLocaleString(locale);
};

export const formatDateToLocalShort = (utcDateString, locale) => {
  const date = parseServerDate(utcDateString);
  if (!date) return '';

  return date.toLocaleDateString(locale);
};

export const formatTimeToLocal = (utcDateString, locale) => {
  const date = parseServerDate(utcDateString);
  if (!date) return '';

  return date.toLocaleTimeString(locale);
};

/**
 * Convert a local datetime string (from a <input type="datetime-local">) to a
 * UTC ISO string suitable for the backend. Date-only strings are treated as
 * local midnight.
 */
export const convertLocalToUTC = (localDateString) => {
  if (!localDateString) return null;

  const normalized = DATE_ONLY_RE.test(localDateString) ? `${localDateString}T00:00:00` : localDateString;
  const localDate = new Date(normalized);
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
};

export const isDateExpired = (utcDateString) => {
  const date = parseServerDate(utcDateString);
  if (!date) return false;

  return date < new Date();
};

const pad = (n) => String(n).padStart(2, "0");

/**
 * Format a server UTC datetime into a local value for a
 * <input type="datetime-local"> (e.g. "2026-08-11T20:00").
 */
export const formatServerDateToInputValue = (utcDateString) => {
  const date = parseServerDate(utcDateString);
  if (!date) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Format a server UTC datetime into a local date for a <input type="date">
 * (e.g. "2026-08-11").
 */
export const formatServerDateToDateInput = (utcDateString) => {
  const date = parseServerDate(utcDateString);
  if (!date) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
