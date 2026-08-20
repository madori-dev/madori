'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SeoSource, SeoSourceKind, SeoValues } from '@/lib/seo/domain'

interface SeoRecordEditorProps {
  value: unknown
  onChange: (value: SeoValues) => void
}

const sourceKinds: Array<{ value: SeoSourceKind; label: string }> = [
  { value: 'inherit', label: 'Inherit defaults' },
  { value: 'literal', label: 'Custom text' },
  { value: 'field', label: 'Content field' },
  { value: 'template', label: 'Template' },
  { value: 'disabled', label: 'Disabled' },
]

function seoValue(value: unknown): SeoValues {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SeoValues : {}
}

function source(value: SeoSource | undefined): SeoSource {
  return value ?? { kind: 'inherit' }
}

function CustomJsonLdFields({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const entries = Object.entries(value).slice(0, 20)
  return <div className="space-y-2 rounded-md border p-3"><Label>Custom JSON-LD properties</Label>{entries.map(([key, item], index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={`${key}-${index}`}><Input aria-label={`JSON-LD property ${index + 1} name`} value={key} maxLength={80} onChange={event => { const next = { ...value }; delete next[key]; if (event.target.value.trim()) next[event.target.value.trim()] = item; onChange(next) }} /><Input aria-label={`JSON-LD property ${index + 1} value`} value={typeof item === 'string' ? item : JSON.stringify(item)} maxLength={500} onChange={event => onChange({ ...value, [key]: event.target.value })} /><Button type="button" variant="ghost" size="sm" onClick={() => { const next = { ...value }; delete next[key]; onChange(next) }}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" disabled={entries.length >= 20} onClick={() => onChange({ ...value, property: '' })}>Add property</Button></div>
}

/** Compact record-level overrides. Values live in regular frontmatter under `seo`. */
export function SeoRecordEditor({ value, onChange }: SeoRecordEditorProps) {
  const seo = seoValue(value)
  const update = (patch: Partial<SeoValues>) => onChange({ ...seo, ...patch })
  const renderSource = (key: 'title' | 'description' | 'canonical', label: string, hint: string) => {
    const current = source(seo[key])
    const updateSource = (patch: Partial<SeoSource>) => update({ [key]: { ...current, ...patch } })
    return (
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center" key={key}>
        <div>
          <Label htmlFor={`seo-${key}`}>{label}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Select
            value={current.kind}
            onValueChange={(value) => {
              const kind = value as SeoSourceKind
              updateSource({ kind, ...(kind === 'inherit' || kind === 'disabled' ? { value: undefined } : {}) })
            }}
          >
            <SelectTrigger aria-label={`${label} source`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{sourceKinds.map(kind => <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input
            id={`seo-${key}`}
            value={current.value ?? ''}
            disabled={current.kind === 'inherit' || current.kind === 'disabled'}
            onChange={(event) => updateSource({ value: event.target.value })}
            placeholder={current.kind === 'field' ? 'title' : current.kind === 'template' ? '{title} | Madori' : label}
          />
        </div>
      </div>
    )
  }

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SEO</CardTitle>
        <p className="text-sm text-muted-foreground">Optional overrides. Leave fields inherited to use site and collection defaults.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {renderSource('title', 'SEO title', 'Search-result title')}
        {renderSource('description', 'Description', 'Search-result summary')}
        {renderSource('canonical', 'Canonical URL', 'Usually inherit')}
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
          <div>
            <Label htmlFor="seo-indexing">Indexing</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Search engine visibility</p>
          </div>
          <Select value={seo.robots?.indexing ?? 'index'} onValueChange={(value) => update({ robots: { ...seo.robots, indexing: value as 'index' | 'noindex' } })}>
            <SelectTrigger id="seo-indexing" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="index">Index</SelectItem><SelectItem value="noindex">No index</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
          <div><Label htmlFor="seo-following">Link following</Label><p className="mt-0.5 text-xs text-muted-foreground">Whether crawlers follow page links</p></div>
          <Select value={seo.robots?.following ?? 'follow'} onValueChange={(value) => update({ robots: { ...seo.robots, following: value as 'follow' | 'nofollow' } })}>
            <SelectTrigger id="seo-following" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="follow">Follow</SelectItem><SelectItem value="nofollow">No follow</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
          <div>
            <Label htmlFor="seo-social-image">Social image</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Asset path or public URL</p>
          </div>
          <Input id="seo-social-image" value={seo.social?.image?.value ?? ''} onChange={(event) => update({ social: { ...seo.social, image: event.target.value ? { kind: 'literal', value: event.target.value } : { kind: 'inherit' } } })} placeholder="assets::social-card.png" />
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center"><Label htmlFor="seo-social-alt">Social image alt text</Label><Input id="seo-social-alt" value={seo.social?.imageAlt?.value ?? ''} onChange={(event) => update({ social: { ...seo.social, imageAlt: event.target.value ? { kind: 'literal', value: event.target.value } : { kind: 'inherit' } } })} /></div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center"><Label htmlFor="seo-twitter-card">Twitter card</Label><Select value={seo.social?.twitterCard ?? 'summary_large_image'} onValueChange={(value) => update({ social: { ...seo.social, twitterCard: value as 'summary' | 'summary_large_image' } })}><SelectTrigger id="seo-twitter-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="summary">Summary</SelectItem><SelectItem value="summary_large_image">Summary with large image</SelectItem></SelectContent></Select></div>
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3"><div className="flex items-center gap-2"><input id="seo-sitemap-enabled" type="checkbox" checked={seo.sitemap?.enabled !== false} onChange={event => update({ sitemap: { ...seo.sitemap, enabled: event.target.checked } })} /><Label htmlFor="seo-sitemap-enabled">Include in sitemap</Label></div><div><Label htmlFor="seo-sitemap-priority">Priority</Label><Input id="seo-sitemap-priority" type="number" min="0" max="1" step="0.1" value={seo.sitemap?.priority ?? ''} onChange={event => update({ sitemap: { ...seo.sitemap, priority: event.target.value === '' ? undefined : Number(event.target.value) } })} /></div><div><Label htmlFor="seo-jsonld-type">Structured-data type</Label><Select value={seo.jsonLd?.type ?? 'WebPage'} onValueChange={value => update({ jsonLd: { ...seo.jsonLd, type: value as NonNullable<SeoValues['jsonLd']>['type'] } })}><SelectTrigger id="seo-jsonld-type"><SelectValue /></SelectTrigger><SelectContent>{['WebPage','Article','Organization','Person','BreadcrumbList','custom'].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="flex items-center gap-2"><input id="seo-jsonld-enabled" type="checkbox" checked={seo.jsonLd?.enabled !== false} onChange={event => update({ jsonLd: { ...seo.jsonLd, enabled: event.target.checked } })} /><Label htmlFor="seo-jsonld-enabled">Enable structured data</Label></div>
        {seo.jsonLd?.type === 'custom' && <CustomJsonLdFields value={seo.jsonLd.custom ?? {}} onChange={custom => update({ jsonLd: { ...seo.jsonLd, custom } })} />}
        <div className="grid gap-2 sm:grid-cols-3">{(['noarchive', 'noimageindex', 'nosnippet'] as const).map(flag => <div className="flex items-center gap-2" key={flag}><input id={`seo-${flag}`} type="checkbox" checked={seo.robots?.[flag] === true} onChange={event => update({ robots: { ...seo.robots, [flag]: event.target.checked } })} /><Label htmlFor={`seo-${flag}`}>{flag}</Label></div>)}</div>
        <div className="grid gap-2 sm:grid-cols-3"><div><Label htmlFor="seo-change-frequency">Change frequency</Label><Select value={seo.sitemap?.changeFrequency ?? 'weekly'} onValueChange={value => update({ sitemap: { ...seo.sitemap, changeFrequency: value as NonNullable<SeoValues['sitemap']>['changeFrequency'] } })}><SelectTrigger id="seo-change-frequency"><SelectValue /></SelectTrigger><SelectContent>{['always','hourly','daily','weekly','monthly','yearly','never'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="seo-twitter-site">Twitter site</Label><Input id="seo-twitter-site" value={seo.social?.twitterSite ?? ''} onChange={event => update({ social: { ...seo.social, twitterSite: event.target.value || undefined } })} /></div><div><Label htmlFor="seo-twitter-creator">Twitter creator</Label><Input id="seo-twitter-creator" value={seo.social?.twitterCreator ?? ''} onChange={event => update({ social: { ...seo.social, twitterCreator: event.target.value || undefined } })} /></div></div>
      </CardContent>
    </Card>
  )
}
