// API client factory. Returns a thin `{ get, post, put, patch, delete }` shape.
// Auth precedence: Bearer token if present, else X-API-Key fallback.

import { normalizeApiBase } from "@/utils.js"

/**
 * @param {object} opts
 * @param {string} [opts.apiBase]    Override target URL (Vite proxy is used when empty).
 * @param {string} [opts.apiKey]     X-API-Key value (super-admin script access).
 * @param {string} [opts.token]      Bearer JWT (preferred over apiKey when both present).
 */
export function createApiClient({ apiBase = "", apiKey = "", token = "" } = {}) {
  const base = normalizeApiBase(apiBase)

  function buildHeaders(method) {
    const h = {}
    // Only set Content-Type when there's a body — GET without a body doesn't need it
    // and setting it on a no-body request can trigger CORS preflights unnecessarily.
    if (method !== "GET" && method !== "DELETE") {
      h["Content-Type"] = "application/json"
    }
    if (token) {
      h["Authorization"] = `Bearer ${token}`
    } else if (apiKey) {
      h["X-API-Key"] = apiKey
    }
    return h
  }

  async function request(method, path, body) {
    const url = `${base}${path}`
    const opts = { method, headers: buildHeaders(method) }
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      opts.body = JSON.stringify(body)
    }
    const resp = await fetch(url, opts)
    if (!resp.ok) {
      const text = await resp.text()
      let message
      try {
        const parsed = JSON.parse(text)
        message = parsed.error || parsed.message || text
      } catch {
        message = text || `${resp.status} ${resp.statusText}`
      }
      const err = new Error(message)
      err.status = resp.status
      throw err
    }
    const ct = resp.headers.get("content-type") || ""
    if (ct.includes("application/json")) return resp.json()
    return resp.text()
  }

  // upload: authenticated multipart POST. Does NOT set Content-Type so the
  // browser fills in the multipart boundary itself.
  async function upload(path, formData) {
    const headers = {}
    if (token) headers["Authorization"] = `Bearer ${token}`
    else if (apiKey) headers["X-API-Key"] = apiKey
    const resp = await fetch(`${base}${path}`, { method: "POST", headers, body: formData })
    if (!resp.ok) {
      const text = await resp.text()
      let message
      try {
        const parsed = JSON.parse(text)
        message = parsed.error || parsed.message || text
      } catch {
        message = text || `${resp.status} ${resp.statusText}`
      }
      const err = new Error(message)
      err.status = resp.status
      throw err
    }
    const ct = resp.headers.get("content-type") || ""
    return ct.includes("application/json") ? resp.json() : resp.text()
  }

  // getBlob: authenticated binary fetch (file downloads — auth headers can't
  // ride on a plain <a href>).
  async function getBlob(path) {
    const resp = await fetch(`${base}${path}`, { headers: buildHeaders("GET") })
    if (!resp.ok) {
      const err = new Error(`${resp.status} ${resp.statusText}`)
      err.status = resp.status
      throw err
    }
    return resp.blob()
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path) => request("DELETE", path),
    upload,
    getBlob,
  }
}

// ---------------------------------------------------------------------------
// Path builders. These encode the v3 NocoDB query-string conventions.
// `where` is a `(field,op,value)~and~...` string; `sort` is a friendly token
// like `-告警时间` that `toNocoV3Sort()` converts to JSON.
// ---------------------------------------------------------------------------

export function buildTablePath(slug, { limit, page, where, sort, fields } = {}) {
  const qs = new URLSearchParams()
  if (limit !== undefined) qs.set("limit", String(limit))
  if (page !== undefined) qs.set("page", String(page))
  if (where) qs.set("where", where)
  // Send the raw `-field` / `field` token; soc-server resolves the column id
  // and builds the NocoDB v3 sort JSON. (Converting here too would double-encode.)
  if (sort) qs.set("sort", sort)
  if (fields && fields.length) qs.set("fields", fields.join(","))
  return `/api/v1/tables/${slug}/records${qs.toString() ? `?${qs}` : ""}`
}

export function buildTableRecordPath(slug, id) {
  return `/api/v1/tables/${slug}/records/${id}`
}

export function buildTableMetaPath(slug) {
  return `/api/v1/tables/${slug}/meta`
}

/**
 * Convert a friendly sort token (`-告警时间` / `告警时间`) to NocoDB v3
 * sort JSON: `[{"field":"告警时间","direction":"desc"}]`. Returns empty
 * string if input is empty.
 */
export function toNocoV3Sort(token) {
  if (!token) return ""
  const s = String(token).trim()
  if (!s) return ""
  const desc = s.startsWith("-")
  const field = desc ? s.slice(1) : s.startsWith("+") ? s.slice(1) : s
  const direction = desc ? "desc" : "asc"
  return JSON.stringify([{ field, direction }])
}
