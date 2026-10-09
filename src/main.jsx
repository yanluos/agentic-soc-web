import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "./sdk.js" // publishes window.__SOC_SDK__ before any remote plugin bundle can load
import App from "./App.jsx"
import { ThemeProvider } from "@/components/theme-provider.jsx"
import { Toaster } from "@/components/ui/sonner.jsx"
import { TooltipProvider } from "@/components/ui/tooltip.jsx"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <App />
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
