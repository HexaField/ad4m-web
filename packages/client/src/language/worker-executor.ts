import type { BundleExecutor, LanguageBundleExports } from '@ad4m-web/core'
import type { Language, LanguageContext } from '@ad4m-web/core'

interface PendingCall {
  resolve: (value: any) => void
  reject: (error: Error) => void
}

/**
 * Proxy that represents a Language object running inside a Web Worker.
 * All adapter method calls are forwarded via postMessage and return Promises.
 */
class WorkerLanguageProxy {
  private worker: Worker
  private pending = new Map<number, PendingCall>()
  private nextId = 0
  private _name: string

  constructor(worker: Worker, name: string) {
    this.worker = worker
    this._name = name
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data
      if (msg.type === 'result' || msg.type === 'error') {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          if (msg.type === 'error') p.reject(new Error(msg.message))
          else p.resolve(msg.value)
        }
      }
    })
  }

  get name(): string {
    return this._name
  }

  private call(adapter: string, method: string, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ type: 'call', id, adapter, method, args })
    })
  }

  private createAdapterProxy(adapterName: string): any {
    return new Proxy(
      {},
      {
        get: (_target, method: string) => {
          if (method === 'then') return undefined // prevent Promise-like behavior
          return (...args: any[]) => this.call(adapterName, method, args)
        }
      }
    )
  }

  get expressionAdapter() {
    return this.createAdapterProxy('expressionAdapter')
  }
  get linksAdapter() {
    return this.createAdapterProxy('linksAdapter')
  }
  get telepresenceAdapter() {
    return this.createAdapterProxy('telepresenceAdapter')
  }
  get settingsUI() {
    return this.createAdapterProxy('settingsUI')
  }
  get languageAdapter() {
    return this.createAdapterProxy('languageAdapter')
  }
  get getByAuthorAdapter() {
    return this.createAdapterProxy('getByAuthorAdapter')
  }
  get getAllAdapter() {
    return this.createAdapterProxy('getAllAdapter')
  }
  get directMessageAdapter() {
    return this.createAdapterProxy('directMessageAdapter')
  }
  get expressionUI() {
    return this.createAdapterProxy('expressionUI')
  }

  isImmutableExpression(address: string): boolean {
    // Cannot be proxied synchronously — return false as safe default
    return false
  }

  interactions(_address: string): any[] {
    // Cannot be proxied synchronously — return empty
    return []
  }

  get teardown() {
    return () => this.destroy()
  }

  destroy(): void {
    this.worker.postMessage({ type: 'destroy' })
    this.worker.terminate()
    // Reject all pending calls
    for (const [, p] of this.pending) {
      p.reject(new Error('Worker destroyed'))
    }
    this.pending.clear()
  }
}

/**
 * Executes language bundles inside Web Workers for sandboxed isolation.
 * Falls back to in-process execution when Workers are unavailable.
 */
export class WebWorkerBundleExecutor implements BundleExecutor {
  async execute(source: string, context: LanguageContext): Promise<Language> {
    if (typeof Worker === 'undefined') {
      return this.executeInProcess(source, context)
    }

    const workerScript = buildWorkerScript()
    const blob = new Blob([workerScript], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    URL.revokeObjectURL(url)

    // Serialize context — strip non-transferable properties
    const serializableContext = {
      agent: { did: context.agent.did },
      storageDirectory: context.storageDirectory,
      customSettings: context.customSettings
    }

    const initResult = await new Promise<{ name: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate()
        reject(new Error('Worker initialization timed out'))
      }, 30000)

      const handler = (event: MessageEvent) => {
        worker.removeEventListener('message', handler)
        clearTimeout(timeout)
        if (event.data.type === 'init-ok') resolve({ name: event.data.name || 'unknown' })
        else reject(new Error(event.data.message || 'Worker init failed'))
      }
      worker.addEventListener('message', handler)
      worker.postMessage({ type: 'init', source, context: serializableContext })
    })

    const proxy = new WorkerLanguageProxy(worker, initResult.name)
    return proxy as unknown as Language
  }

  /**
   * In-process fallback when Web Workers are unavailable (e.g., Node/SSR).
   */
  private async executeInProcess(source: string, context: LanguageContext): Promise<Language> {
    const moduleObj = { exports: {} as any }
    const UTILS = {
      hash(data: string): string {
        // FNV-1a hash — lightweight, deterministic
        let h = 0x811c9dc5
        for (let i = 0; i < data.length; i++) {
          h ^= data.charCodeAt(i)
          h = Math.imul(h, 0x01000193)
        }
        return (h >>> 0).toString(16).padStart(8, '0')
      }
    }
    const fn = new Function('module', 'exports', 'require', 'UTILS', source)
    fn(
      moduleObj,
      moduleObj.exports,
      () => {
        throw new Error('require not supported')
      },
      UTILS
    )

    const exports = moduleObj.exports as LanguageBundleExports
    if (typeof exports.create !== 'function') {
      throw new Error('Language bundle must export a create() function')
    }

    return await exports.create(context)
  }

  destroy(): void {
    // Instance-level cleanup not needed; each execute() returns a self-contained proxy
  }
}

function buildWorkerScript(): string {
  return `
    let language = null;
    let languageContext = null;

    self.onmessage = async (event) => {
      const msg = event.data;

      if (msg.type === 'init') {
        const { source, context } = msg;
        languageContext = context;
        const module = { exports: {} };
        const exports = module.exports;
        const require = (name) => { throw new Error('require("' + name + '") not supported in worker sandbox'); };
        const UTILS = {
          hash(data) {
            let h = 0x811c9dc5;
            for (let i = 0; i < data.length; i++) {
              h ^= data.charCodeAt(i);
              h = Math.imul(h, 0x01000193);
            }
            return (h >>> 0).toString(16).padStart(8, '0');
          }
        };
        try {
          const fn = new Function('module', 'exports', 'require', 'UTILS', source);
          fn(module, exports, require, UTILS);
          const create = module.exports.default || module.exports.create || module.exports;
          if (typeof create !== 'function') throw new Error('Bundle must export create()');
          language = await create(context);
          const name = language.name || 'unknown';
          self.postMessage({ type: 'init-ok', name: name });
        } catch (err) {
          self.postMessage({ type: 'init-error', message: err.message });
        }
      }

      if (msg.type === 'call') {
        const { id, adapter, method, args } = msg;
        try {
          if (!language) throw new Error('Language not initialized');
          let target = language;
          if (adapter && adapter !== 'root') {
            target = language[adapter];
            if (!target) throw new Error('Adapter "' + adapter + '" not found on language');
          }
          const fn = target[method];
          if (typeof fn !== 'function') throw new Error('Method "' + method + '" not found on "' + adapter + '"');
          const result = await fn.apply(target, args);
          self.postMessage({ type: 'result', id, value: result });
        } catch (err) {
          self.postMessage({ type: 'error', id, message: err.message });
        }
      }

      if (msg.type === 'destroy') {
        if (language && typeof language.teardown === 'function') {
          try { language.teardown(); } catch(e) {}
        }
        language = null;
        languageContext = null;
        self.close();
      }
    };
  `
}
