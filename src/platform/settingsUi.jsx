// Shared settings-UI building blocks for the 插件管理 / 其他设置 pages and for
// plugin-provided settings editors (exported through @/platform).
import { useEffect, useState } from "react"
import { ChevronDown, Save } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"

// ConfiguredBadge marks a credential slot as ready (its secret is stored server-side).
export function ConfiguredBadge({ ok }) {
  return (
    <Badge variant={ok ? "secondary" : "outline"} className="shrink-0 text-[11px] font-normal">
      {ok ? "已配置" : "未配置"}
    </Badge>
  )
}

// SaveButton — the settings forms' uniform save button.
export function SaveButton({ onClick, saving, disabled, children = "保存" }) {
  return (
    <Button className="self-start" size="sm" onClick={onClick} disabled={saving || disabled}>
      {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
      {children}
    </Button>
  )
}

// SubSection — a collapsible sub-group inside a card (collapsed by default).
// actions sit outside the trigger: CollapsibleTrigger is a button and buttons
// cannot nest.
export function SubSection({ title, actions, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
        </CollapsibleTrigger>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t px-3 py-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// GroupCard — a collapsible service card: header (icon slot + title +
// description + summary badges + chevron) and expanded body. Supports a
// controlled `open` for callers that poll while expanded.
export function GroupCard({ icon: Icon, title, description, badges, open, onOpenChange, defaultOpen = false, children }) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const isOpen = open ?? innerOpen
  const setOpen = onOpenChange ?? setInnerOpen
  return (
    <Card className={cn(cardHover, "overflow-hidden py-0")}>
      <Collapsible open={isOpen} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4.5" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{title}</span>
            {description ? <span className="truncate text-xs text-muted-foreground">{description}</span> : null}
          </div>
          {badges}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// useSection loads one app_settings section (masked) and exposes save(). The
// backend masks secret fields as "__SET__"; sending them back unchanged (or
// blank) keeps the stored value. Plugin settings editors build on this.
export function useSection(apiClient, sectionKey, setError) {
  const path = `/api/v1/settings/${sectionKey}`
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get(path)
      .then((d) => !cancelled && setData(d ?? {}))
      .catch((e) => !cancelled && setError?.(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [apiClient, path, setError, reloadKey])

  async function save(next, label) {
    setSaving(true)
    try {
      await apiClient.put(path, next)
      toast.success(`${label || sectionKey} 已保存`)
      setReloadKey((k) => k + 1)
      return true
    } catch (e) {
      setError?.(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }
  return { data, loading, saving, save, reload: () => setReloadKey((k) => k + 1) }
}

// SectionJsonEditor — the generic JSON editor for one app_settings section
// (used when a plugin ships no structured editor for a section).
export function SectionJsonEditor({ sectionKey, apiClient, setError, title }) {
  const { data, loading, saving, save } = useSection(apiClient, sectionKey, setError)
  const [text, setText] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data !== null && !dirty) setText(JSON.stringify(data ?? {}, null, 2))
  }, [data, dirty])

  async function onSave() {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setError?.(`JSON 解析失败:${e.message}`)
      return
    }
    if (await save(parsed, title)) setDirty(false)
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`cfg-${sectionKey}`}>配置 JSON</FieldLabel>
        <Textarea
          id={`cfg-${sectionKey}`}
          className="min-h-40 font-mono text-xs"
          value={loading ? "" : text}
          onChange={(e) => {
            setDirty(true)
            setText(e.target.value)
          }}
          disabled={loading || saving}
          spellCheck={false}
        />
        <FieldDescription>
          密钥字段显示为 <code>__SET__</code>,保持不变或留空均保留原值;填入新值即覆盖。
        </FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <SaveButton onClick={onSave} saving={saving} disabled={loading} />
      </Field>
    </FieldGroup>
  )
}
