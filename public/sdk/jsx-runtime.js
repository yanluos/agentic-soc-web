// Import-map shim: `react/jsx-runtime` → the host's runtime (same React instance).
const J = window.__SOC_SDK__.jsxRuntime
export const { jsx, jsxs, Fragment } = J
export default J
