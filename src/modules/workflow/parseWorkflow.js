import dagre from "@dagrejs/dagre"

// autoLayout assigns left→right positions to graph nodes via dagre. Used by the
// React Flow editor when a node has no persisted position. `nodes`/`edges` may
// use either {id}/{from,to} (backend) or React Flow {id}/{source,target}.
export function autoLayout(nodes, edges, dir = "LR") {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: dir, nodesep: 40, ranksep: 90 })
  const W = 200
  const H = 84
  nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }))
  edges.forEach((e) => {
    const s = e.source ?? e.from
    const t = e.target ?? e.to
    if (s && t) g.setEdge(s, t)
  })
  dagre.layout(g)
  const pos = {}
  nodes.forEach((n) => {
    const p = g.node(n.id)
    pos[n.id] = p ? { x: p.x - W / 2, y: p.y - H / 2 } : { x: 0, y: 0 }
  })
  return pos
}

// Pure workflow graph layout. No React.
//
// `layoutGraph(def)` walks `def.steps` and assigns every step an (x, y)
// position in a left-to-right graph. `parallel` steps fan their children
// vertically; sequential steps share a horizontal lane.

const NODE_W = 168
const NODE_H = 60
const COL_GAP = 56
const ROW_GAP = 18

/**
 * Detect the kind of a step. Steps may be plain tool calls
 * (`{ tool: "..." }`), parallel blocks (`{ parallel: [...] }`), or
 * custom kinds (analyze, approval). The shape mirrors what the
 * `soc-ai` workflow engine expects.
 */
export function stepKind(step) {
  if (!step || typeof step !== "object") return "tool"
  if (step.kind) return step.kind
  if (Array.isArray(step.parallel)) return "parallel"
  if (Array.isArray(step.steps)) return "parallel"
  if (step.type) return step.type
  return "tool"
}

export function nodeLabel(step, index) {
  if (!step) return `#${index + 1}`
  const k = stepKind(step)
  const inner = step.tool || step.parallel_label || step.label || step.name
  if (k === "parallel") return `parallel · ${inner || index + 1}`
  if (k === "analyze") return `analyze · ${inner || index + 1}`
  if (k === "approval") return `approval · ${inner || index + 1}`
  return `tool · ${inner || index + 1}`
}

/**
 * Compute layout.
 * @param {object} def  workflow definition with `{ steps: [...] }`
 * @returns { nodes, edges, width, height, lanes }
 */
export function layoutGraph(def) {
  if (!def || !Array.isArray(def.steps)) {
    return { nodes: [], edges: [], width: 0, height: 0, lanes: 0 }
  }
  const nodes = []
  const edges = []
  let col = 0
  let row = 0
  let maxRow = 0

  function placeNode(step, parentId) {
    const kind = stepKind(step)
    const id = step.id || `step-${nodes.length}`

    if (kind === "parallel" && Array.isArray(step.parallel)) {
      const startRow = row
      const childIds = []
      for (const child of step.parallel) {
        const childId = placeNode(child, id)
        childIds.push(childId)
        row += 1
      }
      // Roll row back to where the parallel node sits at the same column.
      const midRow = Math.floor((startRow + row - 1) / 2)
      nodes.push({
        id,
        name: step.name || step.tool || step.label || id,
        kind,
        label: nodeLabel(step, nodes.length),
        col,
        row: midRow,
        x: col * (NODE_W + COL_GAP),
        y: midRow * (NODE_H + ROW_GAP),
        width: NODE_W,
        height: NODE_H,
        children: childIds,
      })
      maxRow = Math.max(maxRow, row - 1)
      if (parentId) {
        edges.push({ from: parentId, to: id, kind: "parallel" })
      }
    } else {
      const nodeRow = row
      nodes.push({
        id,
        name: step.name || step.tool || step.label || id,
        kind,
        label: nodeLabel(step, nodes.length),
        col,
        row: nodeRow,
        x: col * (NODE_W + COL_GAP),
        y: nodeRow * (NODE_H + ROW_GAP),
        width: NODE_W,
        height: NODE_H,
      })
      maxRow = Math.max(maxRow, nodeRow)
      if (parentId) {
        edges.push({ from: parentId, to: id, kind: "sequential" })
      }
    }
    // After every top-level step, advance the column.
    if (!parentId) {
      col += 1
      row = 0
    }
    return id
  }

  // Connect consecutive top-level steps so the graph shows flow direction.
  let prevTopId = null
  for (const step of def.steps) {
    const id = placeNode(step, null)
    if (prevTopId) edges.push({ from: prevTopId, to: id, kind: "sequential" })
    prevTopId = id
  }

  const width = col * (NODE_W + COL_GAP)
  const height = (maxRow + 1) * (NODE_H + ROW_GAP)
  return { nodes, edges, width, height, lanes: maxRow + 1 }
}

export const WORKFLOW_GRAPH_DIMS = { NODE_W, NODE_H, COL_GAP, ROW_GAP }

/**
 * stepsToGraph converts a linear/`parallel` definition (`def.steps`) into the
 * editor's DAG graph form `{ name, nodes:[{id,type,...}], edges:[{from,to}] }`,
 * so the React Flow module can render legacy YAML definitions too. A `parallel`
 * block fans its children out from the preceding node and back into the next.
 */
export function stepsToGraph(def) {
  if (!def || !Array.isArray(def.steps)) return { name: def?.name, nodes: [], edges: [] }
  const nodes = []
  const edges = []
  let seq = 0
  const newId = () => `s_${seq++}`

  function mkNode(step) {
    const k = stepKind(step)
    const type = k === "parallel" ? "tool" : k === "tool" || k === "analyze" || k === "agent" || k === "approval" || k === "condition" ? k : "tool"
    const id = step.id || newId()
    const node = { id, type, name: step.name || step.tool || step.label || id }
    if (type === "tool") {
      node.tool = step.tool || ""
      if (step.params) node.params = step.params
    }
    if (type === "analyze" || type === "agent") {
      node.prompt = step.prompt || ""
      if (step.input) node.input = step.input
      if (step.model) node.model = step.model
    }
    if (type === "agent" && step.tools) node.tools = step.tools
    if (type === "agent" && step.engine) node.engine = step.engine
    if (type === "approval" && step.notify) node.notify = step.notify
    if (type === "condition") node.condition = step.condition || ""
    return node
  }

  let prev = [] // node ids the next step should connect from
  for (const step of def.steps) {
    const children = stepKind(step) === "parallel" ? step.parallel || step.steps || [] : null
    if (children) {
      const ids = []
      for (const c of children) {
        const cn = mkNode(c)
        nodes.push(cn)
        ids.push(cn.id)
        for (const p of prev) edges.push({ from: p, to: cn.id })
      }
      prev = ids
    } else {
      const n = mkNode(step)
      nodes.push(n)
      for (const p of prev) edges.push({ from: p, to: n.id })
      prev = [n.id]
    }
  }
  return { name: def.name, default_model: def.default_model, nodes, edges }
}
