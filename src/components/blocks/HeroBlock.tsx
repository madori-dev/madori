import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface HeroBlockProps {
  title: string
  subtitle?: string
  primary_button_text?: string
  primary_button_link?: string
  secondary_button_text?: string
  secondary_button_link?: string
}

export function HeroBlock({
  title,
  subtitle,
  primary_button_text,
  primary_button_link,
  secondary_button_text,
  secondary_button_link,
}: HeroBlockProps) {
  return (
    <section className="relative overflow-hidden py-24 md:py-36">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <div className="grid items-center gap-12 grid-cols-12">
          {/* Right on desktop, above on mobile: logo + wordmark */}
          <div className="col-span-full md:col-span-4 flex flex-col items-center justify-center gap-4 order-first md:order-last">
            <Image
              src="/madori_logo.svg"
              alt="MADORI"
              width={180}
              height={180}
              className="dark:invert"
              priority
            />
            <span className="font-heading text-3xl font-bold tracking-wide text-foreground">
              MADORI
            </span>
          </div>

          {/* Left: copy */}
          <div className="col-span-full md:col-span-8 order-last md:order-first">
            <h1 className="font-heading text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>

            {subtitle && (
              <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
                {subtitle}
              </p>
            )}

            {(primary_button_text || secondary_button_text) && (
              <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
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
      </div>
    </section>
  )
}
