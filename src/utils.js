// General-purpose utilities. NocoDB record accessors, date helpers, formatters.
// Kept dependency-free so it can be unit-tested in isolation.

// ---------------------------------------------------------------------------
// API base normalization
// ---------------------------------------------------------------------------

/**
 * Normalize the user-configured `apiBase` override:
 *   - empty / `/` / `http://localhost:8080` → "" (use Vite proxy on same origin)
 *   - otherwise strip trailing `/`
 */
export function normalizeApiBase(apiBase) {
  if (
    !apiBase ||
    apiBase === "/" ||
    apiBase === "http://localhost:8080" ||
    apiBase === "http://127.0.0.1:8080"
  ) {
    return ""
  }
  return apiBase.replace(/\/+$/, "")
}

// ---------------------------------------------------------------------------
// JSON / misc
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Date helpers (NocoDB stores `YYYY/MM/DD HH:mm` slash-format without seconds)
// ---------------------------------------------------------------------------

/**
 * Convert a date input to NocoDB v3 slash-format `YYYY/MM/DD HH:mm`.
 * Accepts: `YYYY-MM-DD HH:mm[:ss]`, `YYYY/MM/DD HH:mm`, `YYYY-MM-DDTHH:mm`,
 * `Date`, or anything `new Date()` can parse.
 */
export function toNocoDateStr(value) {
  if (!value) return ""
  if (value instanceof Date) {
    return formatSlash(value)
  }
  const s = String(value).trim()
  // Already slash-format with minutes (and optional seconds).
  let m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    return `${m[1]}/${m[2]}/${m[3]} ${pad2(m[4])}:${m[5]}`
  }
  // Dash-format.
  m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (m) {
    return `${m[1]}/${m[2]}/${m[3]} ${pad2(m[4])}:${m[5]}`
  }
  // Fallback: hand to Date.
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return formatSlash(d)
  return s
}

/** Format a Date as `YYYY/MM/DD HH:mm`. */
function formatSlash(d) {
  return (
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  )
}

/** `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function toDtLocal(value) {
  if (!value) return ""
  const s = String(value).trim()
  let m = s.match(/^(\d{4})[\-/](\d{2})[\-/](\d{2})[ T](\d{1,2}):(\d{2})/)
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${pad2(m[4])}:${m[5]}`
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return (
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    )
  }
  return ""
}

/** Reverse of `toDtLocal`: state string in `YYYY-MM-DD HH:mm:ss` form. */
export function fromDtLocal(value) {
  if (!value) return ""
  const s = String(value).trim()
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]} ${pad2(m[4])}:${m[5]}:${m[6] || "00"}`
  }
  return s
}

// ---------------------------------------------------------------------------
// NocoDB v3 record accessors
// ---------------------------------------------------------------------------

/**
 * Normalize any of the response shapes NocoDB v3 (and our wrappers) emit:
 *   { records: [...] }
 *   { list: [...] }
 *   { data: { records: [...] } }
 *   { data: { list: [...] } }
 *   { data: [...] }
 *   [...]
 */
export function normalizeNocoRecords(response) {
  if (!response) return []
  if (Array.isArray(response)) return response
  if (Array.isArray(response.records)) return response.records
  if (Array.isArray(response.list)) return response.list
  if (response.data) {
    if (Array.isArray(response.data)) return response.data
    if (Array.isArray(response.data.records)) return response.data.records
    if (Array.isArray(response.data.list)) return response.data.list
  }
  return []
}

export function getRecordFields(record) {
  if (!record) return {}
  if (record.fields && typeof record.fields === "object") return record.fields
  // Some endpoints return the row flat (no fields wrapper).
  return record
}

export function getRecordId(record) {
  if (!record) return null
  return record.id ?? record.Id ?? record.ID ?? null
}

// ---------------------------------------------------------------------------
// Identity / source data helpers
// ---------------------------------------------------------------------------

/** Extract items array from any of: array / { items } / { data: { items } } / { list } / { data: { list } }. */
export function extractItems(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.items)) return raw.items
  if (Array.isArray(raw.list)) return raw.list
  if (raw.data) {
    if (Array.isArray(raw.data)) return raw.data
    if (Array.isArray(raw.data.items)) return raw.data.items
    if (Array.isArray(raw.data.list)) return raw.data.list
  }
  return []
}

/**
 * Build a dedup-preserving-insertion-order list of column keys from an array
 * of records, skipping object values (which would be nested records, not
 * scalar cells).
 */
export function collectColumns(items) {
  const seen = new Set()
  const cols = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    for (const k of Object.keys(item)) {
      if (seen.has(k)) continue
      const v = item[k]
      if (v !== null && typeof v === "object" && !Array.isArray(v)) continue
      seen.add(k)
      cols.push(k)
    }
  }
  return cols
}


// ---------------------------------------------------------------------------
// Display formatters
// ---------------------------------------------------------------------------

export function formatCell(value) {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function formatBytes(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ---------------------------------------------------------------------------
// Status → Badge variant
// ---------------------------------------------------------------------------

/**
 * Map a run/step/sync status string to a Badge variant:
 *   success (green) · destructive (red) · warning (yellow, running/pending).
 */
export function statusBadgeVariant(status) {
  switch (status) {
    case "succeeded":
    case "success":
    case "synced":
    case "done":
    case "completed":
      return "success"
    case "failed":
    case "error":
      return "destructive"
    case "running":
    case "pending":
    case "in_progress":
    case "queued":
      return "warning"
    default:
      return "secondary"
  }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0")
}
