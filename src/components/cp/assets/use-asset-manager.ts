'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { Asset } from '@/lib/types'
import {
  validateUploadFile,
  DEFAULT_UPLOAD_CONSTRAINTS,
  type UploadConstraints,
} from '@/lib/content/upload-constraints'

export interface DirectoryListing {
  assets: Asset[]
  directories: string[]
}

export type UploadFileStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface UploadFileProgress {
  id: string
  filename: string
  progress: number // 0-100
  status: UploadFileStatus
  error?: string
  asset?: Asset
}

export interface AssetManagerState {
  assets: Asset[]
  directories: string[]
  currentDirectory: string
  selectedPaths: Set<string>
  loading: boolean
  uploading: boolean
  error: string | null
  uploadQueue: UploadFileProgress[]
}

export function useAssetManager() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [directories, setDirectories] = useState<string[]>([])
  const [currentDirectory, setCurrentDirectory] = useState<string>('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadFileProgress[]>([])
  const uploadIdCounter = useRef(0)

  const fetchAssets = useCallback(async (directory?: string) => {
    try {
      setLoading(true)
      setError(null)
      const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
      const res = await fetch(`/api/assets${params}`)
      if (!res.ok) throw new Error(`Failed to fetch assets: ${res.status}`)
      const json = await res.json()
      setAssets(json.data ?? [])
      setDirectories(json.directories ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [])

  const navigateToDirectory = useCallback(async (dir: string) => {
    setCurrentDirectory(dir)
    setSelectedPaths(new Set())
    await fetchAssets(dir || undefined)
  }, [fetchAssets])

  const uploadFiles = useCallback(async (files: File[], constraints: UploadConstraints = DEFAULT_UPLOAD_CONSTRAINTS) => {
    if (!files.length) return
    setUploading(true)
    setError(null)

    // Client-side validation: check file size/type constraints before uploading
    const validFiles: File[] = []
    const rejectedEntries: UploadFileProgress[] = []

    for (const file of files) {
      const validationError = validateUploadFile(
        { name: file.name, size: file.size, type: file.type },
        constraints
      )
      if (validationError) {
        const entry: UploadFileProgress = {
          id: `upload-${++uploadIdCounter.current}`,
          filename: file.name,
          progress: 0,
          status: 'error',
          error: validationError.message,
        }
        rejectedEntries.push(entry)
        toast.error(validationError.message)
      } else {
        validFiles.push(file)
      }
    }

    // Create upload queue entries for valid files only
    const queueEntries: UploadFileProgress[] = validFiles.map((file) => ({
      id: `upload-${++uploadIdCounter.current}`,
      filename: file.name,
      progress: 0,
      status: 'pending' as const,
    }))

    setUploadQueue((prev) => [...prev, ...rejectedEntries, ...queueEntries])

    // If all files were rejected, we're done
    if (!validFiles.length) {
      setUploading(false)
      return
    }

    const uploadedAssets: Asset[] = []
    let failCount = 0

    // Upload files individually for per-file progress
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const entry = queueEntries[i]

      // Mark as uploading
      setUploadQueue((prev) =>
        prev.map((item) =>
          item.id === entry.id ? { ...item, status: 'uploading' as const, progress: 0 } : item
        )
      )

      try {
        const asset = await uploadSingleFile(file, currentDirectory, (progress) => {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === entry.id ? { ...item, progress } : item
            )
          )
        })

        uploadedAssets.push(asset)
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, status: 'success' as const, progress: 100, asset }
              : item
          )
        )
      } catch (err) {
        failCount++
        const errorMsg = err instanceof Error ? err.message : 'Upload failed'
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, status: 'error' as const, error: errorMsg }
              : item
          )
        )
      }
    }

    // Update assets list with successfully uploaded files
    if (uploadedAssets.length > 0) {
      setAssets((prev) => [...prev, ...uploadedAssets])
    }

    // Summary feedback
    const successCount = validFiles.length - failCount
    const totalFailed = failCount + rejectedEntries.length
    if (totalFailed === 0) {
      toast.success(
        successCount === 1 ? 'File uploaded' : `${successCount} files uploaded`
      )
    } else if (successCount === 0 && rejectedEntries.length === 0) {
      toast.error(
        failCount === 1 ? 'Upload failed' : `All ${failCount} uploads failed`
      )
    } else if (successCount > 0) {
      toast.warning(
        `${successCount} uploaded, ${totalFailed} failed`
      )
    }

    setUploading(false)
  }, [currentDirectory])

  const clearUploadQueue = useCallback(() => {
    setUploadQueue([])
  }, [])

  const dismissUploadItem = useCallback((id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const deleteAsset = useCallback(async (assetPath: string) => {
    try {
      const res = await fetch(`/api/assets/${assetPath}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
      setAssets((prev) => prev.filter((a) => a.path !== assetPath))
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        next.delete(assetPath)
        return next
      })
      toast.success('Asset deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }, [])

  const bulkDelete = useCallback(async (paths: string[]) => {
    try {
      const res = await fetch('/api/assets/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      })
      if (!res.ok) throw new Error(`Bulk delete failed: ${res.status}`)
      setAssets((prev) => prev.filter((a) => !paths.includes(a.path)))
      setSelectedPaths(new Set())
      toast.success(`${paths.length} assets deleted`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed')
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed')
    }
  }, [])

  const moveAsset = useCallback(async (from: string, to: string) => {
    try {
      const res = await fetch('/api/assets/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      if (!res.ok) throw new Error(`Move failed: ${res.status}`)
      // Refresh current directory
      await fetchAssets(currentDirectory || undefined)
      setSelectedPaths(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    }
  }, [currentDirectory, fetchAssets])

  const bulkMove = useCallback(async (paths: string[], destination: string) => {
    try {
      const res = await fetch('/api/assets/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, destination }),
      })
      if (!res.ok) throw new Error(`Bulk move failed: ${res.status}`)
      await fetchAssets(currentDirectory || undefined)
      setSelectedPaths(new Set())
      toast.success(`${paths.length} assets moved`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk move failed')
      toast.error(err instanceof Error ? err.message : 'Bulk move failed')
    }
  }, [currentDirectory, fetchAssets])

  const createDirectory = useCallback(async (name: string) => {
    try {
      const dirPath = currentDirectory ? `${currentDirectory}/${name}` : name
      const res = await fetch('/api/assets/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      })
      if (!res.ok) throw new Error(`Create directory failed: ${res.status}`)
      toast.success('Folder created')
      // Navigate into the newly created folder immediately
      await navigateToDirectory(dirPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create directory failed')
      toast.error(err instanceof Error ? err.message : 'Create directory failed')
    }
  }, [currentDirectory, navigateToDirectory])

  const deleteDirectory = useCallback(async (name: string) => {
    try {
      const dirPath = currentDirectory ? `${currentDirectory}/${name}` : name
      const res = await fetch('/api/assets/directories/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      })
      if (!res.ok) throw new Error(`Delete directory failed: ${res.status}`)
      setDirectories((prev) => prev.filter((d) => d !== name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete directory failed')
    }
  }, [currentDirectory])

  const renameDirectory = useCallback(async (oldName: string, newName: string) => {
    try {
      const from = currentDirectory ? `${currentDirectory}/${oldName}` : oldName
      const to = currentDirectory ? `${currentDirectory}/${newName}` : newName
      const res = await fetch('/api/assets/directories/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      if (!res.ok) throw new Error(`Rename directory failed: ${res.status}`)
      setDirectories((prev) => prev.map((d) => (d === oldName ? newName : d)).sort())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename directory failed')
    }
  }, [currentDirectory])

  // Selection helpers
  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(assets.map((a) => a.path)))
  }, [assets])

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  const selectRange = useCallback((endPath: string) => {
    const endIndex = assets.findIndex((a) => a.path === endPath)
    if (endIndex === -1) return

    // Find the last selected item's index as the start
    const selectedArray = Array.from(selectedPaths)
    if (selectedArray.length === 0) {
      setSelectedPaths(new Set([endPath]))
      return
    }

    const lastSelected = selectedArray[selectedArray.length - 1]
    const startIndex = assets.findIndex((a) => a.path === lastSelected)
    if (startIndex === -1) {
      setSelectedPaths(new Set([endPath]))
      return
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    const rangePaths = assets.slice(from, to + 1).map((a) => a.path)
    setSelectedPaths(new Set([...selectedPaths, ...rangePaths]))
  }, [assets, selectedPaths])

  return {
    // State
    assets,
    directories,
    currentDirectory,
    selectedPaths,
    loading,
    uploading,
    error,
    uploadQueue,
    // Actions
    fetchAssets,
    navigateToDirectory,
    uploadFiles,
    deleteAsset,
    bulkDelete,
    moveAsset,
    bulkMove,
    createDirectory,
    deleteDirectory,
    renameDirectory,
    clearUploadQueue,
    dismissUploadItem,
    // Selection
    toggleSelection,
    selectAll,
    clearSelection,
    selectRange,
    setError,
  }
}

/**
 * Upload a single file with progress tracking via XMLHttpRequest.
 */
function uploadSingleFile(
  file: File,
  directory: string,
  onProgress: (percent: number) => void
): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    if (directory) {
      formData.append('directory', directory)
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100)
        onProgress(percent)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText)
          resolve(json.data as Asset)
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        try {
          const json = JSON.parse(xhr.responseText)
          reject(new Error(json.error?.message ?? `Upload failed: ${xhr.status}`))
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('POST', '/api/assets/upload')
    xhr.send(formData)
  })
}
