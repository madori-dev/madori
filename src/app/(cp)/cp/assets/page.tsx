'use client'

import { useEffect } from 'react'
import { useAssetManager } from '@/components/cp/assets/use-asset-manager'
import { AssetToolbar } from '@/components/cp/assets/asset-toolbar'
import { AssetBreadcrumb } from '@/components/cp/assets/asset-breadcrumb'
import { AssetDropzone } from '@/components/cp/assets/asset-dropzone'
import { AssetGrid } from '@/components/cp/assets/asset-grid'
import { Skeleton } from '@/components/ui/skeleton'

export default function AssetsPage() {
  const manager = useAssetManager()

  useEffect(() => {
    manager.fetchAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (manager.loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-xl font-semibold text-foreground">Assets</h1>
      </div>

      {/* Toolbar */}
      <AssetToolbar
        selectedCount={manager.selectedPaths.size}
        totalCount={manager.assets.length}
        uploading={manager.uploading}
        directories={manager.directories}
        currentDirectory={manager.currentDirectory}
        onUpload={manager.uploadFiles}
        onBulkDelete={() => manager.bulkDelete(Array.from(manager.selectedPaths))}
        onBulkMove={(dest) => manager.bulkMove(Array.from(manager.selectedPaths), dest)}
        onCreateDirectory={manager.createDirectory}
        onSelectAll={manager.selectAll}
        onClearSelection={manager.clearSelection}
      />

      {/* Breadcrumb */}
      {manager.currentDirectory && (
        <AssetBreadcrumb
          currentDirectory={manager.currentDirectory}
          onNavigate={manager.navigateToDirectory}
        />
      )}

      {/* Error banner */}
      {manager.error && (
        <div className="mx-4 mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{manager.error}</p>
        </div>
      )}

      {/* Grid with dropzone */}
      <AssetDropzone onDrop={manager.uploadFiles} uploading={manager.uploading}>
        <AssetGrid
          assets={manager.assets}
          directories={manager.directories}
          selectedPaths={manager.selectedPaths}
          currentDirectory={manager.currentDirectory}
          onToggleSelection={manager.toggleSelection}
          onSelectRange={manager.selectRange}
          onNavigateToDirectory={manager.navigateToDirectory}
          onDeleteAsset={manager.deleteAsset}
          onDeleteDirectory={manager.deleteDirectory}
          onRenameDirectory={manager.renameDirectory}
          onMoveAsset={manager.moveAsset}
        />
      </AssetDropzone>
    </div>
  )
}
