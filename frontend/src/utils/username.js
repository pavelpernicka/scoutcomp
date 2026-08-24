// The hyphen must be escaped for the browser's Unicode-aware `pattern` regex.
export const USERNAME_PATTERN = "[a-z0-9._\\-]{3,64}";

/** Normalizes interactive input to the same invariant as the API. */
export const normalizeUsernameInput = (value) =>
  (value || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
