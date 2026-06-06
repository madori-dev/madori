/**
 * Augment archiver module to include ZipArchive and TarArchive constructors
 * that exist at runtime but are missing from @types/archiver.
 */
declare module 'archiver' {
  import type { Archiver } from 'archiver'

  export class ZipArchive implements Archiver {
    constructor(opts: { zlib: { level: number } })
    pipe(destination: any): any
    append(source: string | Buffer | NodeJS.ReadableStream, data: { name: string }): this
    file(filepath: string, data: { name: string }): this
    directory(dirpath: string, destpath: string | false): this
    finalize(): Promise<void>
    on(event: string, listener: (...args: any[]) => void): this
  }

  export class TarArchive implements Archiver {
    constructor(opts: { gzip: boolean })
    pipe(destination: any): any
    append(source: string | Buffer | NodeJS.ReadableStream, data: { name: string }): this
    file(filepath: string, data: { name: string }): this
    directory(dirpath: string, destpath: string | false): this
    finalize(): Promise<void>
    on(event: string, listener: (...args: any[]) => void): this
  }
}
