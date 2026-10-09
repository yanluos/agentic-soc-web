// Import-map shim: `sonner` → the host's sonner (so a remote plugin's toast()
// reaches the host's single <Toaster/>).
const S = window.__SOC_SDK__.sonner
export default S
export const { toast, Toaster } = S
