// 飞连身份 (feilian) plugin — no sidebar module; contributes the 飞连 tenant
// credentials section (插件管理 page) and the 飞连 tool-source grouping.
import { Send, KeyRound } from "lucide-react"

import { cn } from "@/lib/utils"

// 飞连的纸飞机机头朝左上 — lucide 的 Send 机头朝右上，水平镜像它。
function FeilianIcon({ className, ...props }) {
  return <Send {...props} className={cn("-scale-x-100", className)} />
}

export default {
  id: "feilian",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  icon: FeilianIcon,
  settingsSections: [
    { key: "feilian", title: "飞连租户凭据", desc: "飞连多租户身份接入 AK/SK 与私有 CA 证书。热生效（令牌到期后重取）", hot: true },
  ],
  sources: [{ label: "飞连", icon: FeilianIcon, order: 10 }],
  icons: { KeyRound },
}
