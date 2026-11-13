import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "./sdk.js" // publishes window.__SOC_SDK__ before any remote plugin bundle can load
import App from "./App.jsx"
import { PluginBoundary } from "@/platform/PluginBoundary.jsx"
import { ThemeProvider } from "@/components/theme-provider.jsx"
import { Toaster } from "@/components/ui/sonner.jsx"
import { TooltipProvider } from "@/components/ui/tooltip.jsx"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        {/* Last line of defence: a crash in the shell itself (sidebar, top
            bar, login) shows a reload prompt instead of a blank page. */}
        <PluginBoundary>
          <App />
        </PluginBoundary>
        <Toaster richColors closeButton position="top-center" />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
