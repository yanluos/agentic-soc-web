import { useEffect, useState } from "react"
import { NotificationChannelsCards } from "@/modules/NotificationSettings.jsx"
import { Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

// Sections managed through the generic settings API (soc-server persists all of
// these in the app_settings DB table). `hot` marks sections whose edits take
// effect without a restart; the rest are DB-managed but applied at startup.
// `cat` assigns each section to a settings sidebar module.
//
// Plugin-owned sections (probe/feilian/tianqing/intel/scan/…/appia) are edited
// on the 插件管理 page under their plugin — only the platform-level sections
// remain here. The core notification channels (SMTP/钉钉) render as structured
// cards below (NotificationChannelsCards).
const CONFIG_SECTIONS = [
  { key: "network", cat: "proxy", title: "网络代理", desc: "出站 SOCKS5 代理地址(通知/情报调用)。改后需重启生效。", hot: false },
  { key: "workflow", cat: "other", title: "工作流运行参数", desc: "预算上限、对外 MCP 令牌、审批链接域名等。改后需重启生效。", hot: false },
]

// sectionsFor returns the core config sections belonging to a settings category.
function useSectionsFor(cat) {
  return CONFIG_SECTIONS.filter((s) => s.cat === cat)
}

// 系统代理 — outbound SOCKS5 proxy.
export function SettingsProxyModule({ apiClient, setError }) {
  return (
    <div className="flex flex-col gap-4">
      {useSectionsFor("proxy").map((s) => (
        <SectionEditorCard key={s.key} section={s} apiClient={apiClient} setError={setError} />
      ))}
    </div>
  )
}

// 其他设置 — client-local connection settings, the core notification channels
// (SMTP/钉钉) and the workflow runtime params.
export function SettingsOtherModule({ apiBase, apiKey, onChange, apiClient, setError }) {
  return (
    <div className="flex flex-col gap-4">
      <FrontendSettingsCard apiBase={apiBase} apiKey={apiKey} onChange={onChange} />
      <NotificationChannelsCards apiClient={apiClient} setError={setError} />
      {useSectionsFor("other").map((s) => (
        <SectionEditorCard key={s.key} section={s} apiClient={apiClient} setError={setError} />
      ))}
    </div>
  )
}

// SectionEditorCard edits one app_settings section as JSON. Secret fields come
// back masked as "__SET__"; leaving them unchanged preserves the stored value.
function SectionEditorCard({ section, apiClient, setError }) {
  const path = `/api/v1/settings/${section.key}`
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get(path)
      .then((d) => !cancelled && setText(JSON.stringify(d ?? {}, null, 2)))
      .catch((e) => !cancelled && setError?.(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [apiClient, path, setError])

  async function save() {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setError?.(`JSON 解析失败:${e.message}`)
      return
    }
    setSaving(true)
    try {
      await apiClient.put(path, parsed)
      toast.success(`${section.title} 已保存`)
      const d = await apiClient.get(path)
      setText(JSON.stringify(d ?? {}, null, 2))
    } catch (e) {
      setError?.(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={cardHover}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{section.title}</CardTitle>
          <Badge variant={section.hot ? "default" : "secondary"}>
            {section.hot ? "热生效" : "重启生效"}
          </Badge>
        </div>
        <CardDescription>{section.desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`cfg-${section.key}`}>配置 JSON</FieldLabel>
            <Textarea
              id={`cfg-${section.key}`}
              className="min-h-40 font-mono text-xs"
              value={loading ? "" : text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading || saving}
              spellCheck={false}
            />
            <FieldDescription>
              密钥字段显示为 <code>__SET__</code>,保持不变即保留原值;留空则清除。
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Button onClick={save} disabled={loading || saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

// ── client-only connection settings (unchanged) ──────────────────────────────
function FrontendSettingsCard({ apiBase, apiKey, onChange }) {
  const [localBase, setLocalBase] = useState(apiBase || "")
  const [localKey, setLocalKey] = useState(apiKey || "")

  function handleSave(e) {
    e.preventDefault()
    onChange({ apiBase: localBase.trim(), apiKey: localKey.trim() })
    toast.success("设置已保存到本地")
  }

  return (
    <Card className={cardHover}>
      <CardHeader>
        <CardTitle>前端连接设置</CardTitle>
        <CardDescription>仅保存到本地浏览器状态,不会写入后端</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="apiBase">API base URL</FieldLabel>
              <Input
                id="apiBase"
                value={localBase}
                onChange={(e) => setLocalBase(e.target.value)}
                placeholder="留空走 Vite 代理,或填写完整 http(s)://host:port"
              />
              <FieldDescription>
                默认走 Vite 代理(同源 127.0.0.1:9200)。如需直连 soc-server,
                填写 <code>http://localhost:8080</code>。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="apiKey">X-API-Key (可选)</FieldLabel>
              <Input
                id="apiKey"
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="仅在不使用 JWT 时填写"
                autoComplete="off"
              />
              <FieldDescription>
                拥有 Bearer token 时优先使用 token;X-API-Key 仅在无 token 时发送。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <Alert>
            <AlertDescription>
              修改后需刷新页面生效,因为 <code>apiClient</code> 只在 mount 和
              <code>currentUser</code> 变化时重建。
            </AlertDescription>
          </Alert>
          <Button type="submit" className="self-start">
            <Save data-icon="inline-start" />
            保存
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
