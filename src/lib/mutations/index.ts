import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Durable content changes emitted after a write, move, or deletion succeeds.
 *
 * This module deliberately has no Git dependency. Consumers such as a Git
 * synchroniser can subscribe to mutations without becoming part of write path.
 */

export type ContentMutationAction = 'create' | 'update' | 'delete' | 'move'

export type ContentMutationSource =
  | 'control-panel'
  | 'api'
  | 'cli'
  | 'filesystem'
  | 'system'

export interface ContentMutationResource {
  /** Logical resource kind, for example `entry`, `blueprint`, or `navigation`. */
  type: string
  /** Optional resource collection, taxonomy, or other namespace. */
  handle?: string
  /** Optional stable resource identifier. */
  id?: string
}

export interface ContentMutationActor {
  id: string
  name?: string
  email?: string
}

export interface ContentMutationContext {
  actor?: ContentMutationActor
  source?: ContentMutationSource
}

export interface ContentMutation {
  action: ContentMutationAction
  /** Absolute affected paths. A move contains old path followed by new path. */
  paths: readonly string[]
  resource: ContentMutationResource
  /** Human-readable description suitable for a future commit message. */
  message: string
  source: ContentMutationSource
  actor?: ContentMutationActor
  /** Time mutation became durable, in Unix milliseconds. */
  timestamp: number
}

export type ContentMutationListener = (mutation: ContentMutation) => void

/** Contract implemented by mutation publishers. */
export interface ContentMutationReporter {
  report(mutation: ContentMutation): void
  onMutation(listener: ContentMutationListener): () => void
}

/** Optional reporter safe for standalone services and existing integrations. */
export const noOpContentMutationReporter: ContentMutationReporter = {
  report: () => undefined,
  onMutation: () => () => undefined,
}

/**
 * Small in-process publisher. Write services should call this only after their
 * durable filesystem operation has completed successfully.
 */
export class ContentMutationBus implements ContentMutationReporter {
  private readonly listeners = new Set<ContentMutationListener>()
  private readonly context = new AsyncLocalStorage<ContentMutationContext>()

  report(mutation: ContentMutation): void {
    const context = this.context.getStore()
    const event = normaliseContentMutation({
      ...mutation,
      // Service-level events use `system`; request context turns them into a
      // durable CP/API mutation with authenticated editor attribution.
      source: mutation.source === 'system' ? context?.source ?? mutation.source : mutation.source,
      actor: mutation.actor ?? context?.actor,
    })
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  onMutation(listener: ContentMutationListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async withContext<T>(context: ContentMutationContext, callback: () => Promise<T>): Promise<T> {
    return this.context.run(context, callback)
  }
}

/** Creates an immutable event snapshot safe to retain in asynchronous queues. */
export function normaliseContentMutation(mutation: ContentMutation): ContentMutation {
  if (mutation.paths.length === 0) {
    throw new Error('Content mutation must include at least one affected path')
  }

  return Object.freeze({
    ...mutation,
    paths: Object.freeze([...mutation.paths]),
    resource: Object.freeze({ ...mutation.resource }),
    actor: mutation.actor ? Object.freeze({ ...mutation.actor }) : undefined,
  })
}
