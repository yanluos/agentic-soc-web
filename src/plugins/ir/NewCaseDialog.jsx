// NewCaseDialog — POST /cases, then swap to the one-time token reveal.
import { useState } from "react"
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

export function NewCaseDialog({ api, open, onOpenChange, onCreated }) {
  const [name, setName] = useState("")
  const [host, setHost] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

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
            {result ? "案例已创建 · 采集令牌" : "新建应急案例"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "把令牌交给现场人员，在受害主机上运行采集端直传；或稍后在案例页手动上传采集包。"
              : "先建案例拿到一次性采集令牌，再到受害主机上运行 socir 采集并上传。"}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <TokenReveal
            token={result.token}
            command={result.command}
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
