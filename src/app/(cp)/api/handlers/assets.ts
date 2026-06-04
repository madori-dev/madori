import { NextRequest, NextResponse } from 'next/server'
import { AssetOperations, type AssetUploadInput, type AssetMetadataUpdate } from '@/lib/content/assets'
import { NotFoundError } from '@/lib/errors'
import {
  validateUploadFile,
  DEFAULT_UPLOAD_CONSTRAINTS,
  type UploadConstraints,
} from '@/lib/content/upload-constraints'

export function createAssetHandlers(assetOps: AssetOperations, constraints: UploadConstraints = DEFAULT_UPLOAD_CONSTRAINTS) {
  async function handleListAssets(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url)
    const directory = searchParams.get('directory') ?? undefined
    const assets = await assetOps.listAssets(directory)
    const directories = await assetOps.listDirectories(directory)
    return NextResponse.json({ data: assets, directories })
  }

  async function handleUploadAsset(request: NextRequest): Promise<NextResponse> {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No file provided' } },
        { status: 422 }
      )
    }

    // Validate file size and type constraints
    const validationError = validateUploadFile(
      { name: file.name, size: file.size, type: file.type },
      constraints
    )
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 422 }
      )
    }

    const directory = formData.get('directory')
    const dirStr = typeof directory === 'string' ? directory : undefined

    const buffer = Buffer.from(await file.arrayBuffer())
    const input: AssetUploadInput = {
      name: file.name,
      content: buffer,
      type: file.type,
    }

    const asset = await assetOps.uploadAsset(input, dirStr)
    return NextResponse.json({ data: asset }, { status: 201 })
  }

  async function handleUploadMultiple(request: NextRequest): Promise<NextResponse> {
    const formData = await request.formData()
    const files = formData.getAll('files')
    const directory = formData.get('directory')
    const dirStr = typeof directory === 'string' ? directory : undefined

    if (!files.length) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No files provided' } },
        { status: 422 }
      )
    }

    const assets = []
    const errors: Array<{ filename: string; error: ReturnType<typeof validateUploadFile> }> = []

    for (const file of files) {
      if (!(file instanceof File)) continue

      // Validate each file against constraints
      const validationError = validateUploadFile(
        { name: file.name, size: file.size, type: file.type },
        constraints
      )
      if (validationError) {
        errors.push({ filename: file.name, error: validationError })
        continue
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const input: AssetUploadInput = {
        name: file.name,
        content: buffer,
        type: file.type,
      }
      const asset = await assetOps.uploadAsset(input, dirStr)
      assets.push(asset)
    }

    if (errors.length > 0 && assets.length === 0) {
      // All files failed validation
      return NextResponse.json(
        { error: errors[0].error, errors: errors.map((e) => e.error) },
        { status: 422 }
      )
    }

    return NextResponse.json({ data: assets, errors: errors.length > 0 ? errors.map((e) => e.error) : undefined }, { status: 201 })
  }

  async function handleDeleteAsset(
    _request: NextRequest,
    pathSegments: string[]
  ): Promise<NextResponse> {
    const assetPath = pathSegments.join('/')
    if (!assetPath) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Asset path is required' } },
        { status: 422 }
      )
    }

    try {
      await assetOps.deleteAsset(assetPath)
      return NextResponse.json({ success: true })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleMoveAsset(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { from, to } = body as { from?: string; to?: string }

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Both "from" and "to" paths are required' } },
        { status: 422 }
      )
    }

    try {
      const asset = await assetOps.moveAsset(from, to)
      return NextResponse.json({ data: asset })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleBulkMove(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { paths, destination } = body as { paths?: string[]; destination?: string }

    if (!paths?.length || destination === undefined) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '"paths" array and "destination" are required' } },
        { status: 422 }
      )
    }

    const assets = await assetOps.bulkMove(paths, destination)
    return NextResponse.json({ data: assets })
  }

  async function handleBulkDelete(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { paths } = body as { paths?: string[] }

    if (!paths?.length) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '"paths" array is required' } },
        { status: 422 }
      )
    }

    await assetOps.bulkDelete(paths)
    return NextResponse.json({ success: true })
  }

  async function handleCreateDirectory(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { path: dirPath } = body as { path?: string }

    if (!dirPath) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '"path" is required' } },
        { status: 422 }
      )
    }

    await assetOps.createDirectory(dirPath)
    return NextResponse.json({ success: true }, { status: 201 })
  }

  async function handleDeleteDirectory(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { path: dirPath } = body as { path?: string }

    if (!dirPath) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '"path" is required' } },
        { status: 422 }
      )
    }

    try {
      await assetOps.deleteDirectory(dirPath)
      return NextResponse.json({ success: true })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleRenameDirectory(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const { from, to } = body as { from?: string; to?: string }

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Both "from" and "to" are required' } },
        { status: 422 }
      )
    }

    try {
      await assetOps.renameDirectory(from, to)
      return NextResponse.json({ success: true })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleUpdateMetadata(
    request: NextRequest,
    pathSegments: string[]
  ): Promise<NextResponse> {
    const assetPath = pathSegments.join('/')
    if (!assetPath) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Asset path is required' } },
        { status: 422 }
      )
    }

    const body = await request.json()
    const update: AssetMetadataUpdate = {}

    if (typeof body.alt === 'string') {
      update.alt = body.alt
    }
    if (typeof body.filename === 'string') {
      update.filename = body.filename
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'At least one metadata field (alt, filename) is required' } },
        { status: 422 }
      )
    }

    try {
      const asset = await assetOps.updateMetadata(assetPath, update)
      return NextResponse.json({ data: asset })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  return {
    handleListAssets,
    handleUploadAsset,
    handleUploadMultiple,
    handleDeleteAsset,
    handleMoveAsset,
    handleBulkMove,
    handleBulkDelete,
    handleCreateDirectory,
    handleDeleteDirectory,
    handleRenameDirectory,
    handleUpdateMetadata,
  }
}
