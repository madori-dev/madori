import { marked } from 'marked'

interface AboutTheCreatorBlockProps {
  title: string
  subtitle?: string
  content?: string
}

export async function AboutTheCreatorBlock({
  title,
  subtitle,
  content,
}: AboutTheCreatorBlockProps) {
  const html = content ? await marked.parse(content) : ''

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="space-y-4">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h2>

          {subtitle && (
            <p className="text-lg text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {html && (
          <div
            className="prose dark:prose-invert mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </section>
  )
}
