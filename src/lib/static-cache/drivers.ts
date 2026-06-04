export interface StaticCacheDriver {
  get(key: string): Promise<string | null>
  set(key: string, html: string): Promise<void>
  delete(key: string): Promise<void>
  deletePattern(pattern: string): Promise<string[]>
  clear(): Promise<number>
  has(key: string): Promise<boolean>
}
