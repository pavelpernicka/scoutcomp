export const formatDateToLocal = (utcDateString, locale) => {
  if (!utcDateString) return '';

  const date = new Date(utcDateString);
  return date.toLocaleString(locale);
};

export const formatDateToLocalShort = (utcDateString, locale) => {
  if (!utcDateString) return '';

  const date = new Date(utcDateString);
  return date.toLocaleDateString(locale);
};

export const formatTimeToLocal = (utcDateString, locale) => {
  if (!utcDateString) return '';

  const date = new Date(utcDateString);
  return date.toLocaleTimeString(locale);
};

export const convertLocalToUTC = (localDateString) => {
  if (!localDateString) return null;

  const localDate = new Date(localDateString);
  return localDate.toISOString();
};

export const isDateExpired = (utcDateString) => {
  if (!utcDateString) return false;

  const date = new Date(utcDateString);
  const now = new Date();
  return date < now;
};