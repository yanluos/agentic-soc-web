// 应急响应 (ir) — two-pane module laid out like 工作流: left = the case list
// card (server-side 筛选/排序 through the generic ir_cases table API, the same
// FilterPanel the 安全事件 ledger uses), right = the selected case's detail.
// The module is pinned to the viewport height and each pane scrolls on its
// own: the list is a fixed-width column that never moves with the detail, and
// the detail pane is `min-w-0` so a wide table cannot stretch the page. The
// list folds to a narrow strip (remembered in localStorage).
// Case reads go through /api/v1/tables/ir_cases (reads are never guarded);
// every write still goes to /api/v1/ir via usePluginApi("ir").
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Siren } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import {
  buildTableMetaPath,
  buildTablePath,
  nodeToWhere,
  normalizeNocoRecords,
  usePluginApi,
  useTableViewState,
} from "@/platform"
import { CaseDetail } from "./CaseDetail.jsx"
import { CaseList } from "./CaseList.jsx"
import { NewCaseDialog } from "./NewCaseDialog.jsx"
import { errMsg } from "./lib.js"

const SLUG = "ir_cases"
const PAGE = 200
const DEFAULT_SORT = "-CreatedAt"
const COLLAPSE_KEY = "ir:case-list-collapsed"

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1"
  } catch {
    return false
  }
}

export function IRModule({ apiClient, setError, onNavigate }) {
  const api = usePluginApi("ir")
  const [columns, setColumns] = useState([])
  const [cases, setCases] = useState(null)
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const viewState = useTableViewState(SLUG, columns)
  const reqSeq = useRef(0)

  // ── table meta (drives the FilterPanel / SortPanel column lists) ──
  useEffect(() => {
    if (!apiClient) return
    let cancelled = false
    apiClient
      .get(buildTableMetaPath(SLUG))
      .then((meta) => {
        if (cancelled) return
        const cols = Array.isArray(meta?.columns)
          ? meta.columns
          : meta?.fields || []
        setColumns(cols)
      })
      .catch((err) => setError?.(errMsg(err, "读取案例表结构失败")))
    return () => {
      cancelled = true
    }
  }, [apiClient, setError])

  const where = useMemo(
    () =>
      columns.length ? nodeToWhere(viewState.filterTree, true, columns) : "",
    [viewState.filterTree, columns]
  )

  const load = useCallback(async () => {
    if (!apiClient) return
    const seq = ++reqSeq.current
    setLoading(true)
    try {
      const resp = await apiClient.get(
        buildTablePath(SLUG, {
          limit: PAGE,
          where: where || undefined,
          sort: viewState.sort || DEFAULT_SORT,
        })
      )
      if (seq !== reqSeq.current) return
      const list = normalizeNocoRecords(resp)
      setCases(list)
      setTotal(resp?.pageInfo?.totalRows ?? list.length)
      setActiveId((cur) =>
        cur && list.some((c) => String(c.id) === String(cur))
          ? cur
          : (list[0]?.id ?? null)
      )
    } catch (err) {
      if (seq !== reqSeq.current) return
      setCases([])
      setError?.(errMsg(err, "读取应急案例失败"))
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [apiClient, where, viewState.sort, setError])

  useEffect(() => {
    load()
  }, [load])

  const active = cases?.find((c) => String(c.id) === String(activeId)) || null

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1")
      } catch {
        /* private mode — the fold just isn't remembered */
      }
      return !c
    })
  }

  function patched(row) {
    if (!row?.id) return load()
    setCases((cs) =>
      (cs || []).map((c) =>
        String(c.id) === String(row.id) ? { ...c, ...row } : c
      )
    )
  }

  function deleted(id) {
    setCases((cs) => (cs || []).filter((c) => String(c.id) !== String(id)))
    setTotal((t) => (typeof t === "number" ? Math.max(0, t - 1) : t))
    setActiveId(null)
  }

  return (
    <div className="flex h-[calc(100svh-6rem)] min-w-0 gap-4">
      <div
        className={cn(
          "flex min-h-0 shrink-0 flex-col",
          collapsed ? "w-11" : "w-[300px]"
        )}
      >
        <CaseList
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          cases={cases}
          total={total}
          loading={loading}
          viewState={viewState}
          activeId={activeId}
          onSelect={(c) => setActiveId(c.id)}
          onCreate={() => setCreating(true)}
          onRefresh={load}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {active ? (
          <Card
            className={cn(cardHover, "flex min-h-0 min-w-0 flex-1 flex-col")}
          >
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
              <CaseDetail
                key={active.id}
                api={api}
                caseRow={active}
                onPatched={patched}
                onDeleted={deleted}
                onNavigate={onNavigate}
                setError={setError}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(cardHover, "flex flex-1")}>
            <CardContent className="flex flex-1 items-center justify-center p-12">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Siren />
                  </EmptyMedia>
                  <EmptyTitle>选择或新建一个应急案例</EmptyTitle>
                  <EmptyDescription>
                    新建案例会生成一次性采集令牌；把令牌交给现场人员在受害主机运行
                    socir 即可直传采集包，也可在案例里手动上传。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}
      </div>
      <NewCaseDialog
        api={api}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(c) => {
          load().then(() => c?.id && setActiveId(c.id))
        }}
      />
    </div>
  )
}
