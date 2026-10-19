// 顶栏插槽:TopBar 在品牌区右侧留一块空位(内容卡片左缘对齐),模块把自己的
// 工具栏 portal 进去,滚动内容时工具栏始终留在顶栏里。AppShell 提供插槽 DOM
// 节点;拿不到(登录页、未挂在 AppShell 下)时 TopBarPortal 原地渲染。
//
// 插槽可嵌套:带标签页的模块把「标题 + TabsList + 子插槽」portal 进顶栏,再用
// <TopBarSlotContext.Provider value={子插槽节点}> 包住标签内容,标签页里的
// TopBarPortal(含 GenericTableModule 的工具栏)就落进子插槽,排在标签后面。

import { createContext, useContext, useState } from "react"
import { createPortal } from "react-dom"

// 远程插件包里打进了本文件的独立副本;复用宿主经 window.__SOC_SDK__ 发布的
// 同一个 context 对象(React 也经 import map 共享),它们的工具栏才进得了顶栏。
// 宿主自身加载本模块时 SDK 还没发布,走 createContext。
const shared =
  typeof window !== "undefined" ? window.__SOC_SDK__?.platform?.TopBarSlotContext : null

export const TopBarSlotContext = shared || createContext(null)

// 插槽节点 state:返回 [node, ref],ref 挂到插槽 div 上,挂载后 node 才非空,
// 消费者随之重渲染进去。
export function useTopBarSlotNode() {
  const [node, setNode] = useState(null)
  return [node, setNode]
}

// enabled=false 原地渲染;hidden=true 什么都不渲染(forceMount 的非活动标签页用)。
export function TopBarPortal({ children, enabled = true, hidden = false }) {
  const slot = useContext(TopBarSlotContext)
  if (hidden) return null
  if (!enabled || !slot) return children
  return createPortal(children, slot)
}
