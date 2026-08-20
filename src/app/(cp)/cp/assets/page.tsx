'use client'

import { useEffect } from 'react'
import { useAssetManager } from '@/components/cp/assets/use-asset-manager'
import { AssetToolbar } from '@/components/cp/assets/asset-toolbar'
import { AssetBreadcrumb } from '@/components/cp/assets/asset-breadcrumb'
import { AssetDropzone } from '@/components/cp/assets/asset-dropzone'
import { AssetGrid } from '@/components/cp/assets/asset-grid'
import { UploadProgressPanel } from '@/components/cp/assets/upload-progress-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useCapabilities } from '@/components/cp/use-capabilities'

export default function AssetsPage() {
  const manager = useAssetManager()
  const capabilities = useCapabilities()
  // Capabilities load asynchronously; no mutation control renders until granted.
  const canCreate = capabilities?.['assets:create'] === true
  const canEdit = capabilities?.['assets:edit'] === true
  const canDelete = capabilities?.['assets:delete'] === true

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
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
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
      <AssetDropzone onDrop={manager.uploadFiles} uploading={manager.uploading} enabled={canCreate}>
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
          onUpdateMetadata={manager.updateMetadata}
          onUpload={canCreate ? manager.uploadFiles : undefined}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </AssetDropzone>

      {/* Upload progress */}
      <UploadProgressPanel
        queue={manager.uploadQueue}
        onDismiss={manager.dismissUploadItem}
        onClearAll={manager.clearUploadQueue}
      />
    </div>
  )
}
