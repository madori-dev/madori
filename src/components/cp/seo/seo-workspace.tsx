'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, ExternalLink, FileWarning, Loader2, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/cp/PageHeader'
import { EmptyState } from '@/components/cp/EmptyState'
import { CapabilityGate } from '@/components/cp/CapabilityGate'
import { apiErrorMessage, seoApi, type NotFoundObservation, type SeoIssue, type SeoRedirect, type SeoSettingsDocument, type SeoSource, type SeoValues } from './api'

export type SeoWorkspaceScreen = 'overview' | 'defaults' | 'redirects' | 'not-found'

const seoNavigation: Array<{ screen: SeoWorkspaceScreen; label: string; href: string }> = [
  { screen: 'overview', label: 'Overview', href: '/cp/seo' },
  { screen: 'defaults', label: 'Defaults', href: '/cp/seo/defaults' },
  { screen: 'redirects', label: 'Redirects', href: '/cp/seo/redirects' },
  { screen: 'not-found', label: '404s', href: '/cp/seo/not-found' },
]

const severityVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = { error: 'destructive', warning: 'secondary', notice: 'outline' }
const defaultValues: SeoValues = { enabled: true, title: { kind: 'inherit' }, description: { kind: 'inherit' } }

function asIssues(value: { issues?: SeoIssue[]; results?: SeoIssue[] } | SeoIssue[]): SeoIssue[] {
  return Array.isArray(value) ? value : value.issues ?? value.results ?? []
}

function sourceValue(source: SeoSource | undefined): string { return source && 'value' in source ? source.value : '' }
function sourceKind(source: SeoSource | undefined): SeoSource['kind'] { return source?.kind ?? 'inherit' }
function source(kind: SeoSource['kind'], value: string): SeoSource { return kind === 'inherit' || kind === 'disabled' ? { kind } : { kind, value } }

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"><span className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}</span><Button size="sm" variant="outline" onClick={retry}><RefreshCw aria-hidden="true" />Try again</Button></div>
}

function Severity({ severity }: { severity: string }) { return <Badge variant={severityVariant[severity] ?? 'outline'}>{severity}</Badge> }

function SourceEditor({ label, value, onChange, limit }: { label: string; value: SeoSource | undefined; onChange: (value: SeoSource) => void; limit?: number }) {
  const kind = sourceKind(value)
  const text = sourceValue(value)
  return <div className="grid gap-2 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:items-start">
    <Label className="pt-2" htmlFor={`seo-${label.toLowerCase().replaceAll(' ', '-')}`}>{label}</Label>
    <div className="space-y-2">
      <Select value={kind} onValueChange={(next) => onChange(source(next as SeoSource['kind'], text))}>
        <SelectTrigger aria-label={`${label} source`} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="inherit">Inherit</SelectItem><SelectItem value="literal">Write text</SelectItem><SelectItem value="field">Use field</SelectItem><SelectItem value="template">Use template</SelectItem><SelectItem value="disabled">Disable</SelectItem></SelectContent>
      </Select>
      {kind !== 'inherit' && kind !== 'disabled' && <div className="space-y-1"><Input id={`seo-${label.toLowerCase().replaceAll(' ', '-')}`} value={text} maxLength={kind === 'literal' ? limit : undefined} onChange={(event) => onChange(source(kind, event.target.value))} placeholder={kind === 'field' ? 'Field handle, e.g. title' : kind === 'template' ? 'Template tokens, e.g. {title}' : `Enter ${label.toLowerCase()}`} />{kind === 'literal' && limit && <p className="text-right text-xs text-muted-foreground" aria-live="polite">{text.length}/{limit} recommended characters</p>}</div>}
      <p className="text-xs text-muted-foreground">{kind === 'inherit' ? 'Uses setting from level above.' : kind === 'disabled' ? `Stops ${label.toLowerCase()} at this level.` : kind === 'field' ? 'Reads matching content field when page is published.' : kind === 'template' ? 'Builds value from approved template tokens.' : 'Uses text exactly as written.'}</p>
    </div>
  </div>
}

function Overview() {
  const [issues, setIssues] = useState<SeoIssue[]>([])
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [running, setRunning] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const [report, health] = await Promise.all([seoApi.report(), seoApi.status()]); setIssues(asIssues(report.data)); setStatus(health.data) }
    catch (cause) { setError(apiErrorMessage(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { queueMicrotask(() => { void load() }) }, [load])
  async function runReport() {
    setRunning(true); setError(null)
    try { await seoApi.runReport(); toast.success('SEO report completed'); await load() }
    catch (cause) { setError(apiErrorMessage(cause)) }
    finally { setRunning(false) }
  }
  const visible = useMemo(() => issues.filter(issue => (severity === 'all' || issue.severity === severity) && `${issue.title} ${issue.description ?? ''} ${issue.url ?? ''}`.toLowerCase().includes(query.toLowerCase())), [issues, query, severity])
  const errors = issues.filter(issue => issue.severity === 'error').length
  const warnings = issues.filter(issue => issue.severity === 'warning').length
  const indexed = typeof status?.indexed === 'number' ? status.indexed : typeof status?.pages === 'number' ? status.pages : null
  return <div className="space-y-6"><div className="space-y-3"><PageHeader title="SEO" description="Health, issues, and discovery signals across published content." /><div className="flex justify-end"><CapabilityGate resource="seo-reports" action="edit"><Button onClick={() => void runReport()} disabled={running}>{running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Run report</Button></CapabilityGate></div></div>
    {error && <ErrorState message={error} retry={() => void load()} />}
    {loading ? <div className="grid gap-4 md:grid-cols-3" aria-label="Loading SEO health"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : <div className="grid gap-4 md:grid-cols-3"><HealthCard title="Errors" value={errors} icon={CircleAlert} tone="destructive" /><HealthCard title="Warnings" value={warnings} icon={AlertTriangle} tone="warning" /><HealthCard title="Published pages" value={indexed ?? '—'} icon={CheckCircle2} tone="default" /></div>}
    <Card><CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Issues needing attention</CardTitle><CardDescription>Filter issues before editing content or defaults.</CardDescription></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search issues" aria-label="Search issues" className="pl-8" /></div><Select value={severity} onValueChange={value => setSeverity(value ?? 'all')}><SelectTrigger aria-label="Filter by severity" className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All levels</SelectItem><SelectItem value="error">Errors</SelectItem><SelectItem value="warning">Warnings</SelectItem><SelectItem value="notice">Notices</SelectItem></SelectContent></Select></div></CardHeader><CardContent className="p-0">{loading ? <div className="space-y-2 p-6"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : visible.length === 0 ? <EmptyState icon={FileWarning} title={issues.length ? 'No matching issues' : 'No issues reported'} description={issues.length ? 'Try a different filter.' : 'Run an SEO report to surface issues here.'} /> : <Table><TableHeader><TableRow><TableHead>Severity</TableHead><TableHead>Issue</TableHead><TableHead className="hidden md:table-cell">Page</TableHead></TableRow></TableHeader><TableBody>{visible.map(issue => <TableRow key={issue.id}><TableCell><Severity severity={issue.severity} /></TableCell><TableCell className="whitespace-normal"><p className="font-medium">{issue.title}</p>{issue.description && <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>}</TableCell><TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">{issue.url ?? '—'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </div>
}

function HealthCard({ title, value, icon: Icon, tone }: { title: string; value: string | number; icon: typeof CheckCircle2; tone: 'destructive' | 'warning' | 'default' }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
  return <Card><CardContent className="flex items-center gap-4 p-5"><div className={`rounded-lg bg-muted p-2 ${color}`}><Icon className="size-5" aria-hidden="true" /></div><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-sm text-muted-foreground">{title}</p></div></CardContent></Card>
}

function ResolvedPreview({ input }: { input: Record<string, unknown> | null }) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function resolve() {
    if (!input) { setError('Choose a scope before loading a preview.'); return }
    setLoading(true); setError(null)
    try { setResult((await seoApi.preview(input)).data) } catch (cause) { setError(apiErrorMessage(cause)) } finally { setLoading(false) }
  }
  const view = result?.view && typeof result.view === 'object' ? result.view as Record<string, unknown> : result
  const metadata = result?.metadata && typeof result.metadata === 'object' ? result.metadata as Record<string, unknown> : null
  const title = typeof view?.title === 'string' ? view.title : typeof metadata?.title === 'string' ? metadata.title : null
  const description = typeof view?.description === 'string' ? view.description : typeof metadata?.description === 'string' ? metadata.description : null
  const canonical = typeof view?.canonical === 'string' ? view.canonical : null
  const social = view?.social && typeof view.social === 'object' ? view.social as Record<string, unknown> : null
  const socialImage = typeof social?.image === 'string' ? social.image : null
  return <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Resolved preview</CardTitle><CardDescription>Uses same resolver as published metadata. Source labels remain in Control Panel only.</CardDescription></div><Button type="button" size="sm" variant="outline" onClick={() => void resolve()} disabled={loading}>{loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Refresh</Button></CardHeader><CardContent>{error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}{!result && !loading ? <p className="text-sm text-muted-foreground">Load preview to check resolved search and social presentation.</p> : loading ? <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div> : <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Search preview</p><p className="mt-2 truncate text-sm text-emerald-700 dark:text-emerald-400">{canonical ?? 'Canonical URL unavailable'}</p><p className="mt-1 text-lg text-primary">{title ?? 'Title unavailable'}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description ?? 'Description unavailable'}</p></div><div className="overflow-hidden rounded-lg border"><div className="flex h-20 items-center justify-center bg-muted text-xs text-muted-foreground">{socialImage ? <span className="truncate px-4">Social image: {socialImage}</span> : 'No resolved social image'}</div><div className="p-3"><p className="line-clamp-1 font-medium">{title ?? 'Title unavailable'}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description ?? 'Description unavailable'}</p>{canonical && <a href={canonical} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Open canonical <ExternalLink className="size-3" aria-hidden="true" /></a>}</div></div></div>}</CardContent></Card>
}

function Defaults() {
  const [kind, setKind] = useState<'site' | 'collection' | 'taxonomy'>('site')
  const [handle, setHandle] = useState('')
  const [records, setRecords] = useState<SeoSettingsDocument[]>([])
  const [values, setValues] = useState<SeoValues>(defaultValues)
  const [revision, setRevision] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { const [sites, collections, taxonomies] = await Promise.all([seoApi.sites(), seoApi.sections('collection'), seoApi.sections('taxonomy')]); setRecords([...sites.data, ...collections.data, ...taxonomies.data]) } catch (cause) { setError(apiErrorMessage(cause)) } finally { setLoading(false) } }, [])
  useEffect(() => { queueMicrotask(() => { void load() }) }, [load])
  const selected = records.find(record => kind === 'site' ? record.kind === 'site' && record.site === handle : record.kind === 'section' && record.section === kind && record.handle === handle)
  const options = records.filter(record => kind === 'site' ? record.kind === 'site' : record.kind === 'section' && record.section === kind).map(record => kind === 'site' ? record.site! : record.handle!)
  function selectScope(nextKind: 'site' | 'collection' | 'taxonomy', nextHandle: string) {
    setKind(nextKind); setHandle(nextHandle)
    const record = records.find(item => nextKind === 'site' ? item.kind === 'site' && item.site === nextHandle : item.kind === 'section' && item.section === nextKind && item.handle === nextHandle)
    setValues(record?.seo ?? defaultValues); setRevision(record?.revision)
  }
  function change<K extends keyof SeoValues>(field: K, value: SeoValues[K]) { setValues(current => ({ ...current, [field]: value })) }
  async function save(event: FormEvent) { event.preventDefault(); if (!handle.trim()) { setError('Choose or enter a scope before saving.'); return } setSaving(true); setError(null); try { const result = kind === 'site' ? await seoApi.saveSite(handle.trim(), values, revision) : await seoApi.saveSection(kind, handle.trim(), values, revision); setRevision(result.data.revision); setValues(result.data.seo); toast.success('SEO defaults saved'); await load() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setSaving(false) } }
  async function reset() { if (!handle.trim() || !selected) return; setSaving(true); try { if (kind === 'site') await seoApi.deleteSite(handle.trim(), revision); else await seoApi.deleteSection(kind, handle.trim(), revision); setValues(defaultValues); setRevision(undefined); toast.success('SEO defaults reset to inherited values'); await load() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setSaving(false) } }
  return <div className="space-y-6"><PageHeader title="SEO defaults" description="Set defaults once, then inherit them through collections, taxonomies, and content." />{error && <ErrorState message={error} retry={() => void load()} />}
    <Card><CardHeader><CardTitle>Choose scope</CardTitle><CardDescription>Only explicit values override a higher-level setting. Inherit keeps cascade intact.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="seo-scope-kind">Scope type</Label><Select value={kind} onValueChange={next => selectScope((next ?? 'site') as typeof kind, '')}><SelectTrigger id="seo-scope-kind" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="site">Site</SelectItem><SelectItem value="collection">Collection</SelectItem><SelectItem value="taxonomy">Taxonomy</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="seo-scope-handle">{kind === 'site' ? 'Site handle' : `${kind === 'collection' ? 'Collection' : 'Taxonomy'} handle`}</Label><Input id="seo-scope-handle" list="seo-scope-options" value={handle} onChange={event => selectScope(kind, event.target.value)} placeholder="Choose or enter a handle" /><datalist id="seo-scope-options">{options.map(option => <option key={option} value={option} />)}</datalist><p className="text-xs text-muted-foreground">Choose saved defaults or type a new safe handle.</p></div></CardContent></Card>
    {loading ? <Skeleton className="h-[34rem]" /> : <div className="space-y-6"><form onSubmit={save}><Card><CardHeader><CardTitle>Default metadata</CardTitle><CardDescription>{selected ? 'Editing saved defaults.' : 'New scope. Values start as inherited.'}</CardDescription></CardHeader><CardContent className="space-y-6"><div className="flex items-center gap-3"><input id="seo-enabled" type="checkbox" checked={values.enabled !== false} onChange={event => change('enabled', event.target.checked)} className="size-4 accent-primary" /><Label htmlFor="seo-enabled">Enable SEO at this scope</Label></div><SourceEditor label="Title" value={values.title} onChange={value => change('title', value)} limit={60} /><SourceEditor label="Description" value={values.description} onChange={value => change('description', value)} limit={160} /><SourceEditor label="Canonical URL" value={values.canonical} onChange={value => change('canonical', value)} /><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="defaults-indexing">Indexing</Label><Select value={values.robots?.indexing ?? 'index'} onValueChange={value => change('robots', { ...values.robots, indexing: value as 'index' | 'noindex' })}><SelectTrigger id="defaults-indexing"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="index">Index</SelectItem><SelectItem value="noindex">No index</SelectItem></SelectContent></Select></div><div><Label htmlFor="defaults-sitemap-priority">Sitemap priority</Label><Input id="defaults-sitemap-priority" type="number" min="0" max="1" step="0.1" value={values.sitemap?.priority ?? ''} onChange={event => change('sitemap', { ...values.sitemap, priority: event.target.value ? Number(event.target.value) : undefined })} /></div><div><Label htmlFor="defaults-jsonld">Structured-data type</Label><Select value={values.jsonLd?.type ?? 'WebPage'} onValueChange={value => change('jsonLd', { ...values.jsonLd, type: value as NonNullable<SeoValues['jsonLd']>['type'] })}><SelectTrigger id="defaults-jsonld"><SelectValue /></SelectTrigger><SelectContent>{['WebPage','Article','Organization','Person','BreadcrumbList','custom'].map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div></div>{values.jsonLd?.type === 'custom' && <div className="space-y-2 rounded-md border p-3"><Label>Custom JSON-LD properties</Label>{Object.entries(values.jsonLd.custom ?? {}).slice(0, 20).map(([key, value], index, entries) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={`${key}-${index}`}><Input value={key} maxLength={80} onChange={event => { const next = Object.fromEntries(entries); delete next[key]; if (event.target.value.trim()) next[event.target.value.trim()] = value; change('jsonLd', { ...values.jsonLd, custom: next }) }} /><Input value={typeof value === 'string' ? value : JSON.stringify(value)} maxLength={500} onChange={event => change('jsonLd', { ...values.jsonLd, custom: { ...values.jsonLd?.custom, [key]: event.target.value } })} /><Button type="button" size="sm" variant="ghost" onClick={() => { const next = { ...values.jsonLd?.custom }; delete next[key]; change('jsonLd', { ...values.jsonLd, custom: next }) }}>Remove</Button></div>)}<Button type="button" size="sm" variant="outline" disabled={Object.keys(values.jsonLd.custom ?? {}).length >= 20} onClick={() => change('jsonLd', { ...values.jsonLd, custom: { ...values.jsonLd?.custom, property: '' } })}>Add property</Button></div>}<div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3"><div className="flex items-center gap-2"><input id="defaults-following" type="checkbox" checked={values.robots?.following !== 'nofollow'} onChange={event => change('robots', { ...values.robots, following: event.target.checked ? 'follow' : 'nofollow' })} /><Label htmlFor="defaults-following">Follow links</Label></div>{(['noarchive','noimageindex','nosnippet'] as const).map(flag => <div className="flex items-center gap-2" key={flag}><input id={`defaults-${flag}`} type="checkbox" checked={values.robots?.[flag] === true} onChange={event => change('robots', { ...values.robots, [flag]: event.target.checked })} /><Label htmlFor={`defaults-${flag}`}>{flag}</Label></div>)}<div className="flex items-center gap-2"><input id="defaults-sitemap-enabled" type="checkbox" checked={values.sitemap?.enabled !== false} onChange={event => change('sitemap', { ...values.sitemap, enabled: event.target.checked })} /><Label htmlFor="defaults-sitemap-enabled">Sitemap enabled</Label></div><div><Label htmlFor="defaults-change-frequency">Change frequency</Label><Select value={values.sitemap?.changeFrequency ?? 'weekly'} onValueChange={value => change('sitemap', { ...values.sitemap, changeFrequency: value as NonNullable<SeoValues['sitemap']>['changeFrequency'] })}><SelectTrigger id="defaults-change-frequency"><SelectValue /></SelectTrigger><SelectContent>{['always','hourly','daily','weekly','monthly','yearly','never'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-2"><input id="defaults-jsonld-enabled" type="checkbox" checked={values.jsonLd?.enabled !== false} onChange={event => change('jsonLd', { ...values.jsonLd, enabled: event.target.checked })} /><Label htmlFor="defaults-jsonld-enabled">JSON-LD enabled</Label></div></div><div className="grid gap-3 sm:grid-cols-2"><SourceEditor label="Social image" value={values.social?.image} onChange={value => change('social', { ...values.social, image: value })} /><SourceEditor label="Social image alt" value={values.social?.imageAlt} onChange={value => change('social', { ...values.social, imageAlt: value })} /><div><Label htmlFor="defaults-twitter-card">Twitter card</Label><Select value={values.social?.twitterCard ?? 'summary_large_image'} onValueChange={value => change('social', { ...values.social, twitterCard: value as 'summary' | 'summary_large_image' })}><SelectTrigger id="defaults-twitter-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="summary">Summary</SelectItem><SelectItem value="summary_large_image">Large image</SelectItem></SelectContent></Select></div><Input value={values.social?.twitterSite ?? ''} onChange={event => change('social', { ...values.social, twitterSite: event.target.value || undefined })} placeholder="@site" /><Input value={values.social?.twitterCreator ?? ''} onChange={event => change('social', { ...values.social, twitterCreator: event.target.value || undefined })} placeholder="@creator" /></div><div className="flex items-center justify-between gap-3"><CapabilityGate resource="seo-defaults" action="edit"><Button type="button" variant="outline" disabled={saving || !selected} onClick={() => void reset()}>Reset to inherited</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Save defaults</Button></CapabilityGate></div></CardContent></Card></form><ResolvedPreview input={handle ? kind === 'site' ? { site: handle } : { section: kind, handle } : null} /></div>}
  </div>
}

function Redirects() {
  const [redirects, setRedirects] = useState<SeoRedirect[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<SeoRedirect>({ id: '', site: '', source: '', destination: '', status: 301, enabled: true })
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRedirects((await seoApi.redirects()).data) } catch (cause) { setError(apiErrorMessage(cause)) } finally { setLoading(false) } }, [])
  useEffect(() => { queueMicrotask(() => { void load() }) }, [load])
  async function submit(event: FormEvent) { event.preventDefault(); if (!draft.id || !draft.site || !draft.source || !draft.destination) { setError('ID, site, source, and destination are required.'); return } setSaving(true); setError(null); try { await seoApi.saveRedirect(draft, draft.revision); toast.success('Redirect saved'); setDraft({ id: '', site: '', source: '', destination: '', status: 301, enabled: true }); await load() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setSaving(false) } }
  async function remove(redirect: SeoRedirect) { try { await seoApi.deleteRedirect(redirect.id, redirect.revision); toast.success('Redirect deleted'); await load() } catch (cause) { setError(apiErrorMessage(cause)) } }
  return <div className="space-y-6"><PageHeader title="Redirects" description="Publish safe path-to-path redirects without editing application routes." />{error && <ErrorState message={error} retry={() => void load()} />}
    <Card><CardHeader><CardTitle>Add redirect</CardTitle><CardDescription>Source and local destination must start with a slash. External destinations require an approved URL.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 lg:grid-cols-6"><div className="space-y-2"><Label htmlFor="redirect-id">ID</Label><Input id="redirect-id" value={draft.id} onChange={event => setDraft(current => ({ ...current, id: event.target.value }))} placeholder="old-page" /></div><div className="space-y-2"><Label htmlFor="redirect-site">Site</Label><Input id="redirect-site" value={draft.site} onChange={event => setDraft(current => ({ ...current, site: event.target.value }))} placeholder="en" /></div><div className="space-y-2 lg:col-span-2"><Label htmlFor="redirect-source">From</Label><Input id="redirect-source" value={draft.source} onChange={event => setDraft(current => ({ ...current, source: event.target.value }))} placeholder="/old-page" /></div><div className="space-y-2 lg:col-span-2"><Label htmlFor="redirect-destination">To</Label><Input id="redirect-destination" value={draft.destination} onChange={event => setDraft(current => ({ ...current, destination: event.target.value }))} placeholder="/new-page" /></div><div className="space-y-2"><Label htmlFor="redirect-status">Status</Label><Select value={String(draft.status)} onValueChange={value => setDraft(current => ({ ...current, status: Number(value) as SeoRedirect['status'] }))}><SelectTrigger id="redirect-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[301,302,307,308].map(status => <SelectItem key={status} value={String(status)}>{status}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><CapabilityGate resource="seo-redirects" action="edit"><Button type="submit" disabled={saving} className="w-full">{saving && <Loader2 className="animate-spin" aria-hidden="true" />}Save redirect</Button></CapabilityGate></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Published redirects</CardTitle></CardHeader><CardContent className="p-0">{loading ? <div className="space-y-2 p-6"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : redirects.length === 0 ? <EmptyState title="No redirects" description="Create one above when a published URL changes." /> : <Table><TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Status</TableHead><TableHead className="w-24"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{redirects.map(redirect => <TableRow key={redirect.id}><TableCell className="font-mono text-xs">{redirect.source}</TableCell><TableCell className="font-mono text-xs">{redirect.destination}</TableCell><TableCell><Badge variant={redirect.enabled ? 'outline' : 'secondary'}>{redirect.status}{redirect.enabled ? '' : ' disabled'}</Badge></TableCell><TableCell><CapabilityGate resource="seo-redirects" action="edit"><div className="flex"><Button size="icon-sm" variant="ghost" aria-label={`Edit redirect ${redirect.source}`} onClick={() => setDraft(redirect)}>Edit</Button><Button size="icon-sm" variant="ghost" aria-label={`Delete redirect ${redirect.source}`} onClick={() => void remove(redirect)}><Trash2 aria-hidden="true" /></Button></div></CapabilityGate></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></div>
}

function NotFound() {
  const [records, setRecords] = useState<NotFoundObservation[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [destination, setDestination] = useState<Record<string, string>>({}); const [working, setWorking] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRecords((await seoApi.notFound()).data) } catch (cause) { setError(apiErrorMessage(cause)) } finally { setLoading(false) } }, [])
  useEffect(() => { queueMicrotask(() => { void load() }) }, [load])
  async function promote(record: NotFoundObservation) { const target = destination[record.opaqueId]?.trim(); if (!target) { setError('Enter a destination before creating a redirect.'); return } setWorking(record.opaqueId); try { await seoApi.promoteNotFound({ site: record.site, source: record.path, destination: target, opaqueId: record.opaqueId, status: 301 }); toast.success('Redirect created from 404 observation'); setDestination(current => ({ ...current, [record.opaqueId]: '' })); await load() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setWorking(null) } }
  async function remove(record: NotFoundObservation) { setWorking(record.opaqueId); try { await seoApi.deleteNotFound(record.opaqueId); toast.success('404 observation deleted'); await load() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setWorking(null) } }
  return <div className="space-y-6"><PageHeader title="404 observations" description="Aggregate missing-page signals. Queries, referrer paths, and visitor data are not retained." />{error && <ErrorState message={error} retry={() => void load()} />}<Card><CardContent className="p-0">{loading ? <div className="space-y-2 p-6"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : records.length === 0 ? <EmptyState title="No 404 observations" description="Missing-page signals will appear here after visitors encounter them." /> : <Table><TableHeader><TableRow><TableHead>Missing page</TableHead><TableHead className="hidden md:table-cell">Hits</TableHead><TableHead>Promote to redirect</TableHead></TableRow></TableHeader><TableBody>{records.map(record => <TableRow key={record.opaqueId}><TableCell className="font-mono text-xs">{record.path}<p className="mt-1 font-sans text-xs text-muted-foreground">{record.site} · {record.hits} hit{record.hits === 1 ? '' : 's'}</p></TableCell><TableCell className="hidden tabular-nums md:table-cell">{record.hits}</TableCell><TableCell className="min-w-60"><div className="flex gap-2"><Input aria-label={`Destination for ${record.path}`} value={destination[record.opaqueId] ?? ''} onChange={event => setDestination(current => ({ ...current, [record.opaqueId]: event.target.value }))} placeholder="/new-page" /><CapabilityGate resource="seo-errors" action="edit"><Button size="sm" disabled={working === record.opaqueId} onClick={() => void promote(record)}>{working === record.opaqueId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}Promote</Button><Button size="sm" variant="ghost" aria-label={`Delete 404 observation ${record.path}`} disabled={working === record.opaqueId} onClick={() => void remove(record)}><Trash2 aria-hidden="true" /></Button></CapabilityGate></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></div>
}

export function SeoWorkspace({ screen }: { screen: SeoWorkspaceScreen }) {
  const content = screen === 'defaults' ? <Defaults />
    : screen === 'redirects' ? <Redirects />
      : screen === 'not-found' ? <NotFound />
        : <Overview />
  return <div className="space-y-6">
    <nav aria-label="SEO sections" className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
      {seoNavigation.map(item => <Link
        key={item.screen}
        href={item.href}
        aria-current={screen === item.screen ? 'page' : undefined}
        className={`min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${screen === item.screen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
      >{item.label}</Link>)}
    </nav>
    {content}
  </div>
}
