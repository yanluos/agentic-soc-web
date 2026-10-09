// hasModule mirrors the backend authz.Has(): admin / "*" wildcard bypass.
// `id` may be a string or an array (any one grant suffices).
export function hasModule(user, id) {
  if (!user) return false
  if (user.is_admin) return true
  const mods = user.modules || []
  if (mods.includes("*")) return true
  const wanted = Array.isArray(id) ? id : [id]
  return wanted.some((m) => mods.includes(m))
}
