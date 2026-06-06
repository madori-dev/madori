'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/cp/PageHeader'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'

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
  const [configSaving, setConfigSaving] = useState(false)
  const [pathErrors, setPathErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
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

      setRuntimeSettings(runtimeJson.data as RuntimeSettings)
      const config = configJson.data as MadoriConfigValues
      setConfigValues(config)
      setConfigForm(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) return <ListSkeleton rows={4} />
  if (error && !runtimeSettings && !configValues) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage site settings and configuration values"
      />

      <Tabs defaultValue="runtime">
        <TabsList variant="line" className="mb-5">
          <TabsTrigger value="runtime">Site Settings</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="runtime">
          <Card className="max-w-2xl">
            <CardContent>
              {runtimeSettings ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Runtime site settings. Changes take effect immediately without a restart.
                  </p>
                  {/* Form content will be added in task 5.2 */}
                </div>
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
                          value={configForm.cp.path}
                          onChange={(e) => updateConfigField('cp.path', e.target.value)}
                        />
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
                          value={configForm.graphql.path}
                          onChange={(e) => updateConfigField('graphql.path', e.target.value)}
                        />
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
                    </div>
                  </fieldset>

                  {/* Save button */}
                  <Button type="submit" disabled={configSaving}>
                    {configSaving ? 'Saving…' : 'Save Configuration'}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">No configuration values available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
