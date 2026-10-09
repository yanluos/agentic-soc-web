import { Component } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// PluginBoundary keeps one module's crash (or a stale lazy chunk after a
// deploy) from taking the whole shell down. Rendered around every module.
export class PluginBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = String(this.state.error?.message || this.state.error)
    const stale = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>{stale ? "页面已更新，需要刷新" : "该模块加载失败"}</EmptyTitle>
          <EmptyDescription>
            {this.props.moduleId ? <span className="font-mono">{this.props.moduleId} · </span> : null}
            {stale ? "部署了新版本，当前页面引用的资源已失效。" : message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
          {!stale ? (
            <Button variant="ghost" size="sm" onClick={() => this.setState({ error: null })}>
              重试
            </Button>
          ) : null}
        </EmptyContent>
      </Empty>
    )
  }
}
