'use client'

import { useRef, useState } from 'react'
import {
  Upload,
  FolderPlus,
  Trash2,
  FolderInput,
  CheckSquare,
  XSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'

interface AssetToolbarProps {
  selectedCount: number
  totalCount: number
  uploading: boolean
  directories: string[]
  currentDirectory: string
  onUpload: (files: File[]) => void
  onBulkDelete: () => void
  onBulkMove: (destination: string) => void
  onCreateDirectory: (name: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
}

export function AssetToolbar({
  selectedCount,
  totalCount,
  uploading,
  directories,
  currentDirectory,
  onUpload,
  onBulkDelete,
  onBulkMove,
  onCreateDirectory,
  onSelectAll,
  onClearSelection,
}: AssetToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [moveTarget, setMoveTarget] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onUpload(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleCreateFolder() {
    if (newFolderName.trim()) {
      onCreateDirectory(newFolderName.trim())
      setNewFolderName('')
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      {/* Upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>

      {/* New Folder */}
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <FolderPlus className="mr-1.5 h-4 w-4" />
          New Folder
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
            }}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <DialogClose render={<Button />} onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {/* Selection info & actions */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedCount} of {totalCount} selected
          </span>

          {/* Move selected */}
          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <FolderInput className="mr-1.5 h-4 w-4" />
              Move
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Move {selectedCount} item(s)</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select destination folder:
                </p>
                <div className="flex flex-col gap-1">
                  {currentDirectory && (
                    <Button
                      variant={moveTarget === '' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="justify-start"
                      onClick={() => setMoveTarget('')}
                    >
                      / (root)
                    </Button>
                  )}
                  {directories.map((dir) => (
                    <Button
                      key={dir}
                      variant={moveTarget === dir ? 'secondary' : 'ghost'}
                      size="sm"
                      className="justify-start"
                      onClick={() =>
                        setMoveTarget(currentDirectory ? `${currentDirectory}/${dir}` : dir)
                      }
                    >
                      📁 {dir}
                    </Button>
                  ))}
                  {directories.length === 0 && !currentDirectory && (
                    <p className="text-sm text-muted-foreground py-2">
                      No folders available. Create one first.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <DialogClose render={<Button />} onClick={() => onBulkMove(moveTarget)}>
                  Move Here
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete selected */}
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedCount} item(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The selected files will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onBulkDelete}
                  variant="destructive"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <XSquare className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'file' : 'files'}
          </span>
          {totalCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onSelectAll}>
              <CheckSquare className="mr-1.5 h-4 w-4" />
              Select All
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
