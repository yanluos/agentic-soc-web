import { useCallback, useEffect, useState } from "react"
import { Plus, RefreshCw, Pencil, ScrollText } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDeleteButton, IconButton, TopBarPortal, cardHover } from "@/platform"

import { fmtAgo, fmtNum } from "./lib.js"

const EMPTY = { ip: "", name: "", type: "其他", enabled: true, note: "" }

export function SourcesTab({ api, setError }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // null | {id?, ...fields}
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get("/sources"))
    } catch (err) {
      setError?.(err.message || "读取来源失败")
    } finally {
      setLoading(false)
    }
  }, [api, setError])

  useEffect(() => {
    load()
  }, [load])

  const types = data?.types || ["其他"]
  const sources = data?.sources || []
  const unreg = data?.unregistered || []

  async function save() {
    setSaving(true)
    try {
      if (editing.id) {
        const { id, ...rest } = editing
        await api.patch(`/sources/${id}`, rest)
        toast.success("来源已更新")
      } else {
        await api.post("/sources", editing)
        toast.success("来源已登记")
      }
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function toggle(s, enabled) {
    try {
      await api.patch(`/sources/${s.id}`, { enabled })
      load()
    } catch (err) {
      toast.error(err.message || "更新失败")
    }
  }

  async function remove(s) {
    await api.delete(`/sources/${s.id}`)
    toast.success(`已删除 ${s.name}`)
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBarPortal>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
            <Plus data-icon="inline-start" />
            登记来源
          </Button>
        </div>
      </TopBarPortal>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-sm">已登记来源 ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sources.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>尚未登记任何来源</EmptyTitle>
                <EmptyDescription>登记后日志按名称归档，静默超时会进健康检查告警。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>最近收到</TableHead>
                  <TableHead className="text-right">24h 条数</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id} className="group">
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-2">
                        {s.name}
                        {s.silent ? (
                          <Badge variant="destructive" className="text-[10px]">
                            静默
                          </Badge>
                        ) : null}
                      </div>
                      {s.note ? <div className="text-[10px] text-muted-foreground">{s.note}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.ip}</TableCell>
                    <TableCell className="text-xs">{s.type}</TableCell>
                    <TableCell className="text-xs">{fmtAgo(s.last_seen)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtNum(s.count_24h)}</TableCell>
                    <TableCell>
                      <Switch checked={!!s.enabled} onCheckedChange={(v) => toggle(s, v)} aria-label="启用" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton color="blue" variant="soft" size="xs" aria-label="编辑" onClick={() => setEditing({ id: s.id, ip: s.ip, name: s.name, type: s.type, enabled: !!s.enabled, note: s.note || "" })}>
                          <Pencil />
                        </IconButton>
                        <ConfirmDeleteButton size="xs" onConfirm={() => remove(s)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-sm">24 小时内出现但未登记的发送方 ({unreg.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unreg.length === 0 ? (
            <p className="px-6 pb-4 text-xs text-muted-foreground">无</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>hostname</TableHead>
                  <TableHead>归类</TableHead>
                  <TableHead>最近收到</TableHead>
                  <TableHead className="text-right">24h 条数</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unreg.map((u) => (
                  <TableRow key={u.ip}>
                    <TableCell className="font-mono text-xs">{u.ip}</TableCell>
                    <TableCell className="text-xs">{u.hostname || "-"}</TableCell>
                    <TableCell className="text-xs">{u.source_type || "-"}</TableCell>
                    <TableCell className="text-xs">{fmtAgo(u.last_seen)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtNum(u.count_24h)}</TableCell>
                    <TableCell>
                      <IconButton
                        color="blue"
                        variant="soft"
                        size="xs"
                        aria-label="登记"
                        onClick={() => setEditing({ ...EMPTY, ip: u.ip, name: u.hostname || u.ip, type: u.source_type === "平台" ? "平台" : "其他" })}
                      >
                        <Plus />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑来源" : "登记来源"}</DialogTitle>
            <DialogDescription>以发送方 IP 识别；名称用于归档与检索过滤。</DialogDescription>
          </DialogHeader>
          {editing ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="src-ip">IP</FieldLabel>
                <Input id="src-ip" value={editing.ip} onChange={(e) => setEditing({ ...editing, ip: e.target.value })} placeholder="10.0.0.1" />
              </Field>
              <Field>
                <FieldLabel htmlFor="src-name">名称</FieldLabel>
                <Input id="src-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="fw-core-01" />
              </Field>
              <Field>
                <FieldLabel>类型</FieldLabel>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger aria-label="类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="src-enabled">启用</FieldLabel>
                <Switch id="src-enabled" checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
                <FieldDescription>停用后视为未登记来源，按未登记策略处理。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="src-note">备注</FieldLabel>
                <Textarea id="src-note" rows={2} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
              </Field>
            </FieldGroup>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving || !editing?.ip || !editing?.name}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
