'use client'

import { useState, useCallback } from 'react'
import type { Asset } from '@/lib/types'

export interface DirectoryListing {
  assets: Asset[]
  directories: string[]
}

export interface AssetManagerState {
  assets: Asset[]
  directories: string[]
  currentDirectory: string
  selectedPaths: Set<string>
  loading: boolean
  uploading: boolean
  error: string | null
}

export function useAssetManager() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [directories, setDirectories] = useState<string[]>([])
  const [currentDirectory, setCurrentDirectory] = useState<string>('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('files', file)
      }
      if (currentDirectory) {
        formData.append('directory', currentDirectory)
      }

      const res = await fetch('/api/assets/upload-multiple', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const json = await res.json()
      setAssets((prev) => [...prev, ...(json.data ?? [])])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [currentDirectory])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk move failed')
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
      setDirectories((prev) => [...prev, name].sort())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create directory failed')
    }
  }, [currentDirectory])

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
    // Selection
    toggleSelection,
    selectAll,
    clearSelection,
    selectRange,
    setError,
  }
}
