import type { KVStore, BlobStore } from '@ad4m-web/core'

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbRequest<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export class IndexedDBKVStore implements KVStore {
  constructor(
    private dbName: string,
    private storeName: string = 'kv'
  ) {}

  async get(key: string): Promise<string | null> {
    const db = await openDB(this.dbName, this.storeName)
    const result = await idbRequest(db, this.storeName, 'readonly', (s) => s.get(key))
    return result ?? null
  }

  async set(key: string, value: string): Promise<void> {
    const db = await openDB(this.dbName, this.storeName)
    await idbRequest(db, this.storeName, 'readwrite', (s) => s.put(value, key))
  }

  async delete(key: string): Promise<void> {
    const db = await openDB(this.dbName, this.storeName)
    await idbRequest(db, this.storeName, 'readwrite', (s) => s.delete(key))
  }

  async keys(): Promise<string[]> {
    const db = await openDB(this.dbName, this.storeName)
    const result = await idbRequest(db, this.storeName, 'readonly', (s) => s.getAllKeys())
    return result.map((k) => String(k))
  }

  async clear(): Promise<void> {
    const db = await openDB(this.dbName, this.storeName)
    await idbRequest(db, this.storeName, 'readwrite', (s) => s.clear())
  }
}

export class IndexedDBBlobStore implements BlobStore {
  constructor(
    private dbName: string,
    private storeName: string = 'blobs'
  ) {}

  async get(key: string): Promise<Uint8Array | null> {
    const db = await openDB(this.dbName, this.storeName)
    const result = await idbRequest(db, this.storeName, 'readonly', (s) => s.get(key))
    return result ?? null
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    const db = await openDB(this.dbName, this.storeName)
    await idbRequest(db, this.storeName, 'readwrite', (s) => s.put(value, key))
  }

  async delete(key: string): Promise<void> {
    const db = await openDB(this.dbName, this.storeName)
    await idbRequest(db, this.storeName, 'readwrite', (s) => s.delete(key))
  }

  async has(key: string): Promise<boolean> {
    const db = await openDB(this.dbName, this.storeName)
    const result = await idbRequest(db, this.storeName, 'readonly', (s) => s.count(key))
    return result > 0
  }
}
