// Compact markdown renderer for long text (研判结论 / 处置建议 / 详情)
// inside event cards. GFM enabled; styled with semantic tokens so it
// follows the theme. Distinct from FloatingAi's chat renderer, which carries
// its own chat-bubble-tuned component map.

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownText({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="my-1 leading-relaxed first:mt-0 last:mb-0">{children}</p>
        ),
        a: ({ children, href }) => (
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
