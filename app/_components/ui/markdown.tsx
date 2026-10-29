import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

/**
 * Renders Markdown written by someone else (web addresses in the text become
 * links, and single line breaks are kept). Raw HTML in the text is shown as
 * text, never rendered, and link addresses are checked by react-markdown (no
 * `javascript:` links). Images are left out so a message can't make the viewer's
 * browser fetch from an address of the author's choosing. The page has no
 * typography styles, so the elements get theirs here.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown
        // gfm links bare web addresses; breaks keeps the line breaks people type
        remarkPlugins={[remarkGfm, remarkBreaks]}
        disallowedElements={['img']}
        components={{
          h1: (p) => <h2 className="text-2xl font-bold" {...strip(p)} />,
          h2: (p) => <h2 className="text-2xl font-bold" {...strip(p)} />,
          h3: (p) => <h3 className="text-xl font-bold" {...strip(p)} />,
          h4: (p) => <h4 className="font-bold" {...strip(p)} />,
          h5: (p) => <h4 className="font-bold" {...strip(p)} />,
          h6: (p) => <h4 className="font-bold" {...strip(p)} />,
          ul: (p) => <ul className="list-disc pl-6" {...strip(p)} />,
          ol: (p) => <ol className="list-decimal pl-6" {...strip(p)} />,
          blockquote: (p) => (
            <blockquote
              className="border-foreground border-l-4 pl-3 opacity-80"
              {...strip(p)}
            />
          ),
          code: (p) => (
            <code className="bg-foreground/10 rounded px-1" {...strip(p)} />
          ),
          pre: (p) => (
            <pre
              className="bg-foreground/10 overflow-x-auto rounded p-3"
              {...strip(p)}
            />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="underline"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// react-markdown passes its syntax-tree node along; it isn't a DOM attribute
function strip<T extends { node?: unknown }>({ node, ...rest }: T) {
  void node
  return rest
}
