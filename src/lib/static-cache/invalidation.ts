import type { StaticCacheDriver } from './drivers'

export interface InvalidationRule {
  trigger: string
  urls: string[]
}

export interface InvalidationEvent {
  type: 'entry' | 'global' | 'navigation' | 'taxonomy' | 'form'
  collection?: string
  handle?: string
  url?: string
  relatedUrls?: string[]
}

export class InvalidationEngine {
  constructor(
    private driver: StaticCacheDriver,
    private rules: InvalidationRule[],
    private warmOnInvalidate: boolean,
    private reRenderFn?: (url: string) => Promise<void>
  ) {}

  async invalidate(event: InvalidationEvent): Promise<void> {
    const urlsToInvalidate = this.resolveUrls(event)

    for (const url of urlsToInvalidate) {
      if (url.includes('*')) {
        await this.driver.deletePattern(url)
      } else {
        await this.driver.delete(url)
      }
    }

    if (this.warmOnInvalidate && this.reRenderFn) {
      // Fire and forget — does not block the CP handler response
      const nonGlobUrls = urlsToInvalidate.filter(u => !u.includes('*'))
      Promise.allSettled(nonGlobUrls.map(url => this.reRenderFn!(url)))
    }
  }

  private resolveUrls(event: InvalidationEvent): string[] {
    // Site-wide invalidation for globals and navigation
    if (event.type === 'global' || event.type === 'navigation') {
      return ['*']
    }

    // Check custom rules first for entry events
    if (event.type === 'entry' && event.collection) {
      const matchingRules = this.rules.filter(r => r.trigger === event.collection)
      if (matchingRules.length > 0) {
        return matchingRules.flatMap(r => r.urls)
      }
    }

    // Taxonomy invalidation: term URL + related entry URLs
    if (event.type === 'taxonomy') {
      const urls: string[] = []
      if (event.url) urls.push(event.url)
      if (event.relatedUrls) urls.push(...event.relatedUrls)
      return urls.length > 0 ? urls : []
    }

    // Form invalidation: pages referencing the form
    if (event.type === 'form' && event.relatedUrls) {
      return event.relatedUrls
    }

    // Fallback: invalidate the entry's own URL
    if (event.url) return [event.url]
    return []
  }
}
