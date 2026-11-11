import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { passwordChecks } from "@/lib/passwordPolicy.js"

/** 新密码输入框下方的策略清单:空输入时全部灰显,输入后逐条打勾/打叉。 */
export function PasswordPolicyHint({ password = "", username = "", className }) {
  const empty = password.length === 0
  return (
    <ul className={cn("grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2", className)}>
      {passwordChecks(password, username).map((c) => (
        <li
          key={c.key}
          className={cn(
            "flex items-center gap-1",
            empty ? "text-muted-foreground" : c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
          )}
        >
          {empty || !c.ok ? <X className="size-3 shrink-0" /> : <Check className="size-3 shrink-0" />}
          {c.label}
        </li>
      ))}
    </ul>
  )
}
