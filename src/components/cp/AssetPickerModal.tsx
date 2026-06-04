'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Check,
  ChevronRight,
  File,
  FileText,
  Folder,
  Music,
  Search,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { useAssetManager } from './assets/use-asset-manager'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDisplayMode, getFileTypeIcon } from '@/lib/content/asset-display'

/**
 * Map file-type icon names (from getFileTypeIcon) to Lucide components.
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-text': FileText,
  archive: Archive,
  video: Video,
  music: Music,
  file: File,
}

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
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null)

  // Filter assets by search query (filename match)
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets
    const query = searchQuery.toLowerCase()
    return assets.filter((a) => a.filename.toLowerCase().includes(query))
  }, [assets, searchQuery])

  // Filter directories by search query
  const filteredDirectories = useMemo(() => {
    if (!searchQuery.trim()) return directories
    const query = searchQuery.toLowerCase()
    return directories.filter((d) => d.toLowerCase().includes(query))
  }, [directories, searchQuery])

  useEffect(() => {
    if (open) {
      fetchAssets()
      setSearchQuery('')
      setSelectedAssetPath(null)
      // Store the element that had focus before the modal opened
      previousFocusRef.current = document.activeElement as HTMLElement
      // Focus the close button when modal opens
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus()
      })
    } else {
      // Restore focus when modal closes
      previousFocusRef.current?.focus()
    }
  }, [open, fetchAssets])

  // Trap focus within the modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        const firstFocusable = focusableElements[0]
        const lastFocusable = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault()
            lastFocusable?.focus()
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault()
            firstFocusable?.focus()
          }
        }
      }
    },
    [onClose]
  )

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
    setSearchQuery('')
    setSelectedAssetPath(null)
  }

  function handleConfirmSelection() {
    if (selectedAssetPath) {
      onSelect(`/assets/${selectedAssetPath}`)
      onClose()
    }
  }

  if (!open) return null

  const breadcrumbs = currentDirectory ? currentDirectory.split('/').filter(Boolean) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-picker-title"
        className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-card shadow-xl border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="asset-picker-title" className="text-lg font-semibold text-foreground">Select an asset</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close asset picker"
            className="rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar: breadcrumbs + search + upload */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3 gap-3">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <button
              type="button"
              onClick={() => { navigateToDirectory(''); setSearchQuery(''); setSelectedAssetPath(null) }}
              className="hover:text-foreground cursor-pointer font-medium"
            >
              Assets
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => { navigateToDirectory(breadcrumbs.slice(0, i + 1).join('/')); setSearchQuery(''); setSelectedAssetPath(null) }}
                  className="hover:text-foreground cursor-pointer font-medium"
                >
                  {crumb}
                </button>
              </span>
            ))}
          </nav>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedAssetPath(null) }}
              className="pl-8 h-8 text-sm"
              aria-label="Search files by name"
            />
          </div>

          <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
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

          {!loading && !error && filteredAssets.length === 0 && filteredDirectories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {searchQuery ? (
                <>
                  <p className="text-sm text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Try a different search term.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No assets found.</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Upload a file to get started.</p>
                </>
              )}
            </div>
          )}

          {!loading && !error && (filteredDirectories.length > 0 || filteredAssets.length > 0) && (
            <div className="space-y-4">
              {/* Back button when inside a directory */}
              {currentDirectory && !searchQuery && (
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
              {filteredDirectories.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {filteredDirectories.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        const target = currentDirectory ? `${currentDirectory}/${dir}` : dir
                        navigateToDirectory(target)
                        setSearchQuery('')
                        setSelectedAssetPath(null)
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

              {/* Assets (images + non-images) */}
              {filteredAssets.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {filteredAssets.map((asset) => {
                    const isImage = getDisplayMode(asset.mimeType) === 'thumbnail'
                    const isSelected = selectedAssetPath === asset.path
                    const iconName = getFileTypeIcon(asset.mimeType)
                    const IconComponent = ICON_MAP[iconName] || File

                    return (
                      <button
                        key={asset.path}
                        type="button"
                        onClick={() => setSelectedAssetPath(asset.path)}
                        onDoubleClick={() => {
                          onSelect(`/assets/${asset.path}`)
                          onClose()
                        }}
                        aria-pressed={isSelected}
                        className={`group relative aspect-square overflow-hidden rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary hover:ring-2 hover:ring-primary/20'
                        }`}
                      >
                        {/* Selection indicator */}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </div>
                        )}

                        {isImage ? (
                          <img
                            src={`/assets/${asset.path}`}
                            alt={asset.alt || asset.filename}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/40">
                            <IconComponent className="h-8 w-8 text-muted-foreground" />
                            <span className="text-[10px] font-medium uppercase text-muted-foreground/80">
                              {asset.extension}
                            </span>
                          </div>
                        )}

                        {/* Filename overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="truncate text-xs text-white">{asset.filename}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with selection confirmation */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {selectedAssetPath
              ? <span className="truncate">Selected: <span className="font-medium text-foreground">{assets.find(a => a.path === selectedAssetPath)?.filename}</span></span>
              : 'Click to select, double-click to confirm'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedAssetPath}
              onClick={handleConfirmSelection}
            >
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
