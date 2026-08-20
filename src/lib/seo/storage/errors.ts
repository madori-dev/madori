export class SeoStorageError extends Error {
  constructor(message: string) { super(message); this.name = 'SeoStorageError' }
}

export class SeoRevisionConflictError extends SeoStorageError {
  constructor(public readonly path: string) { super(`SEO document changed before it could be saved: ${path}`); this.name = 'SeoRevisionConflictError' }
}
