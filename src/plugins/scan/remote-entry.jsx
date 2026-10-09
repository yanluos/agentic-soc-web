// Remote-entry descriptor for the scan plugin. Built by vite.remote.config.js
// into fscan-runner/assets/index.js and loaded at runtime by the console
// (import map shares the host's React + sonner). The scan backend is the
// fscan-runner remote plugin process; this is only its UI.
import { Radar } from "lucide-react"
import { ScanModule } from "./ScanModule.jsx"

export default {
  id: "scan",
  sdk: "1",
  icon: "Radar",
  modules: [
    { id: "scan", group: "security", label: "主动探测", icon: Radar, permission: "scan", component: ScanModule },
  ],
  hiddenTables: ["fscan_jobs", "fscan_findings"],
  sources: [{ label: "主动探测", icon: Radar, order: 60 }],
  icons: { Radar },
}
