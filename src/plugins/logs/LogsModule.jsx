// 日志检索 — three tabs over the log-service remote plugin (/api/v1/logs):
//   检索  time range + source/severity/keyword filters, result table, row sheet
//   来源  registered senders (CRUD) + unregistered senders seen in 24h
//   状态  receive counters, queue, retention/partitions, listeners, health items
import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TopBarPortal, TopBarSlotContext, useTopBarSlotNode, prefixedApi } from "@/platform"
import { SearchTab } from "./SearchTab.jsx"
import { SourcesTab } from "./SourcesTab.jsx"
import { StatusTab } from "./StatusTab.jsx"

// NOTE: this is a REMOTE bundle — @/platform is compiled in, so its React
// contexts (PluginContext) are not the host's. Use the props the host passes
// (plugin.api / apiClient) instead of usePluginApi, which would read a context
// nobody provides. TopBarSlotContext is the exception: TopBarSlot.jsx reuses the
// host's context through window.__SOC_SDK__.
export function LogsModule({ apiClient, setError, plugin }) {
  const api = useMemo(() => plugin?.api || prefixedApi(apiClient, "logs"), [plugin, apiClient])
  const [tabSlot, tabSlotRef] = useTopBarSlotNode()
  if (!api) return null
  return (
    <div>
      <Tabs defaultValue="search" className="flex flex-col gap-4">
        <TopBarPortal>
          <div className="flex w-full min-w-0 items-center gap-3">
            <h2 className="shrink-0 text-base font-semibold">日志检索</h2>
            <TabsList>
              <TabsTrigger value="search">检索</TabsTrigger>
              <TabsTrigger value="sources">来源</TabsTrigger>
              <TabsTrigger value="status">状态</TabsTrigger>
            </TabsList>
            <div ref={tabSlotRef} className="flex min-w-0 flex-1 items-center" />
          </div>
        </TopBarPortal>
        <TopBarSlotContext.Provider value={tabSlot}>
          <TabsContent value="search">
            <SearchTab api={api} setError={setError} />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab api={api} setError={setError} />
          </TabsContent>
          <TabsContent value="status">
            <StatusTab api={api} apiClient={apiClient} setError={setError} />
          </TabsContent>
        </TopBarSlotContext.Provider>
      </Tabs>
    </div>
  )
}
