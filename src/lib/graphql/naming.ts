/** Stable GraphQL names derived from authored handles. */
export function toGraphQLName(handle: string): string {
  const name = handle.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return /^[A-Za-z_]/.test(name) ? name : `_${name || 'Field'}`
}
export function toGraphQLFieldName(handle: string): string {
  const name = handle.split(/[-_\s]+/).filter(Boolean).map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return /^[A-Za-z_]/.test(name) ? name : `_${name || 'field'}`
}
export function collectionQueryNames(handle: string): { singular: string; plural: string } {
  const singular = toGraphQLFieldName(handle)
  const base = handle.endsWith('s') ? handle : handle.endsWith('y') && !handle.endsWith('ey') ? `${handle.slice(0, -1)}ies` : `${handle}s`
  const plural = toGraphQLFieldName(base)
  return { singular, plural: plural === singular ? `${singular}List` : plural }
}
export function assertUniqueCollectionQueryNames(handles: string[]): void {
  const seen = new Map<string, string>()
  for (const handle of handles) for (const name of Object.values(collectionQueryNames(handle))) {
    const previous = seen.get(name)
    if (previous && previous !== handle) throw new Error(`GraphQL collection query name "${name}" is shared by "${previous}" and "${handle}"`)
    seen.set(name, handle)
  }
}
