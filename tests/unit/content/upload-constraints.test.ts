import { describe, it, expect } from 'vitest'
import {
  validateUploadFile,
  validateUploadFiles,
  formatFileSize,
  mimeTypeMatches,
  DEFAULT_UPLOAD_CONSTRAINTS,
  type UploadConstraints,
} from '@/lib/content/upload-constraints'

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1KB')
    expect(formatFileSize(1536)).toBe('1.5KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1MB')
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10MB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1GB')
  })
})

describe('mimeTypeMatches', () => {
  it('matches exact MIME types', () => {
    expect(mimeTypeMatches('image/png', 'image/png')).toBe(true)
    expect(mimeTypeMatches('image/png', 'image/jpeg')).toBe(false)
  })

  it('matches wildcard patterns', () => {
    expect(mimeTypeMatches('image/png', 'image/*')).toBe(true)
    expect(mimeTypeMatches('image/jpeg', 'image/*')).toBe(true)
    expect(mimeTypeMatches('application/pdf', 'image/*')).toBe(false)
  })

  it('matches universal wildcards', () => {
    expect(mimeTypeMatches('anything/here', '*')).toBe(true)
    expect(mimeTypeMatches('anything/here', '*/*')).toBe(true)
  })
})

describe('validateUploadFile', () => {
  it('returns null for valid files within constraints', () => {
    const file = { name: 'photo.png', size: 1024, type: 'image/png' }
    expect(validateUploadFile(file)).toBeNull()
  })

  it('returns error when file exceeds size limit', () => {
    const file = { name: 'large.zip', size: 11 * 1024 * 1024, type: 'application/zip' }
    const error = validateUploadFile(file)

    expect(error).not.toBeNull()
    expect(error!.code).toBe('UPLOAD_FAILED')
    expect(error!.constraint).toBe('file_size')
    expect(error!.message).toContain('large.zip')
    expect(error!.message).toContain('10MB')
    expect(error!.limit).toBe('10MB')
  })

  it('returns error with clear message for file type violation', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 10 * 1024 * 1024,
      allowedTypes: ['image/*', 'application/pdf'],
    }
    const file = { name: 'script.exe', size: 1024, type: 'application/x-msdownload' }
    const error = validateUploadFile(file, constraints)

    expect(error).not.toBeNull()
    expect(error!.code).toBe('UPLOAD_FAILED')
    expect(error!.constraint).toBe('file_type')
    expect(error!.message).toContain('.exe')
    expect(error!.message).toContain('not allowed')
    expect(error!.limit).toContain('image/*')
    expect(error!.limit).toContain('application/pdf')
  })

  it('passes when file type matches allowed wildcard', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 10 * 1024 * 1024,
      allowedTypes: ['image/*'],
    }
    const file = { name: 'photo.webp', size: 2048, type: 'image/webp' }
    expect(validateUploadFile(file, constraints)).toBeNull()
  })

  it('allows all types when allowedTypes is empty', () => {
    const file = { name: 'anything.xyz', size: 100, type: 'application/octet-stream' }
    expect(validateUploadFile(file)).toBeNull()
  })

  it('uses custom maxFileSize constraint', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 1024, // 1KB
      allowedTypes: [],
    }
    const file = { name: 'big.txt', size: 2048, type: 'text/plain' }
    const error = validateUploadFile(file, constraints)

    expect(error).not.toBeNull()
    expect(error!.constraint).toBe('file_size')
    expect(error!.message).toContain('1KB')
  })

  it('checks size before type', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 1024,
      allowedTypes: ['image/*'],
    }
    // File violates both constraints
    const file = { name: 'script.exe', size: 2048, type: 'application/x-msdownload' }
    const error = validateUploadFile(file, constraints)

    expect(error!.constraint).toBe('file_size')
  })

  it('handles files without extension in name', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 10 * 1024 * 1024,
      allowedTypes: ['image/*'],
    }
    const file = { name: 'Makefile', size: 512, type: 'application/octet-stream' }
    const error = validateUploadFile(file, constraints)

    expect(error).not.toBeNull()
    expect(error!.constraint).toBe('file_type')
  })
})

describe('validateUploadFiles', () => {
  it('returns empty array when all files are valid', () => {
    const files = [
      { name: 'a.png', size: 1024, type: 'image/png' },
      { name: 'b.jpg', size: 2048, type: 'image/jpeg' },
    ]
    expect(validateUploadFiles(files)).toEqual([])
  })

  it('returns errors only for invalid files', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 1024,
      allowedTypes: [],
    }
    const files = [
      { name: 'small.txt', size: 512, type: 'text/plain' },
      { name: 'big.txt', size: 2048, type: 'text/plain' },
    ]
    const errors = validateUploadFiles(files, constraints)

    expect(errors).toHaveLength(1)
    expect(errors[0].filename).toBe('big.txt')
    expect(errors[0].constraint).toBe('file_size')
  })

  it('includes filename in each error', () => {
    const constraints: UploadConstraints = {
      maxFileSize: 100,
      allowedTypes: [],
    }
    const files = [
      { name: 'a.txt', size: 200, type: 'text/plain' },
      { name: 'b.txt', size: 300, type: 'text/plain' },
    ]
    const errors = validateUploadFiles(files, constraints)

    expect(errors).toHaveLength(2)
    expect(errors[0].filename).toBe('a.txt')
    expect(errors[1].filename).toBe('b.txt')
  })
})

describe('DEFAULT_UPLOAD_CONSTRAINTS', () => {
  it('has a 10MB file size limit', () => {
    expect(DEFAULT_UPLOAD_CONSTRAINTS.maxFileSize).toBe(10 * 1024 * 1024)
  })

  it('allows all file types by default', () => {
    expect(DEFAULT_UPLOAD_CONSTRAINTS.allowedTypes).toEqual([])
  })
})
