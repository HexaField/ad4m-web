/**
 * Batch context for collecting link mutations before committing.
 */

import type { LinkExpression } from '../linkstore/types'

export class BatchContext {
  private pendingAdditions: LinkExpression[] = []
  private pendingRemovals: LinkExpression[] = []

  add(link: LinkExpression): void {
    this.pendingAdditions.push(link)
  }

  remove(link: LinkExpression): void {
    this.pendingRemovals.push(link)
  }

  getAdditions(): LinkExpression[] {
    return [...this.pendingAdditions]
  }

  getRemovals(): LinkExpression[] {
    return [...this.pendingRemovals]
  }

  clear(): void {
    this.pendingAdditions = []
    this.pendingRemovals = []
  }

  get size(): number {
    return this.pendingAdditions.length + this.pendingRemovals.length
  }
}
