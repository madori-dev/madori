interface HtmlEmbedBlockProps {
  html: string
  caption?: string
}

export function HtmlEmbedBlock({ html, caption }: HtmlEmbedBlockProps) {
  if (!html) return null

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div
        className="overflow-hidden rounded-lg [&>iframe]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {caption && (
        <p className="mt-3 text-center text-sm text-muted-foreground">{caption}</p>
      )}
    </section>
  )
}
