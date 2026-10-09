// JWT helpers. Token is stored in localStorage under the same key as the
// legacy `soc-web` so existing dev tools (e.g. test scripts) can reuse it.
//
// Tokens use the form `header.payload.signature` where `payload` is base64url-
// encoded JSON with at least `{ exp: <unix-seconds> }`. We do not verify the
// signature client-side — the server enforces it on every request.

const TOKEN_KEY = "soc_admin_token"

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ""
  } catch {
    return ""
  }
}

export function storeToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable — best-effort */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* best-effort */
  }
}

function base64UrlDecode(input) {
  // Convert base64url → base64 → atob.
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded
  try {
    // atob is available in browsers; decodeURIComponent + escape handles UTF-8
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
  } catch {
    return null
  }
}

export function decodeToken(token) {
  if (!token || typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length < 2) return null
  const payload = base64UrlDecode(parts[1])
  if (!payload) return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export function isTokenExpired(token) {
  const payload = decodeToken(token)
  if (!payload || typeof payload.exp !== "number") return true
  // exp is unix-seconds; Date.now is ms.
  return payload.exp * 1000 <= Date.now()
}
