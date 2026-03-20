import type {
  Language,
  LinkSyncAdapter,
  PerspectiveDiff,
  PerspectiveDiffObserver,
  SyncStateChangeObserver
} from './types'
import type { LinkExpression } from '../linkstore/types'

/**
 * Shared backing store — multiple language instances point at the same store.
 * Used for in-memory testing of neighbourhood sync without Holochain.
 */
export class SharedLinkStore {
  private links: LinkExpression[] = []
  private observers: PerspectiveDiffObserver[] = []
  private revision = 0

  getLinks(): LinkExpression[] {
    return [...this.links]
  }

  addLinks(additions: LinkExpression[]): string {
    this.links.push(...additions)
    this.revision++
    const diff: PerspectiveDiff = { additions, removals: [] }
    for (const obs of this.observers) obs(diff)
    return `rev-${this.revision}`
  }

  removeLinks(removals: LinkExpression[]): string {
    for (const rem of removals) {
      const idx = this.links.findIndex(
        (l) =>
          l.data.source === rem.data.source &&
          l.data.target === rem.data.target &&
          l.data.predicate === rem.data.predicate
      )
      if (idx >= 0) this.links.splice(idx, 1)
    }
    this.revision++
    const diff: PerspectiveDiff = { additions: [], removals }
    for (const obs of this.observers) obs(diff)
    return `rev-${this.revision}`
  }

  addObserver(obs: PerspectiveDiffObserver): number {
    this.observers.push(obs)
    return this.observers.length - 1
  }

  getRevision(): string {
    return `rev-${this.revision}`
  }
}

/**
 * Creates a link language backed by a SharedLinkStore.
 * Multiple agents can share the same store for in-memory sync testing.
 */
export function createSharedLinkLanguage(name: string, store: SharedLinkStore, _agentDid: string): Language {
  const syncCallbacks: PerspectiveDiffObserver[] = []

  const linksAdapter: LinkSyncAdapter = {
    writable() {
      return true
    },
    public() {
      return true
    },
    async others() {
      return []
    },
    async currentRevision() {
      return store.getRevision()
    },
    async sync() {
      return { additions: store.getLinks(), removals: [] }
    },
    async render() {
      return { links: store.getLinks() }
    },
    async commit(diff: PerspectiveDiff) {
      let rev = store.getRevision()
      if (diff.additions.length > 0) rev = store.addLinks(diff.additions)
      if (diff.removals.length > 0) rev = store.removeLinks(diff.removals)
      return rev
    },
    addCallback(callback: PerspectiveDiffObserver) {
      syncCallbacks.push(callback)
      store.addObserver((diff) => {
        for (const cb of syncCallbacks) cb(diff)
      })
      return syncCallbacks.length - 1
    },
    addSyncStateChangeCallback(_callback: SyncStateChangeObserver) {
      return 0
    }
  }

  return {
    name,
    linksAdapter,
    interactions() {
      return []
    }
  }
}

/**
 * Returns a bundle source string for the shared link language.
 * Each bundle instance has its own isolated link store (not shared across agents).
 * For cross-agent sharing, use createSharedLinkLanguage with a SharedLinkStore instead.
 */
export function createSharedLinkLanguageBundleSource(): string {
  return `
    module.exports = {
      create: function(context) {
        var links = [];
        var observers = [];
        return {
          name: 'shared-link-language',
          linksAdapter: {
            writable: function() { return true; },
            public: function() { return true; },
            others: async function() { return []; },
            currentRevision: async function() { return 'rev-' + links.length; },
            sync: async function() { return { additions: links.slice(), removals: [] }; },
            render: async function() { return { links: links.slice() }; },
            commit: async function(diff) {
              if (diff.additions) links = links.concat(diff.additions);
              if (diff.removals) {
                diff.removals.forEach(function(rem) {
                  var idx = links.findIndex(function(l) {
                    return l.data.source === rem.data.source && l.data.target === rem.data.target;
                  });
                  if (idx >= 0) links.splice(idx, 1);
                });
              }
              var rev = 'rev-' + links.length;
              observers.forEach(function(cb) { cb(diff); });
              return rev;
            },
            addCallback: function(cb) { observers.push(cb); return observers.length - 1; },
            addSyncStateChangeCallback: function() { return 0; }
          },
          interactions: function() { return []; }
        };
      }
    };
  `
}
