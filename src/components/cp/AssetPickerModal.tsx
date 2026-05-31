'use client'

import { useEffect, useRef } from 'react'
import { ChevronRight, Folder, Upload, X } from 'lucide-react'
import { useAssetManager } from './assets/use-asset-manager'
import { Button } from '@/components/ui/button'

interface AssetPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}

export function AssetPickerModal({ open, onClose, onSelect }: AssetPickerModalProps) {
  const {
    assets,
    directories,
    currentDirectory,
    loading,
    uploading,
    error,
    fetchAssets,
    navigateToDirectory,
    uploadFiles,
    setError,
  } = useAssetManager()

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      fetchAssets()
    }
  }, [open, fetchAssets])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    await uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleNavigateUp() {
    const parts = currentDirectory.split('/').filter(Boolean)
    parts.pop()
    navigateToDirectory(parts.join('/'))
  }

  if (!open) return null

  const imageAssets = assets.filter((a) => a.mimeType?.startsWith('image/'))
  const breadcrumbs = currentDirectory ? currentDirectory.split('/').filter(Boolean) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-card shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Select an image</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar: breadcrumbs + upload */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => navigateToDirectory('')}
              className="hover:text-foreground cursor-pointer font-medium"
            >
              Assets
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => navigateToDirectory(breadcrumbs.slice(0, i + 1).join('/'))}
                  className="hover:text-foreground cursor-pointer font-medium"
                >
                  {crumb}
                </button>
              </span>
            ))}
          </nav>

          <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading assets…</p>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {!loading && !error && imageAssets.length === 0 && directories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">No images found.</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Upload an image to get started.</p>
            </div>
          )}

          {!loading && !error && (directories.length > 0 || imageAssets.length > 0) && (
            <div className="space-y-4">
              {/* Back button when inside a directory */}
              {currentDirectory && (
                <button
                  type="button"
                  onClick={handleNavigateUp}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  Back
                </button>
              )}

              {/* Directories */}
              {directories.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {directories.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        const target = currentDirectory ? `${currentDirectory}/${dir}` : dir
                        navigateToDirectory(target)
                      }}
                      className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer"
                    >
                      <Folder className="h-8 w-8 text-blue-500" />
                      <span className="w-full truncate text-center text-xs font-medium text-foreground">
                        {dir}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Images */}
              {imageAssets.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {imageAssets.map((asset) => (
                    <button
                      key={asset.path}
                      type="button"
                      onClick={() => onSelect(`/assets/${asset.path}`)}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border transition-all hover:border-primary hover:ring-2 hover:ring-primary/20 cursor-pointer"
                    >
                      <img
                        src={`/assets/${asset.path}`}
                        alt={asset.filename}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="truncate text-xs text-white">{asset.filename}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
