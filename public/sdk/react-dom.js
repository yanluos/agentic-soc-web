// Import-map shim: `react-dom` → the host's ReactDOM.
const D = window.__SOC_SDK__.reactDom
export default D
export const { createPortal, flushSync, version } = D
