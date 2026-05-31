import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface BasicCtaBlockProps {
  title: string
  text?: string
  primary_button_text?: string
  primary_button_link?: string
  secondary_button_text?: string
  secondary_button_link?: string
}

export function BasicCtaBlock({
  title,
  text,
  primary_button_text,
  primary_button_link,
  secondary_button_text,
  secondary_button_link,
}: BasicCtaBlockProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl border bg-muted/30 px-8 py-12 text-center md:px-16 md:py-16">
          <h2 className="font-heading text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h2>

          {text && (
            <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
              {text}
            </p>
          )}

          {(primary_button_text || secondary_button_text) && (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primary_button_text && primary_button_link && (
                <Button render={<Link href={primary_button_link} />} nativeButton={false} size="lg" className="cursor-pointer">
                  {primary_button_text}
                </Button>
              )}

              {secondary_button_text && secondary_button_link && (
                <Button
                  render={<Link href={secondary_button_link} />}
                  nativeButton={false}
                  size="lg"
                  variant="outline"
                  className="cursor-pointer"
                >
                  {secondary_button_text}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
