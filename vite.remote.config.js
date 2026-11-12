// Build config for REMOTE plugin frontend bundles (design §13). Produces a
// self-contained ESM module that shares only React + sonner with the host
// (via the host page's import map); all other deps (shadcn ui, @/platform,
// lucide, GenericTableModule, …) are bundled in. No CSS is emitted — the scan
// module's Tailwind utility classes are already present in the host stylesheet
// (its source files stay under src/, so Tailwind keeps scanning them).
//
//   npm run build:remote                     → ../fscan-runner/assets/index.js  (scan)
//   npm run build:remote:logs                → ../log-service/assets/index.js   (logs)
//   REMOTE_PLUGIN=<id> [REMOTE_OUT_DIR=…] vite build --config vite.remote.config.js
//
// One remote plugin per build: REMOTE_PLUGIN picks src/plugins/<id>/remote-entry.jsx;
// the output dir comes from REMOTE_OUT_DIR or the table below (each plugin's
// process serves its own assets/ dir).
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const REMOTE_OUT = {
  scan: "../fscan-runner/assets",
  logs: "../log-service/assets",
}
const pluginId = process.env.REMOTE_PLUGIN || "scan"
const outDir = process.env.REMOTE_OUT_DIR || REMOTE_OUT[pluginId]
if (!outDir) throw new Error(`vite.remote.config.js: unknown REMOTE_PLUGIN "${pluginId}" — set REMOTE_OUT_DIR`)

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { "import.meta.env.DEV": "false" },
  // public/ (favicon, the import-map SDK) belongs to the host page only.
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, outDir),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, `src/plugins/${pluginId}/remote-entry.jsx`),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "sonner"],
      output: { inlineDynamicImports: true },
    },
  },
})
