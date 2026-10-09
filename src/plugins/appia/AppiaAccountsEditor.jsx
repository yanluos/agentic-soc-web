// Appia 消息外发账号 —— the appia plugin's structured editor for its "appia"
// settings section ({accounts: {<company>: {token,user_id,username,name}}}).
// Tokens come back masked ("__SET__"); sending the mask or a blank keeps the
// stored token, so the field is a write-only password input.
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfiguredBadge, SaveButton, useSection } from "@/platform/settingsUi.jsx"
import { usePluginApi } from "@/platform"

const MASK = "__SET__"

export function AppiaAccountsEditor({ apiClient, setError }) {
  const api = usePluginApi("appia")
  const { data, loading, saving, save } = useSection(apiClient, "appia", setError)
  const [companies, setCompanies] = useState([])
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!api) return
    api
      .get("/companies")
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => setCompanies([]))
  }, [api])

  // Rebuild the form from the (masked) section each time it reloads.
  useEffect(() => {
    if (data === null) return
    const accounts = data?.accounts || {}
    const keys = companies.length ? companies.map((c) => c.key) : Object.keys(accounts)
    setForm(
      keys.map((key) => {
        const a = accounts[key] || {}
        return {
          key,
          domain: companies.find((c) => c.key === key)?.domain || "",
          hasToken: a.token === MASK || (!!a.token && a.token !== ""),
          token: "",
          userId: a.user_id || "",
          username: a.username || "",
          name: a.name || "",
        }
      }),
    )
  }, [data, companies])

  const patch = (key, p) => setForm((f) => f.map((a) => (a.key === key ? { ...a, ...p } : a)))

  async function onSave() {
    const accounts = {}
    for (const a of form) {
      accounts[a.key] = {
        token: a.token.trim() || MASK, // blank ⇒ keep the stored token
        user_id: a.userId.trim(),
        username: a.username.trim(),
        name: a.name.trim(),
      }
    }
    await save({ ...(data || {}), accounts }, "Appia 账号")
  }

  if (loading || !form) return <Skeleton className="h-32 w-full" />

  return (
    <>
      <FieldGroup>
        {form.map((a) => (
          <FieldSet key={a.key}>
            <FieldLegend variant="label" className="flex items-center gap-2">
              {a.key}
              {a.domain ? <Badge variant="outline" className="font-normal">{a.domain}</Badge> : null}
              <ConfiguredBadge ok={a.hasToken} />
            </FieldLegend>
            <Field>
              <FieldLabel htmlFor={`appia-token-${a.key}`}>Token</FieldLabel>
              <Input
                id={`appia-token-${a.key}`}
                type="password"
                value={a.token}
                onChange={(e) => patch(a.key, { token: e.target.value })}
                placeholder={a.hasToken ? "已配置,留空不修改" : "未配置"}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`appia-uid-${a.key}`}>User ID</FieldLabel>
              <Input id={`appia-uid-${a.key}`} value={a.userId} onChange={(e) => patch(a.key, { userId: e.target.value })} autoComplete="off" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`appia-username-${a.key}`}>用户名</FieldLabel>
              <Input
                id={`appia-username-${a.key}`}
                value={a.username}
                onChange={(e) => patch(a.key, { username: e.target.value })}
                placeholder="如 zhenxing.zhou_w"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`appia-name-${a.key}`}>显示名</FieldLabel>
              <Input id={`appia-name-${a.key}`} value={a.name} onChange={(e) => patch(a.key, { name: e.target.value })} placeholder="如 周振兴" autoComplete="off" />
            </Field>
          </FieldSet>
        ))}
      </FieldGroup>
      <SaveButton onClick={onSave} saving={saving} />
    </>
  )
}

export default AppiaAccountsEditor
