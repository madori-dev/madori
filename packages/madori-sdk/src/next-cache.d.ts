/**
 * Type declarations for next/cache.
 * Required because Next.js does not provide an `exports` map in package.json,
 * which breaks moduleResolution: NodeNext.
 */
declare module 'next/cache' {
  export function unstable_cache<T extends (...args: any[]) => Promise<any>>(
    cb: T,
    keyParts?: string[],
    options?: { revalidate?: number | false; tags?: string[] }
  ): T

  export function revalidateTag(tag: string): void
  export function revalidatePath(path: string, type?: 'layout' | 'page'): void
}
