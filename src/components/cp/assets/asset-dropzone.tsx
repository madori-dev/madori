'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AssetDropzoneProps {
  onDrop: (files: File[]) => void
  uploading: boolean
  children: React.ReactNode
}

export function AssetDropzone({ onDrop, uploading, children }: AssetDropzoneProps) {
  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      onDrop(acceptedFiles)
    },
    [onDrop]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    noClick: true,
    noKeyboard: true,
    disabled: uploading,
  })

  return (
    <div {...getRootProps()} className="relative flex-1 min-h-0">
      <input {...getInputProps()} />
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10" />
            <p className="text-sm font-medium">Drop files here to upload</p>
          </div>
        </div>
      )}
      <div className={cn('h-full', isDragActive && 'pointer-events-none opacity-50')}>
        {children}
      </div>
    </div>
  )
}
