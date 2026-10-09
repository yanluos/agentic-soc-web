import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// 密码管理器(1Password / Chrome 等)在**裸 IP origin** 上不做登录字段识别:
// 实测同一个登录页,http://localhost:9200 里 1Password 会在用户名/密码/验证码框
// 显示内联图标并可填充,http://127.0.0.1:9200 里连图标都不出现(条目已存在、
// 保险库已解锁也一样)。所以把同机的 127.0.0.1 / [::1] 页面访问统一 302 到
// localhost —— 只重定向 HTML 导航请求,API/fetch 不动(302 会把 POST 降级成
// GET),局域网 IP 更不能动(那是别人机器上的地址,localhost 指不到这台机)。
function canonicalHostRedirect() {
  const redirect = (req, res, next) => {
    const host = req.headers.host || ""
    const m = /^(?:127\.0\.0\.1|\[::1\])(:\d+)?$/.exec(host)
    const isPageLoad =
      req.method === "GET" && (req.headers.accept || "").includes("text/html")
    if (!m || !isPageLoad) return next()
    res.statusCode = 302
    res.setHeader("Location", `http://localhost${m[1] || ""}${req.url}`)
    res.end()
  }
  return {
    name: "canonical-host-redirect",
    // 块体不返回值:configureServer 返回函数会被 Vite 当作 post 钩子调用
    configureServer(server) {
      server.middlewares.use(redirect)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect)
    },
  }
}

// https://vite.dev/config/
//
// Dev server binds all interfaces (0.0.0.0) on :9200 so office-LAN machines can
// reach it at http://<this-host-ip>:9200. Backend services are reached through
// the Vite proxy so the browser only ever talks to the dev server. The
// AI-specific prefixes must precede the catch-all `/api/v1` rule (more specific
// first).
export default defineConfig({
  plugins: [canonicalHostRedirect(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Modules are React.lazy-split (see src/core/modules.js + src/plugins/*);
    // the remaining main chunk is the shell + vendor.
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true, // 0.0.0.0 — reachable from the office LAN
    port: 9200,
    strictPort: true,
    allowedHosts: true, // accept any Host header (LAN IP / hostname)
    proxy: {
      // soc-ai (must come before /api/v1)
      "/api/v1/workflows": { target: "http://localhost:8081", changeOrigin: true },
      "/api/v1/ai/models": { target: "http://localhost:8081", changeOrigin: true },
      "/api/v1/ai/health": { target: "http://localhost:8081", changeOrigin: true },
      "/api/v1/mcp": { target: "http://localhost:8081", changeOrigin: true },
      "/agent": { target: "http://localhost:8081", changeOrigin: true, ws: true },
      "/mcp": { target: "http://localhost:8081", changeOrigin: true },
      // soc-server
      "/api/v1": { target: "http://localhost:8080", changeOrigin: true },
      "/health": { target: "http://localhost:8080", changeOrigin: true },
      // remote plugins' frontend bundles (soc-server proxies to the plugin)
      "/plugins": { target: "http://localhost:8080", changeOrigin: true },
      // soc-auth
      "/auth": { target: "http://localhost:8090", changeOrigin: true },
      "/users": { target: "http://localhost:8090", changeOrigin: true },
      "/invites": { target: "http://localhost:8090", changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: 9200,
  },
})
