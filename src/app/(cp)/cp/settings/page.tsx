'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/cp/PageHeader'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'
import { CapabilityGate } from '@/components/cp/CapabilityGate'

export interface RuntimeSettings {
  site_name: string
  locale: string
  timezone: string
}

export interface MadoriConfigValues {
  contentPath: string
  resourcesPath: string
  usersPath: string
  assetsPath: string
  cp: {
    enabled: boolean
    path: string
  }
  graphql: {
    enabled: boolean
    path: string
    introspection: boolean
  }
  auth: {
    driver: string
    store: string
    provider: string
  }
  sites: { handle: string; url: string; locale: string; default: boolean }[]
  seo: {
    enabled: boolean; metadata: boolean; structuredData: boolean; sitemap: boolean; robots: boolean; humans: boolean; reports: boolean; redirects: boolean; errorTracking: boolean; socialImages: boolean; allowExternalCanonicals: boolean
    allowedRedirectOrigins: string[]; trailingSlash: 'always' | 'never' | 'preserve'; reportRetentionDays: number; reportSnapshotLimit: number; operationalStoragePath: string
  }
  git: {
    enabled: boolean; automatic: boolean; push: boolean; debounceMs: number; trackedPaths: { root: string; exclude: string[] }[]; remote: string; branch?: string; author: { useAuthenticated: boolean; name: string; email: string }; commitPrefix: string; commandTimeoutMs: number; lockTimeoutMs: number; statePath: string
  }
  staticCache: {
    enabled: boolean
    driver: string
    storagePath: string
    exclude: string[]
    queryStrings: string
    warmOnInvalidate: boolean
    invalidationRules: { trigger: string; urls: string[] }[]
  }
}

export default function MadoriSettingsPage() {
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null)
  const [configValues, setConfigValues] = useState<MadoriConfigValues | null>(null)
  const [configForm, setConfigForm] = useState<MadoriConfigValues | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runtimeSaving, setRuntimeSaving] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [pathErrors, setPathErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      try {
        setLoading(true)
        setError(null)

        const [runtimeRes, configRes] = await Promise.all([
          fetch('/api/settings/runtime'),
          fetch('/api/settings/config'),
        ])

        if (!runtimeRes.ok) {
          throw new Error(`Failed to fetch runtime settings: ${runtimeRes.status}`)
        }
        if (!configRes.ok) {
          throw new Error(`Failed to fetch configuration: ${configRes.status}`)
        }

        const runtimeJson = await runtimeRes.json()
        const configJson = await configRes.json()

        if (!cancelled) {
          setRuntimeSettings(runtimeJson.data as RuntimeSettings)
          const config = configJson.data as MadoriConfigValues
          setConfigValues(config)
          setConfigForm(config)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => { cancelled = true }
  }, [])

  function validatePaths(form: MadoriConfigValues): Record<string, string> {
    const errors: Record<string, string> = {}
    const pathFields = [
      { key: 'contentPath', label: 'Content Path' },
      { key: 'resourcesPath', label: 'Resources Path' },
      { key: 'usersPath', label: 'Users Path' },
      { key: 'assetsPath', label: 'Assets Path' },
    ] as const

    for (const { key, label } of pathFields) {
      if (!form[key] || !form[key].trim()) {
        errors[key] = `${label} cannot be empty`
      }
    }

    if (!form.staticCache.storagePath || !form.staticCache.storagePath.trim()) {
      errors['staticCache.storagePath'] = 'Storage Path cannot be empty'
    }

    return errors
  }

  function updateConfigField(path: string, value: string | boolean) {
    if (!configForm) return

    setConfigForm((prev) => {
      if (!prev) return prev
      const updated = { ...prev }

      if (path.includes('.')) {
        const [section, field] = path.split('.') as [keyof MadoriConfigValues, string]
        const sectionValue = updated[section]
        if (typeof sectionValue === 'object' && sectionValue !== null) {
          ;(updated as Record<string, unknown>)[section] = {
            ...(sectionValue as Record<string, unknown>),
            [field]: value,
          }
        }
      } else {
        ;(updated as Record<string, unknown>)[path] = value
      }

      return updated
    })

    // Clear path error when user types
    if (pathErrors[path]) {
      setPathErrors((prev) => {
        const next = { ...prev }
        delete next[path]
        return next
      })
    }
  }

  function updateObject(path: 'sites' | 'seo' | 'git' | 'auth', value: unknown) {
    setConfigForm(current => current ? { ...current, [path]: value } : current)
  }

  function parseLines(value: string): string[] {
    return value.split('\n').map(item => item.trim()).filter(Boolean)
  }

  async function handleConfigSave(e: React.FormEvent) {
    e.preventDefault()
    if (!configForm) return

    const errors = validatePaths(configForm)
    if (Object.keys(errors).length > 0) {
      setPathErrors(errors)
      toast.error('Please fix validation errors before saving')
      return
    }

    setConfigSaving(true)
    setPathErrors({})

    try {
      const res = await fetch('/api/settings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to save configuration: ${res.status}`)
      }

      const json = await res.json()
      setConfigValues(configForm)

      if (json.restartRequired) {
        toast.success('Configuration saved. A server restart is required for changes to take effect.')
      } else {
        toast.success('Configuration saved successfully')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration'
      toast.error(message)
    } finally {
      setConfigSaving(false)
    }
  }

  async function handleRuntimeSave(e: React.FormEvent) {
    e.preventDefault()
    if (!runtimeSettings) return

    const settings = {
      site_name: runtimeSettings.site_name.trim(),
      locale: runtimeSettings.locale.trim(),
      timezone: runtimeSettings.timezone.trim(),
    }
    if (Object.values(settings).some((value) => !value)) {
      toast.error('Site name, locale, and timezone are required')
      return
    }

    setRuntimeSaving(true)
    try {
      const res = await fetch('/api/settings/runtime', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to save site settings: ${res.status}`)
      }
      setRuntimeSettings(settings)
      toast.success('Site settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save site settings')
    } finally {
      setRuntimeSaving(false)
    }
  }

  if (loading) return <ListSkeleton rows={4} />
  if (error && !runtimeSettings && !configValues) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage site settings and configuration values"
      />

      <CapabilityGate resource="settings" action="view" fallback={<ErrorAlert message="You do not have permission to view settings." />}><Tabs defaultValue="runtime">
        <TabsList variant="line" className="mb-5">
          <TabsTrigger value="runtime">Site Settings</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="runtime">
          <Card className="max-w-2xl">
            <CardContent>
              {runtimeSettings ? (
                <form onSubmit={handleRuntimeSave} className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Runtime site settings. Changes take effect immediately without a restart.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="site-name">Site Name</Label>
                    <Input
                      id="site-name"
                      required
                      value={runtimeSettings.site_name}
                      onChange={(event) => setRuntimeSettings((current) => current && ({ ...current, site_name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site-locale">Locale</Label>
                    <Input
                      id="site-locale"
                      required
                      placeholder="en-US"
                      value={runtimeSettings.locale}
                      onChange={(event) => setRuntimeSettings((current) => current && ({ ...current, locale: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site-timezone">Timezone</Label>
                    <Input
                      id="site-timezone"
                      required
                      placeholder="Europe/London"
                      value={runtimeSettings.timezone}
                      onChange={(event) => setRuntimeSettings((current) => current && ({ ...current, timezone: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Use an IANA timezone name, such as Europe/London.</p>
                  </div>
                  <CapabilityGate resource="settings" action="edit"><Button type="submit" disabled={runtimeSaving}>
                    {runtimeSaving ? 'Saving…' : 'Save Site Settings'}
                  </Button></CapabilityGate>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">No runtime settings available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card className="max-w-2xl">
            <CardContent>
              {configForm ? (
                <form onSubmit={handleConfigSave} className="space-y-6">
                  {/* Restart warning banner */}
                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Changes to configuration values require a server restart to take effect.
                    </p>
                  </div>

                  {/* Paths */}
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold">Paths</legend>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="contentPath">Content Path</Label>
                        <Input
                          id="contentPath"
                          value={configForm.contentPath}
                          onChange={(e) => updateConfigField('contentPath', e.target.value)}
                          aria-invalid={!!pathErrors.contentPath}
                          aria-describedby={pathErrors.contentPath ? 'contentPath-error' : undefined}
                        />
                        {pathErrors.contentPath && (
                          <p id="contentPath-error" className="text-xs text-destructive">{pathErrors.contentPath}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="resourcesPath">Resources Path</Label>
                        <Input
                          id="resourcesPath"
                          value={configForm.resourcesPath}
                          onChange={(e) => updateConfigField('resourcesPath', e.target.value)}
                          aria-invalid={!!pathErrors.resourcesPath}
                          aria-describedby={pathErrors.resourcesPath ? 'resourcesPath-error' : undefined}
                        />
                        {pathErrors.resourcesPath && (
                          <p id="resourcesPath-error" className="text-xs text-destructive">{pathErrors.resourcesPath}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="usersPath">Users Path</Label>
                        <Input
                          id="usersPath"
                          value={configForm.usersPath}
                          onChange={(e) => updateConfigField('usersPath', e.target.value)}
                          aria-invalid={!!pathErrors.usersPath}
                          aria-describedby={pathErrors.usersPath ? 'usersPath-error' : undefined}
                        />
                        {pathErrors.usersPath && (
                          <p id="usersPath-error" className="text-xs text-destructive">{pathErrors.usersPath}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="assetsPath">Assets Path</Label>
                        <Input
                          id="assetsPath"
                          value={configForm.assetsPath}
                          onChange={(e) => updateConfigField('assetsPath', e.target.value)}
                          aria-invalid={!!pathErrors.assetsPath}
                          aria-describedby={pathErrors.assetsPath ? 'assetsPath-error' : undefined}
                        />
                        {pathErrors.assetsPath && (
                          <p id="assetsPath-error" className="text-xs text-destructive">{pathErrors.assetsPath}</p>
                        )}
                      </div>
                    </div>
                  </fieldset>

                  {/* Control Panel */}
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold">Control Panel</legend>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="cp-enabled"
                          checked={configForm.cp.enabled}
                          onCheckedChange={(checked) => updateConfigField('cp.enabled', !!checked)}
                        />
                        <Label htmlFor="cp-enabled" className="cursor-pointer">Enabled</Label>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cp-path">Path</Label>
                        <Input
                          id="cp-path"
                          value="/cp"
                          disabled
                        />
                        <p className="text-xs text-muted-foreground">Fixed route in this build; changing it would not create a route.</p>
                      </div>
                    </div>
                  </fieldset>

                  {/* GraphQL */}
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold">GraphQL</legend>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="graphql-enabled"
                          checked={configForm.graphql.enabled}
                          onCheckedChange={(checked) => updateConfigField('graphql.enabled', !!checked)}
                        />
                        <Label htmlFor="graphql-enabled" className="cursor-pointer">Enabled</Label>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="graphql-path">Path</Label>
                        <Input
                          id="graphql-path"
                          value="/api/graphql"
                          disabled
                        />
                        <p className="text-xs text-muted-foreground">Fixed route in this build; changing it would not create a route.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="graphql-introspection"
                          checked={configForm.graphql.introspection}
                          onCheckedChange={(checked) => updateConfigField('graphql.introspection', !!checked)}
                        />
                        <Label htmlFor="graphql-introspection" className="cursor-pointer">Introspection</Label>
                      </div>
                    </div>
                  </fieldset>

                  {/* Auth */}
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold">Auth</legend>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="auth-driver">Driver</Label>
                        <Input
                          id="auth-driver"
                          value={configForm.auth.driver}
                          onChange={(e) => updateConfigField('auth.driver', e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Secret driver, store, and provider options remain server-only and are preserved when saving these selections.</p>
                      <div className="space-y-1.5">
                        <Label htmlFor="auth-store">Store</Label>
                        <Input
                          id="auth-store"
                          value={configForm.auth.store}
                          onChange={(e) => updateConfigField('auth.store', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="auth-provider">Provider</Label>
                        <Input
                          id="auth-provider"
                          value={configForm.auth.provider}
                          onChange={(e) => updateConfigField('auth.provider', e.target.value)}
                        />
                      </div>
                    </div>
                  </fieldset>

                  {/* Static Cache */}
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold">Static Cache</legend>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="staticCache-enabled"
                          checked={configForm.staticCache.enabled}
                          onCheckedChange={(checked) => updateConfigField('staticCache.enabled', !!checked)}
                        />
                        <Label htmlFor="staticCache-enabled" className="cursor-pointer">Enabled</Label>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="staticCache-driver">Driver</Label>
                        <Input
                          id="staticCache-driver"
                          value={configForm.staticCache.driver}
                          onChange={(e) => updateConfigField('staticCache.driver', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="staticCache-storagePath">Storage Path</Label>
                        <Input
                          id="staticCache-storagePath"
                          value={configForm.staticCache.storagePath}
                          onChange={(e) => updateConfigField('staticCache.storagePath', e.target.value)}
                          aria-invalid={!!pathErrors['staticCache.storagePath']}
                          aria-describedby={pathErrors['staticCache.storagePath'] ? 'staticCache-storagePath-error' : undefined}
                        />
                        {pathErrors['staticCache.storagePath'] && (
                          <p id="staticCache-storagePath-error" className="text-xs text-destructive">{pathErrors['staticCache.storagePath']}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="staticCache-queryStrings">Query Strings</Label>
                        <Input
                          id="staticCache-queryStrings"
                          value={configForm.staticCache.queryStrings}
                          onChange={(e) => updateConfigField('staticCache.queryStrings', e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="staticCache-warmOnInvalidate"
                          checked={configForm.staticCache.warmOnInvalidate}
                          onCheckedChange={(checked) => updateConfigField('staticCache.warmOnInvalidate', !!checked)}
                        />
                        <Label htmlFor="staticCache-warmOnInvalidate" className="cursor-pointer">Warm on Invalidate</Label>
                      </div>
                      <div className="space-y-1.5"><Label htmlFor="staticCache-exclude">Excluded paths</Label><Textarea id="staticCache-exclude" value={configForm.staticCache.exclude.join('\n')} onChange={event => updateConfigField('staticCache.exclude', parseLines(event.target.value) as unknown as string)} placeholder="/cp/**&#10;/api/**" /><p className="text-xs text-muted-foreground">One path or glob per line.</p></div>
                      <div className="space-y-2"><Label>Invalidation rules</Label>{configForm.staticCache.invalidationRules.map((rule, index) => <div key={index} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_2fr_auto]"><Input value={rule.trigger} placeholder="Trigger" onChange={event => updateConfigField('staticCache.invalidationRules', configForm.staticCache.invalidationRules.map((item, i) => i === index ? { ...item, trigger: event.target.value } : item) as unknown as string)} /><Input value={rule.urls.join('\n')} placeholder="URLs, one per line" onChange={event => updateConfigField('staticCache.invalidationRules', configForm.staticCache.invalidationRules.map((item, i) => i === index ? { ...item, urls: parseLines(event.target.value) } : item) as unknown as string)} /><Button type="button" variant="ghost" size="sm" onClick={() => updateConfigField('staticCache.invalidationRules', configForm.staticCache.invalidationRules.filter((_, i) => i !== index) as unknown as string)}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => updateConfigField('staticCache.invalidationRules', [...configForm.staticCache.invalidationRules, { trigger: '', urls: [] }] as unknown as string)}>Add rule</Button></div>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-4"><legend className="text-sm font-semibold">Sites</legend><p className="text-xs text-muted-foreground">Exactly one default site is required.</p>{configForm.sites.map((site, index) => <div key={`${site.handle}-${index}`} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_2fr_1fr_auto_auto]"><Input value={site.handle} placeholder="Handle" onChange={event => updateObject('sites', configForm.sites.map((item, i) => i === index ? { ...item, handle: event.target.value } : item))} /><Input value={site.url} placeholder="https://example.com" onChange={event => updateObject('sites', configForm.sites.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /><Input value={site.locale} placeholder="en-US" onChange={event => updateObject('sites', configForm.sites.map((item, i) => i === index ? { ...item, locale: event.target.value } : item))} /><div className="flex items-center gap-2"><Checkbox id={`site-default-${index}`} checked={site.default} onCheckedChange={() => updateObject('sites', configForm.sites.map((item, i) => ({ ...item, default: i === index })))} /><Label htmlFor={`site-default-${index}`}>Default</Label></div><Button type="button" variant="ghost" size="sm" disabled={configForm.sites.length === 1} onClick={() => updateObject('sites', configForm.sites.filter((_, i) => i !== index))}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => updateObject('sites', [...configForm.sites, { handle: '', url: '', locale: 'en-US', default: false }])}>Add site</Button></fieldset>

                  <fieldset className="space-y-4"><legend className="text-sm font-semibold">SEO policy</legend><div className="grid gap-3 sm:grid-cols-2">{(['enabled','metadata','structuredData','sitemap','robots','humans','reports','redirects','errorTracking','socialImages','allowExternalCanonicals'] as const).map(field => <div className="flex items-center gap-2" key={field}><Checkbox id={`seo-${field}`} checked={configForm.seo[field]} onCheckedChange={checked => updateObject('seo', { ...configForm.seo, [field]: !!checked })} /><Label htmlFor={`seo-${field}`} className="cursor-pointer">{field.replace(/([A-Z])/g, ' $1')}</Label></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Trailing slash</Label><Input value={configForm.seo.trailingSlash} onChange={event => updateObject('seo', { ...configForm.seo, trailingSlash: event.target.value })} /></div><div className="space-y-1.5"><Label>Allowed redirect origins</Label><Textarea value={configForm.seo.allowedRedirectOrigins.join('\n')} onChange={event => updateObject('seo', { ...configForm.seo, allowedRedirectOrigins: parseLines(event.target.value) })} /></div></div></fieldset>

                  <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="text-sm font-semibold sm:col-span-3">SEO report storage</legend><div><Label htmlFor="seo-retention">Retention days</Label><Input id="seo-retention" type="number" min="1" value={configForm.seo.reportRetentionDays} onChange={event => updateObject('seo', { ...configForm.seo, reportRetentionDays: Number(event.target.value) })} /></div><div><Label htmlFor="seo-snapshots">Snapshot limit</Label><Input id="seo-snapshots" type="number" min="1" value={configForm.seo.reportSnapshotLimit} onChange={event => updateObject('seo', { ...configForm.seo, reportSnapshotLimit: Number(event.target.value) })} /></div><div><Label htmlFor="seo-storage">Operational storage path</Label><Input id="seo-storage" value={configForm.seo.operationalStoragePath} onChange={event => updateObject('seo', { ...configForm.seo, operationalStoragePath: event.target.value })} /></div></fieldset>

                  <fieldset className="space-y-4"><legend className="text-sm font-semibold">Git synchronization</legend><div className="grid gap-3 sm:grid-cols-3">{(['enabled','automatic','push'] as const).map(field => <div className="flex items-center gap-2" key={field}><Checkbox id={`git-${field}`} checked={configForm.git[field]} onCheckedChange={checked => updateObject('git', { ...configForm.git, [field]: !!checked })} /><Label htmlFor={`git-${field}`} className="cursor-pointer">{field}</Label></div>)}</div><div className="grid gap-3 sm:grid-cols-2">{(['remote','branch','debounceMs','statePath','commitPrefix','commandTimeoutMs','lockTimeoutMs'] as const).map(field => <div className="space-y-1.5" key={field}><Label htmlFor={`git-${field}`}>{field}</Label><Input id={`git-${field}`} value={String(configForm.git[field] ?? '')} onChange={event => updateObject('git', { ...configForm.git, [field]: ['debounceMs','commandTimeoutMs','lockTimeoutMs'].includes(field) ? Number(event.target.value) : event.target.value })} /></div>)}</div><div className="space-y-2"><Label>Tracked roots and exclusions</Label>{configForm.git.trackedPaths.map((tracked, index) => <div key={index} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_2fr_auto]"><Input value={tracked.root} placeholder="content or path" onChange={event => updateObject('git', { ...configForm.git, trackedPaths: configForm.git.trackedPaths.map((item, i) => i === index ? { ...item, root: event.target.value } : item) })} /><Input value={tracked.exclude.join('\n')} placeholder="Exclusions, one per line" onChange={event => updateObject('git', { ...configForm.git, trackedPaths: configForm.git.trackedPaths.map((item, i) => i === index ? { ...item, exclude: parseLines(event.target.value) } : item) })} /><Button type="button" variant="ghost" size="sm" onClick={() => updateObject('git', { ...configForm.git, trackedPaths: configForm.git.trackedPaths.filter((_, i) => i !== index) })}>Remove</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => updateObject('git', { ...configForm.git, trackedPaths: [...configForm.git.trackedPaths, { root: 'content', exclude: [] }] })}>Add root</Button></div><div className="grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-2"><Checkbox id="git-author-auth" checked={configForm.git.author.useAuthenticated} onCheckedChange={checked => updateObject('git', { ...configForm.git, author: { ...configForm.git.author, useAuthenticated: !!checked } })} /><Label htmlFor="git-author-auth">Use authenticated author</Label></div>{(['name','email'] as const).map(field => <div className="space-y-1.5" key={field}><Label>{field}</Label><Input value={configForm.git.author[field]} onChange={event => updateObject('git', { ...configForm.git, author: { ...configForm.git.author, [field]: event.target.value } })} /></div>)}</div></fieldset>

                  {/* Save button */}
                  <CapabilityGate resource="settings" action="edit"><Button type="submit" disabled={configSaving}>
                    {configSaving ? 'Saving…' : 'Save Configuration'}
                  </Button></CapabilityGate>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">No configuration values available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs></CapabilityGate>
    </div>
  )
}
