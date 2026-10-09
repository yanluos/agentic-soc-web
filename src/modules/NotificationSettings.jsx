// 通知渠道（核心）—— SMTP 发件邮箱 + 钉钉群机器人，即 soc-server notify 中枢的
// 两个核心通道。两段共享一份表单 state：后端只有一个 PUT
// /api/v1/settings/notification 且是全量覆盖（空密钥 = 保留），任一卡片的保存都会
// 提交完整两段。Appia 账号已迁到 appia 插件自己的分区（插件管理页）。
import { useCallback, useEffect, useState } from "react"
import { Bell, Mail } from "lucide-react"
import { toast } from "sonner"

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ConfiguredBadge, GroupCard, SaveButton } from "@/platform/settingsUi.jsx"

const NOTIF_PATH = "/api/v1/settings/notification"

// Map the masked notification GET view into editable form state. Secrets aren't
// returned, so we keep empty password/token fields for new input and a has_*
// flag to drive the "已配置，留空不修改" placeholder.
function toNotifForm(d) {
  return {
    smtp: {
      host: d?.smtp?.host || "",
      port: d?.smtp?.port || 465,
      username: d?.smtp?.username || "",
      from: d?.smtp?.from || "",
      hasPassword: !!d?.smtp?.has_password,
      password: "",
      caCert: d?.smtp?.ca_cert || "",
      tlsInsecureSkipVerify: !!d?.smtp?.tls_insecure_skip_verify,
    },
    dingtalk: {
      hasWebhook: !!d?.dingtalk?.has_webhook,
      hasSecret: !!d?.dingtalk?.has_secret,
      webhookUrl: "",
      secret: "",
    },
  }
}

export function NotificationChannelsCards({ apiClient, setError }) {
  const [notif, setNotif] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get(NOTIF_PATH)
      .then((d) => !cancelled && setNotif(toNotifForm(d)))
      .catch((e) => !cancelled && setError?.(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [apiClient, setError])

  // One PUT covers both sections; empty secrets are kept server-side. Reload
  // afterwards to refresh has_* flags and clear typed secrets.
  const save = useCallback(async () => {
    if (!notif) return
    setSaving(true)
    try {
      await apiClient.put(NOTIF_PATH, {
        smtp: {
          host: notif.smtp.host.trim(),
          port: Number(notif.smtp.port) || 0,
          username: notif.smtp.username.trim(),
          from: notif.smtp.from.trim(),
          password: notif.smtp.password,
          // Always sent: the backend treats an omitted field as "keep stored",
          // and silently dropping these once turned certificate verification
          // off on the channel that carries the SMTP password.
          ca_cert: notif.smtp.caCert,
          tls_insecure_skip_verify: notif.smtp.tlsInsecureSkipVerify,
        },
        dingtalk: {
          webhook_url: notif.dingtalk.webhookUrl.trim(),
          secret: notif.dingtalk.secret.trim(),
        },
      })
      toast.success("通知渠道已保存")
      const d = await apiClient.get(NOTIF_PATH)
      setNotif(toNotifForm(d))
    } catch (e) {
      setError?.(e.message)
    } finally {
      setSaving(false)
    }
  }, [apiClient, notif, setError])

  const patchSmtp = (patch) => setNotif((f) => ({ ...f, smtp: { ...f.smtp, ...patch } }))
  const patchDingtalk = (patch) => setNotif((f) => ({ ...f, dingtalk: { ...f.dingtalk, ...patch } }))

  return (
    <>
      <GroupCard
        icon={Mail}
        title="发件邮箱（SMTP）"
        description="工作流 send_email 与人工审批通知的发件账号（notify 通道 email）"
        badges={notif ? [<ConfiguredBadge key="ok" ok={notif.smtp.hasPassword} />] : null}
      >
        {loading || !notif ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="smtp-host">SMTP 服务器</FieldLabel>
                <Input id="smtp-host" value={notif.smtp.host} onChange={(e) => patchSmtp({ host: e.target.value })} placeholder="smtp.example.com" />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-port">端口</FieldLabel>
                <Input id="smtp-port" type="number" value={notif.smtp.port} onChange={(e) => patchSmtp({ port: e.target.value })} placeholder="465" />
                <FieldDescription>常用 465(SSL)或 587(STARTTLS)。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-username">用户名</FieldLabel>
                <Input id="smtp-username" value={notif.smtp.username} onChange={(e) => patchSmtp({ username: e.target.value })} autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-password">密码</FieldLabel>
                <Input
                  id="smtp-password"
                  type="password"
                  value={notif.smtp.password}
                  onChange={(e) => patchSmtp({ password: e.target.value })}
                  placeholder={notif.smtp.hasPassword ? "已配置,留空不修改" : "未配置"}
                  autoComplete="new-password"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-from">发件人地址</FieldLabel>
                <Input id="smtp-from" value={notif.smtp.from} onChange={(e) => patchSmtp({ from: e.target.value })} placeholder="留空则用用户名" />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-ca-cert">CA 证书 (PEM)</FieldLabel>
                <Textarea
                  id="smtp-ca-cert"
                  value={notif.smtp.caCert}
                  onChange={(e) => patchSmtp({ caCert: e.target.value })}
                  placeholder="留空 = 用系统根证书校验(公网 relay 通常如此)"
                  rows={4}
                  className="font-mono text-xs"
                />
                <FieldDescription>
                  内网自签证书的 relay 在此粘贴其 CA 证书(扩展信任)或服务器证书本身(精确 pin);可粘贴多段。留空则只用系统根证书。
                </FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Switch id="smtp-tls-skip" checked={notif.smtp.tlsInsecureSkipVerify} onCheckedChange={(v) => patchSmtp({ tlsInsecureSkipVerify: !!v })} />
                <FieldLabel htmlFor="smtp-tls-skip">关闭证书校验(不安全)</FieldLabel>
                <FieldDescription>打开后接受任何证书,中间人可窃取 SMTP 密码与邮件内容。仅用于临时排障,自签场景请改用上面的 CA 证书。</FieldDescription>
              </Field>
            </FieldGroup>
            <SaveButton onClick={save} saving={saving} />
          </>
        )}
      </GroupCard>

      <GroupCard
        icon={Bell}
        title="钉钉机器人"
        description="工作流 send_dingtalk / send_notification 与审批通知的群机器人 Webhook（notify 通道 dingtalk）"
        badges={notif ? [<ConfiguredBadge key="ok" ok={notif.dingtalk.hasWebhook} />] : null}
      >
        {loading || !notif ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dingtalk-webhook">Webhook 地址</FieldLabel>
                <Input
                  id="dingtalk-webhook"
                  value={notif.dingtalk.webhookUrl}
                  onChange={(e) => patchDingtalk({ webhookUrl: e.target.value })}
                  placeholder={notif.dingtalk.hasWebhook ? "已配置,留空不修改" : "https://oapi.dingtalk.com/robot/send?access_token=..."}
                  autoComplete="off"
                />
                <FieldDescription>
                  在钉钉群「群设置 → 智能群助手 → 添加机器人(自定义)」中创建;地址中的 access_token 即机器人凭据,保存后不再回显;留空表示沿用已保存的地址。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="dingtalk-secret">加签密钥(可选)</FieldLabel>
                <Input
                  id="dingtalk-secret"
                  type="password"
                  value={notif.dingtalk.secret}
                  onChange={(e) => patchDingtalk({ secret: e.target.value })}
                  placeholder={notif.dingtalk.hasSecret ? "已配置,留空不修改" : "SEC 开头的一串字符"}
                  autoComplete="off"
                />
                <FieldDescription>仅当机器人「安全设置」选择了加签时填写;选关键词或 IP 白名单时留空即可。</FieldDescription>
              </Field>
            </FieldGroup>
            <SaveButton onClick={save} saving={saving} />
          </>
        )}
      </GroupCard>
    </>
  )
}
