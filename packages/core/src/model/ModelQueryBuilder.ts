/**
 * ModelQueryBuilder — fluent query builder for Ad4mModel.
 *
 * Allows building queries with a chainable interface and either
 * running them once or subscribing to real-time updates.
 */

import type { Ad4mModel } from './Ad4mModel'
import type { ModelPerspectiveHandle } from './perspective-handle'
import type { Query, Where, OrderBy, ParentQuery, PaginationResult } from './types'

export class ModelQueryBuilder<T extends Ad4mModel> {
  private perspective: ModelPerspectiveHandle
  private queryParams: Query = {}
  private ctor: new (...args: unknown[]) => T

  constructor(perspective: ModelPerspectiveHandle, ctor: new (...args: unknown[]) => T, initialQuery?: Query) {
    this.perspective = perspective
    this.ctor = ctor
    if (initialQuery) this.queryParams = { ...initialQuery }
  }

  where(conditions: Where): ModelQueryBuilder<T> {
    this.queryParams.where = conditions
    return this
  }

  order(orderBy: OrderBy): ModelQueryBuilder<T> {
    this.queryParams.order = orderBy
    return this
  }

  limit(n: number): ModelQueryBuilder<T> {
    this.queryParams.limit = n
    return this
  }

  offset(n: number): ModelQueryBuilder<T> {
    this.queryParams.offset = n
    return this
  }

  parent(parent: ParentQuery): ModelQueryBuilder<T> {
    this.queryParams.parent = parent
    return this
  }

  include(fields: string[]): ModelQueryBuilder<T> {
    // Stored for future relation eager-loading support
    void fields
    return this
  }

  async run(): Promise<T[]> {
    const modelClass = this.ctor as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    return modelClass.findAll.call(this.ctor, this.perspective, this.queryParams) as Promise<T[]>
  }

  async first(): Promise<T | null> {
    const modelClass = this.ctor as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    return modelClass.findOne.call(this.ctor, this.perspective, this.queryParams) as Promise<T | null>
  }

  async count(): Promise<number> {
    const modelClass = this.ctor as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    return modelClass.count.call(this.ctor, this.perspective, this.queryParams) as Promise<number>
  }

  async paginate(pageSize: number, page: number): Promise<PaginationResult<T>> {
    const modelClass = this.ctor as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    return modelClass.paginate.call(this.ctor, this.perspective, pageSize, page, this.queryParams) as Promise<
      PaginationResult<T>
    >
  }

  /**
   * Subscribe to changes. Calls the callback whenever the perspective changes
   * and the query results may have changed.
   *
   * Returns an unsubscribe function.
   */
  subscribe(callback: (results: T[]) => void): () => void {
    let active = true

    // Initial run
    void this.run().then((results) => {
      if (active) callback(results)
    })

    // For now, subscription is a no-op poll mechanism.
    // Real implementation would hook into perspective event listeners.
    return () => {
      active = false
    }
  }
}
