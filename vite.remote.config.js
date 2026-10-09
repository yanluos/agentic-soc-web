// Build config for REMOTE plugin frontend bundles (design §13). Produces a
// self-contained ESM module that shares only React + sonner with the host
// (via the host page's import map); all other deps (shadcn ui, @/platform,
// lucide, GenericTableModule, …) are bundled in. No CSS is emitted — the scan
// module's Tailwind utility classes are already present in the host stylesheet
// (its source files stay under src/, so Tailwind keeps scanning them).
//
//   npm run build:remote   → ../fscan-runner/assets/index.js
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  define: { "import.meta.env.DEV": "false" },
  build: {
    outDir: path.resolve(__dirname, "../fscan-runner/assets"),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/plugins/scan/remote-entry.jsx"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "sonner"],
      output: { inlineDynamicImports: true },
    },
  },
})
