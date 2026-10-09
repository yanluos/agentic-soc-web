// UploadDialog — browser-side 采集包 upload: multipart POST /cases/{id}/upload
// (field "file"), for hosts that cannot reach the platform directly.
import { useRef, useState } from "react"
import { Upload } from "lucide-react"
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
import { Spinner } from "@/components/ui/spinner"
import { formatBytes } from "@/utils.js"
import { errMsg } from "./lib.js"

export function UploadDialog({ api, caseId, open, onOpenChange, onUploaded }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!file) {
      toast.error("请选择采集包 JSON 文件")
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file, file.name)
      const r = await api.upload(`/cases/${caseId}/upload`, fd)
      toast.success(
        `采集包已入库${r?.findings != null ? `，生成 ${r.findings} 条发现` : ""}`
      )
      onUploaded?.(r)
      onOpenChange(false)
      setFile(null)
    } catch (err) {
      toast.error(errMsg(err, "上传失败"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传采集包</DialogTitle>
          <DialogDescription>
            选择 socir 导出的 scan.json；上传后服务端校验
            schema、物化发现并可自动发起 AI 研判。
          </DialogDescription>
        </DialogHeader>
        <form id="ir-upload" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ir-upload-file">采集包文件</FieldLabel>
              <Input
                id="ir-upload-file"
                ref={inputRef}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <FieldDescription>
                {file
                  ? `${file.name} · ${formatBytes(file.size)}`
                  : "仅接受 JSON；大小上限见插件设置 max_upload_mb"}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="submit" form="ir-upload" disabled={busy || !file}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Upload data-icon="inline-start" />
            )}
            上传并入库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
