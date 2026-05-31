import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureItem {
  _type: string
  feature_name: string
  feature_description?: string
  feature_icon?: string
}

interface FeaturesGridBlockProps {
  title?: string
  subtitle?: string
  features?: FeatureItem[]
}

function getIcon(name?: string): LucideIcon | null {
  if (!name) return null
  // Normalize: "layers" -> "Layers", "file-text" -> "FileText"
  const normalized = name
    .split(/[-_\s]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')

  const icons = LucideIcons as unknown as Record<string, LucideIcon>
  return icons[normalized] ?? null
}

export function FeaturesGridBlock({
  title,
  subtitle,
  features,
}: FeaturesGridBlockProps) {
  const items = Array.isArray(features) ? features : []

  if (items.length === 0 && !title) return null

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {(title || subtitle) && (
          <div className="mx-auto max-w-2xl text-center">
            {title && (
              <h2 className="font-heading text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-4 text-balance text-lg text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="mx-auto mt-12 grid max-w-4xl gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => {
              const Icon = getIcon(item.feature_icon)

              return (
                <div
                  key={index}
                  className="flex flex-col gap-3 bg-background p-8"
                >
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="size-4 text-[#FD2A12]"
                        aria-hidden
                      />
                    )}
                    <h3 className="text-sm font-medium text-foreground">
                      {item.feature_name}
                    </h3>
                  </div>
                  {item.feature_description && (
                    <p className="text-sm text-muted-foreground">
                      {item.feature_description}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
