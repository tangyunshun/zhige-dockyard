// Auth utils: unified access to the local session credentials.
// The JWT is written to localStorage under the key "auth_token" by the
// login / refresh flows. The local user id is stored under "userId" and is
// used for local display/comparison only, never as a request credential.

const TOKEN_KEY = "auth_token";
const USER_ID_KEY = "userId";

/**
 * Get the current access token (JWT).
 * Returns an empty string on the server or when localStorage is unavailable,
 * letting callers omit the Authorization header in that case.
 */
export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Get the current user id (local identifier).
 * Only used for local display / comparisons (e.g. checking whether a member
 * record belongs to the current user). Never sent as a request credential.
 */
export function getCurrentUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(USER_ID_KEY) || "";
  } catch {
    return "";
  }
}