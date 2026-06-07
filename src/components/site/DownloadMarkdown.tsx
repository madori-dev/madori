'use client'

import { usePathname } from 'next/navigation'

export function DownloadMarkdown() {
  const pathname = usePathname()

  // Extract the slug from /docs/some-slug
  const slug = pathname.replace(/^\/docs\//, '')

  if (!slug || slug === pathname) return null

  const downloadUrl = `/api/docs/${slug}/markdown`

  return (
    <a
      href={downloadUrl}
      download
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="Download this page as Markdown"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export .md
    </a>
  )
}
