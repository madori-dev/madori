/**
 * Upload constraints for asset file uploads.
 * Provides both client-side and server-side validation with clear error messages.
 */

export interface UploadConstraints {
  /** Maximum file size in bytes. Default: 10MB */
  maxFileSize: number
  /** Allowed MIME type patterns. Supports wildcards like 'image/*'. Empty = all allowed. */
  allowedTypes: string[]
}

export interface UploadValidationError {
  code: 'UPLOAD_FAILED'
  message: string
  constraint: 'file_size' | 'file_type'
  limit?: string
}

/** Default upload constraints */
export const DEFAULT_UPLOAD_CONSTRAINTS: UploadConstraints = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [], // empty = all types allowed
}

/**
 * Format bytes into a human-readable string (e.g. "10MB", "512KB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb % 1 === 0 ? `${gb}GB` : `${gb.toFixed(1)}GB`
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return mb % 1 === 0 ? `${mb}MB` : `${mb.toFixed(1)}MB`
  }
  if (bytes >= 1024) {
    const kb = bytes / 1024
    return kb % 1 === 0 ? `${kb}KB` : `${kb.toFixed(1)}KB`
  }
  return `${bytes}B`
}

/**
 * Check whether a MIME type matches a pattern.
 * Supports exact match ('image/png') and wildcard ('image/*').
 */
export function mimeTypeMatches(mimeType: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') return true
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return mimeType.startsWith(prefix + '/')
  }
  return mimeType === pattern
}

/**
 * Validate a file against upload constraints.
 * Returns null if valid, or an UploadValidationError if constraint violated.
 */
export function validateUploadFile(
  file: { name: string; size: number; type: string },
  constraints: UploadConstraints = DEFAULT_UPLOAD_CONSTRAINTS
): UploadValidationError | null {
  // Check file size
  if (file.size > constraints.maxFileSize) {
    return {
      code: 'UPLOAD_FAILED',
      message: `File "${file.name}" exceeds ${formatFileSize(constraints.maxFileSize)} limit (${formatFileSize(file.size)})`,
      constraint: 'file_size',
      limit: formatFileSize(constraints.maxFileSize),
    }
  }

  // Check file type
  if (constraints.allowedTypes.length > 0) {
    const typeAllowed = constraints.allowedTypes.some((pattern) =>
      mimeTypeMatches(file.type || 'application/octet-stream', pattern)
    )

    if (!typeAllowed) {
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : file.name
      return {
        code: 'UPLOAD_FAILED',
        message: `File type "${ext}" is not allowed. Accepted types: ${constraints.allowedTypes.join(', ')}`,
        constraint: 'file_type',
        limit: constraints.allowedTypes.join(', '),
      }
    }
  }

  return null
}

/**
 * Validate multiple files against upload constraints.
 * Returns an array of errors (one per invalid file). Empty array = all valid.
 */
export function validateUploadFiles(
  files: Array<{ name: string; size: number; type: string }>,
  constraints: UploadConstraints = DEFAULT_UPLOAD_CONSTRAINTS
): Array<UploadValidationError & { filename: string }> {
  const errors: Array<UploadValidationError & { filename: string }> = []

  for (const file of files) {
    const error = validateUploadFile(file, constraints)
    if (error) {
      errors.push({ ...error, filename: file.name })
    }
  }

  return errors
}
