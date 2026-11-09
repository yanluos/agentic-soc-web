// NewCaseDialog — POST /cases, then swap to the one-time token reveal.
// With `ticket` ({id, title}) it is the 工单「发起应急响应」entry (2026-11-09:
// host IR starts from a ticket, not from a 安全事件): the case is linked to the
// ticket (关联工单; the server also copies the ticket's 安全事件 into 关联事件
// and notes the start on the ticket), and ir-triage writes its verdict back
// onto that ticket instead of opening a new one.
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { TokenReveal } from "./TokenReveal.jsx"
import { errMsg, fields, fmtTime } from "./lib.js"

export function NewCaseDialog({ api, open, onOpenChange, onCreated, ticket }) {
  const [name, setName] = useState("")
  const [host, setHost] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  // Pre-fill the case name from the ticket each time the dialog opens.
  useEffect(() => {
    if (open && ticket && !result) {
      setName((n) => n || `工单 #${ticket.id}：${ticket.title || ""}`.slice(0, 80))
    }
  }, [open, ticket, result])

  function reset() {
    setName("")
    setHost("")
    setNote("")
    setResult(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() && !host.trim()) {
      toast.error("请至少填写案例名称或主机名")
      return
    }
    setSaving(true)
    try {
      const r = await api.post("/cases", {
        名称: name.trim() || host.trim(),
        主机名: host.trim(),
        备注: note.trim(),
        ...(ticket ? { ticket_id: String(ticket.id) } : {}),
      })
      setResult(r)
      onCreated?.(r?.case || r)
      toast.success("案例已创建")
    } catch (err) {
      toast.error(errMsg(err, "创建案例失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {result
              ? "案例已创建 · 采集令牌"
              : ticket
                ? `工单 #${ticket.id} · 发起应急响应`
                : "新建应急案例"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "把令牌交给现场人员，在受害主机上运行采集端直传；或稍后在案例页手动上传采集包。"
              : ticket
                ? "为这张工单建应急案例并生成一次性采集令牌；采集包上传后自动研判，结论记回本工单。"
                : "先建案例拿到一次性采集令牌，再到受害主机上运行 socir 采集并上传。"}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <TokenReveal
            api={api}
            token={result.token}
            command={result.command}
            linuxCommand={result.linux_command}
            installLinux={result.install_command_linux}
            installWindows={result.install_command_windows}
            distAvailable={result.dist_available}
            expires={fmtTime(fields(result.case)["令牌过期"])}
          />
        ) : (
          <form id="ir-new-case" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ir-case-name">案例名称</FieldLabel>
                <Input
                  id="ir-case-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：财务部 FIN-PC-042 疑似钓鱼失陷"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ir-case-host">主机名（可选）</FieldLabel>
                <Input
                  id="ir-case-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="采集包上传后会自动回填"
                />
                <FieldDescription>
                  不填则以采集包中的主机名为准。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ir-case-note">备注</FieldLabel>
                <Textarea
                  id="ir-case-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="告警来源、联系人、初步现象…"
                />
              </Field>
            </FieldGroup>
          </form>
        )}
        <DialogFooter>
          {result ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              完成
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" form="ir-new-case" disabled={saving}>
                {saving ? <Spinner data-icon="inline-start" /> : null}
                创建并生成令牌
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
