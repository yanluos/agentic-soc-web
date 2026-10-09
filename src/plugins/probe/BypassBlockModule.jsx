// Bypass block management — two tabs: probe devices and bypass blocks.
// Tabs are both always mounted (just hidden) so internal state survives
// tab switches.

import { useCallback, useEffect, useRef, useState } from "react"
import { ListFilter, Plus, Pencil, RefreshCw, GitCompare } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Card, CardContent } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FilterPanel } from "@/modules/table/FilterPanel.jsx"
import { countClauses, emptyTree, nodeToWhere } from "@/modules/table/filterOps.js"

const DEVICE_STATUS_VARIANT = {
  online: "default",
  auth_failed: "destructive",
  unreachable: "destructive",
  disabled: "secondary",
}

const BLOCK_STATUS_VARIANT = {
  pending: "warning",
  synced: "success",
  failed: "destructive",
}

const BLOCK_TIMEOUT_PRESETS = [
  { value: -1, label: "永久" },
  { value: 3600, label: "1 小时" },
  { value: 21600, label: "6 小时" },
  { value: 86400, label: "24 小时" },
]

const BLOCK_TYPES = [
  { value: "ip", label: "IP" },
  { value: "domain", label: "域名" },
]

export function BypassBlockModule({ apiClient, setError }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">旁路阻断</h2>
        <p className="text-sm text-muted-foreground">管理探针设备和阻断规则</p>
      </div>
      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">探针设备</TabsTrigger>
          <TabsTrigger value="blocks">阻断规则</TabsTrigger>
        </TabsList>
        <TabsContent value="devices" forceMount className="hidden data-[state=active]:block">
          <DevicesTab apiClient={apiClient} setError={setError} />
        </TabsContent>
        <TabsContent value="blocks" forceMount className="hidden data-[state=active]:block">
          <BlocksTab apiClient={apiClient} setError={setError} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Devices ─────────────────────────────────────────────────────────────

function DevicesTab({ apiClient, setError }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.get("/api/v1/probe/devices/status")
      setDevices(Array.isArray(list) ? list : list?.devices || [])
    } catch (err) {
      setError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, setError])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw data-icon="inline-start" />
          刷新
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          新增探针
        </Button>
      </div>
      <Card className={cardHover}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>序列号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无探针
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="font-mono text-xs">{d.ip}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {d.serial || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={DEVICE_STATUS_VARIANT[d.status] || "outline"}>
                        {d.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {d.enabled ? (
                        <Badge variant="secondary">启用</Badge>
                      ) : (
                        <Badge variant="outline">禁用</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          color="gray"
                          variant="soft"
                          size="sm"
                          onClick={() => setEditTarget(d)}
                          aria-label="编辑"
                        >
                          <Pencil />
                        </IconButton>
                        <ConfirmDeleteButton
                          variant="soft"
                          size="sm"
                          onConfirm={async () => {
                            try {
                              await apiClient.delete(`/api/v1/probe/devices/${d.id}`)
                              toast.success("已删除")
                              reload()
                            } catch (err) {
                              setError?.(err.message)
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeviceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新增探针"
        onSubmit={async (body) => {
          try {
            await apiClient.post("/api/v1/probe/devices", body)
            toast.success("已创建")
            setCreateOpen(false)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />
      <DeviceDialog
        open={!!editTarget}
        target={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title={editTarget ? `编辑 ${editTarget.name}` : "编辑"}
        onSubmit={async (body) => {
          try {
            await apiClient.patch(`/api/v1/probe/devices/${editTarget.id}`, body)
            toast.success("已保存")
            setEditTarget(null)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />
    </>
  )
}

function DeviceDialog({ open, onOpenChange, target, title, onSubmit }) {
  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [serial, setSerial] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (target) {
        setName(target.name || "")
        setIp(target.ip || "")
        setSerial(target.serial || "")
        setEnabled(!!target.enabled)
      } else {
        setName("")
        setIp("")
        setSerial("")
        setEnabled(true)
      }
    }
  }, [open, target])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>配置探针设备的网络信息和启用状态</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              const body = { name, ip, enabled }
              if (serial) body.serial = serial
              await onSubmit(body)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dev-name">名称</FieldLabel>
              <Input
                id="dev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dev-ip">IP</FieldLabel>
              <Input
                id="dev-ip"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                required
                placeholder="10.0.0.1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dev-serial">序列号 (可选)</FieldLabel>
              <Input
                id="dev-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
              <FieldDescription>用于登录探针的凭据</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="dev-enabled"
                checked={enabled}
                onCheckedChange={(c) => setEnabled(!!c)}
              />
              <FieldLabel htmlFor="dev-enabled">启用</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Blocks ──────────────────────────────────────────────────────────────

const BLOCKS_PAGE_SIZE = 50

// Column specs for the shared FilterPanel (same shape the generic table
// module derives from /meta): field = the NocoDB column, filter = which
// operator set applies, options feed the select value dropdowns.
const BLOCK_FILTER_COLUMNS = [
  { field: "名称", label: "名称", filter: "text" },
  { field: "目标", label: "目标", filter: "text" },
  {
    field: "类型",
    label: "类型",
    filter: "select",
    options: BLOCK_TYPES.map((t) => ({ value: t.value, label: t.label })),
  },
  {
    field: "状态",
    label: "状态",
    filter: "select",
    options: [
      { value: "pending", label: "待同步 pending" },
      { value: "synced", label: "已同步 synced" },
      { value: "failed", label: "失败 failed" },
    ],
  },
  { field: "目标探针", label: "目标探针", filter: "text" },
  { field: "已封禁探针", label: "已封禁探针", filter: "text" },
  { field: "时长秒", label: "时长秒", filter: "number" },
  { field: "创建人", label: "创建人", filter: "text" },
  { field: "错误信息", label: "错误信息", filter: "text" },
  { field: "CreatedAt", label: "创建时间", filter: "date" },
]

function BlocksTab({ apiClient, setError }) {
  const [devices, setDevices] = useState([])
  const [blocks, setBlocks] = useState([])
  const [total, setTotal] = useState(null)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileData, setReconcileData] = useState(null)
  // Committed filter tree drives the query; the popover edits a draft that
  // lands here only when the popover closes (same UX as the generic table).
  const [filterTree, setFilterTree] = useState(() => emptyTree())
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState(filterTree)
  const [page, setPage] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const sigRef = useRef("") // signature of the active query (where)
  const lastQueryRef = useRef("")
  const filterCount = countClauses(filterTree)

  // Devices only feed the create dialog — load once.
  useEffect(() => {
    apiClient
      .get("/api/v1/probe/devices")
      .then((devs) => setDevices(Array.isArray(devs) ? devs : devs?.devices || []))
      .catch((err) => setError?.(err.message))
  }, [apiClient, setError])

  const loadBlocks = useCallback(async () => {
    const where = nodeToWhere(filterTree, true, BLOCK_FILTER_COLUMNS)
    // Query changed while scrolled to a later page: wait for the page-reset
    // effect to bring us to page 1 before fetching (avoids a stale append).
    if (sigRef.current !== where && page !== 1) return
    sigRef.current = where
    const key = `${where}|${page}|${reloadToken}`
    if (lastQueryRef.current === key) return
    lastQueryRef.current = key

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(BLOCKS_PAGE_SIZE),
        page: String(page),
        sort: "-CreatedAt",
      })
      if (where) params.set("where", where)
      const blks = await apiClient.get(`/api/v1/probe/blocks?${params.toString()}`)
      const { rows, total: totalRows, hasNext: more } = normalizeBlocks(blks)
      // page 1 replaces; later pages append (infinite scroll).
      setBlocks((prev) => (page === 1 ? rows : [...prev, ...rows]))
      setTotal(totalRows)
      setHasNext(more)
    } catch (err) {
      setError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, setError, page, filterTree, reloadToken])

  useEffect(() => {
    loadBlocks()
  }, [loadBlocks])

  // Reset to the first page when the filter changes.
  useEffect(() => {
    setPage(1)
  }, [filterTree])

  // Reload from the top (after a mutation or manual refresh).
  const reload = useCallback(() => {
    sigRef.current = ""
    lastQueryRef.current = ""
    setPage(1)
    setReloadToken((t) => t + 1)
  }, [])

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNext && !loading) {
          setPage((p) => p + 1)
        }
      },
      { rootMargin: "300px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNext, loading])

  async function runReconcile() {
    try {
      const data = await apiClient.post("/api/v1/probe/blocks/reconcile")
      setReconcileData(data)
      setReconcileOpen(true)
      reload()
    } catch (err) {
      setError?.(err.message)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">阻断规则</h3>
          {typeof total === "number" ? (
            <span className="text-xs text-muted-foreground">共 {total} 条</span>
          ) : null}
        </div>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Popover
          open={filterOpen}
          onOpenChange={(open) => {
            if (open) setFilterDraft(filterTree)
            else {
              setFilterTree(filterDraft)
              setPage(1)
            }
            setFilterOpen(open)
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <ListFilter />
              筛选
              {filterCount > 0 ? (
                <Badge variant="secondary" className="ml-1">
                  {filterCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[600px] p-3" align="start">
            <FilterPanel
              tree={filterDraft}
              columns={BLOCK_FILTER_COLUMNS}
              onChange={setFilterDraft}
            />
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            color="blue"
            size="sm"
            onClick={reload}
            disabled={loading}
            aria-label="刷新"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </IconButton>
          <Button variant="outline" size="sm" onClick={runReconcile}>
            <GitCompare data-icon="inline-start" />
            对账
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            新增阻断
          </Button>
        </div>
      </div>
      <Card className={cardHover}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>目标</TableHead>
                <TableHead>已封禁探针</TableHead>
                <TableHead>时长</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && blocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              ) : blocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {filterCount > 0 ? "没有匹配筛选条件的阻断规则" : "暂无阻断规则"}
                  </TableCell>
                </TableRow>
              ) : (
                blocks.map((b) => (
                  <TableRow key={b.id} className={b.status === "failed" ? "bg-destructive/5" : undefined}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.object}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={b.doneProbes.length >= b.targetProbes.length ? "success" : "warning"}>
                          已封禁 {b.doneProbes.length}/{b.targetProbes.length}
                        </Badge>
                        {b.doneProbes.length ? (
                          <span className="max-w-52 truncate text-xs text-muted-foreground">
                            {b.doneProbes.join("、")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {b.timeout === -1 ? "永久" : `${Math.round(b.timeout / 3600)}h`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={BLOCK_STATUS_VARIANT[b.status] || "outline"}>
                        {b.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {b.status === "failed" ? (
                          <IconButton
                            color="blue"
                            variant="soft"
                            size="sm"
                            aria-label="重试"
                            onClick={async () => {
                              try {
                                await apiClient.post(
                                  `/api/v1/probe/blocks/${b.id}/retry`,
                                )
                                toast.success("已重试")
                                reload()
                              } catch (err) {
                                setError?.(err.message)
                              }
                            }}
                          >
                            <RefreshCw />
                          </IconButton>
                        ) : null}
                        <ConfirmDeleteButton
                          variant="soft"
                          size="sm"
                          onConfirm={async () => {
                            try {
                              await apiClient.delete(`/api/v1/probe/blocks/${b.id}`)
                              toast.success("已删除")
                              reload()
                            } catch (err) {
                              setError?.(err.message)
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
        {loading ? (
          <span className="flex items-center gap-1">
            <Spinner data-icon="inline-start" /> 加载中…
          </span>
        ) : hasNext ? (
          <span>向下滚动加载更多</span>
        ) : blocks.length > 0 ? (
          <span>已全部加载 · 共 {total ?? blocks.length} 条</span>
        ) : null}
      </div>

      <BlockDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        devices={devices}
        onSubmit={async (body) => {
          try {
            await apiClient.post("/api/v1/probe/blocks", body)
            toast.success("已创建")
            setCreateOpen(false)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

      <ReconcileDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        data={reconcileData}
      />
    </>
  )
}

// The blocks list is a NocoDB v3 passthrough: records carry Chinese-keyed
// `fields`, pageInfo.totalRows is the filtered total across all pages, and
// `next` is the cursor of the following page (empty on the last one).
function normalizeBlocks(raw) {
  let records = []
  if (Array.isArray(raw)) records = raw
  else if (Array.isArray(raw?.records)) records = raw.records
  else if (Array.isArray(raw?.list)) records = raw.list
  else if (Array.isArray(raw?.data)) records = raw.data
  const totalRows = raw?.pageInfo?.totalRows
  return {
    rows: records.map(projectBlock),
    total: typeof totalRows === "number" ? totalRows : null,
    hasNext:
      (typeof raw?.next === "string" && raw.next !== "") ||
      raw?.pageInfo?.hasNextPage === true,
  }
}

function toNameArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean)
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean)
  return []
}

function projectBlock(rec) {
  const f = rec?.fields || rec || {}
  return {
    id: String(rec?.id ?? f.Id ?? ""),
    name: f["名称"] ?? "",
    type: f["类型"] ?? "",
    object: f["目标"] ?? "",
    timeout: Number(f["时长秒"] ?? 0),
    status: f["状态"] ?? "",
    error: f["错误信息"] ?? "",
    targetProbes: toNameArray(f["目标探针"]),
    doneProbes: toNameArray(f["已封禁探针"]),
  }
}

function BlockDialog({ open, onOpenChange, devices, onSubmit }) {
  const [targetProbes, setTargetProbes] = useState([])
  const [blockName, setBlockName] = useState("")
  const [blockType, setBlockType] = useState("ip")
  const [blockObject, setBlockObject] = useState("")
  const [timeout, setTimeout] = useState(3600)
  const [redirectIp, setRedirectIp] = useState("")
  const [redirectDomain, setRedirectDomain] = useState("")
  const [isTpd, setIsTpd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTargetProbes(devices.map((d) => d.name))
      setBlockName("")
      setBlockType("domain")
      setBlockObject("")
      setTimeout(-1)
      setRedirectIp("39.98.202.203")
      setRedirectDomain("security-warning.appia.vip")
      setIsTpd(false)
    }
  }, [open, devices])

  const probeNames = devices.map((d) => d.name)
  const allSelected = probeNames.length > 0 && targetProbes.length === probeNames.length
  function toggleProbe(name, on) {
    setTargetProbes((prev) => (on ? [...prev, name] : prev.filter((n) => n !== name)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增阻断</DialogTitle>
          <DialogDescription>按域名/IP 维度封禁，可选多个目标探针</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (targetProbes.length === 0) return
            setSubmitting(true)
            try {
              const body = {
                target_probes: targetProbes,
                block_name: blockName,
                block_type: blockType,
                block_object: blockObject,
                block_timeout: Number(timeout),
                is_tpd: isTpd ? 1 : 0,
              }
              if (redirectIp) body.redirect_ip = redirectIp
              if (redirectDomain) body.redirect_domain = redirectDomain
              await onSubmit(body)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>目标探针 ({targetProbes.length}/{probeNames.length})</FieldLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTargetProbes(allSelected ? [] : probeNames)}
                >
                  {allSelected ? "清空" : "全选"}
                </Button>
              </div>
              <ScrollArea className="h-40 rounded-md border">
                <div className="flex flex-col gap-2 p-3">
                  {devices.map((d) => (
                    <label
                      key={d.id}
                      htmlFor={`tp-${d.id}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={`tp-${d.id}`}
                        checked={targetProbes.includes(d.name)}
                        onCheckedChange={(c) => toggleProbe(d.name, !!c)}
                      />
                      <span>{d.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{d.ip}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </Field>
            <Field>
              <FieldLabel htmlFor="blk-name">名称</FieldLabel>
              <Input
                id="blk-name"
                value={blockName}
                onChange={(e) => setBlockName(e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>类型</FieldLabel>
                <Select value={blockType} onValueChange={setBlockType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="blk-obj">目标</FieldLabel>
                <Input
                  id="blk-obj"
                  value={blockObject}
                  onChange={(e) => setBlockObject(e.target.value)}
                  placeholder={blockType === "ip" ? "10.0.0.5" : "example.com"}
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>时长</FieldLabel>
              <Select
                value={String(timeout)}
                onValueChange={(v) => setTimeout(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TIMEOUT_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {blockType === "ip" ? (
              <Field>
                <FieldLabel htmlFor="blk-rd-redirect-ip">重定向 IP (可选)</FieldLabel>
                <Input
                  id="blk-rd-redirect-ip"
                  value={redirectIp}
                  onChange={(e) => setRedirectIp(e.target.value)}
                  placeholder="192.0.2.1"
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="blk-rd-redirect-dom">重定向域名 (可选)</FieldLabel>
                <Input
                  id="blk-rd-redirect-dom"
                  value={redirectDomain}
                  onChange={(e) => setRedirectDomain(e.target.value)}
                  placeholder="block.example.com"
                />
              </Field>
            )}
            <Field orientation="horizontal">
              <Switch
                id="blk-tpd"
                checked={isTpd}
                onCheckedChange={(c) => setIsTpd(!!c)}
              />
              <FieldLabel htmlFor="blk-tpd">TPD 模式</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting || targetProbes.length === 0}>
              {submitting ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReconcileDialog({ open, onOpenChange, data }) {
  if (!data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>对账结果</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">无数据</p>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>对账结果</DialogTitle>
          <DialogDescription>展示数据库记录与探针之间的差异</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {data.reports?.length ? null : (
            <p className="text-sm text-muted-foreground">无启用的探针。</p>
          )}
          {data.reports?.map((p) => (
            <Card key={p.probe_ip} className={cardHover}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{p.probe_ip}</span>
                  <Badge variant="outline">
                    缺失 {p.missing_on_probe?.length || 0} · 仅存 {p.only_on_probe?.length || 0}
                  </Badge>
                </div>
                {p.errors?.map((e, i) => (
                  <p key={i} className="mt-1 text-xs text-destructive">
                    错误: {e}
                  </p>
                ))}
                {p.missing_on_probe?.length ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">
                      数据库存在但探针缺失（已重置 pending 等待重推）
                    </p>
                    <ul className="text-xs">
                      {p.missing_on_probe.map((m, i) => (
                        <li key={i} className="font-mono">· {m.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {p.only_on_probe?.length ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">
                      探针存在但数据库无记录（请运营核查）
                    </p>
                    <ul className="text-xs">
                      {p.only_on_probe.map((m, i) => (
                        <li key={i} className="font-mono">
                          · {m.block_name}（{m.block_id}）
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BypassBlockModule
