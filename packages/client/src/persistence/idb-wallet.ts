import type { WalletStore, WalletData } from '@ad4m-web/core'

const DB_NAME = 'ad4m-wallet'
const STORE_NAME = 'wallet'

function openWalletDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

function idbPut(db: IDBDatabase, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function toBase64(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function serializeWalletData(data: WalletData): string {
  return JSON.stringify({
    mainKey: {
      publicKey: toBase64(data.mainKey.publicKey),
      privateKey: toBase64(data.mainKey.privateKey)
    },
    additionalKeys: data.additionalKeys?.map((k) => ({
      publicKey: toBase64(k.publicKey),
      privateKey: toBase64(k.privateKey)
    }))
  })
}

function deserializeWalletData(json: string): WalletData {
  const obj = JSON.parse(json)
  return {
    mainKey: {
      publicKey: fromBase64(obj.mainKey.publicKey),
      privateKey: fromBase64(obj.mainKey.privateKey)
    },
    additionalKeys: obj.additionalKeys?.map((k: any) => ({
      publicKey: fromBase64(k.publicKey),
      privateKey: fromBase64(k.privateKey)
    }))
  }
}

export class BrowserWalletStore implements WalletStore {
  async exists(key: string): Promise<boolean> {
    const db = await openWalletDB()
    const result = await idbGet(db, key)
    return result !== undefined
  }

  async save(key: string, passphrase: string, data: WalletData): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cryptoKey = await deriveKey(passphrase, salt)
    const plaintext = new TextEncoder().encode(serializeWalletData(data))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext)

    const db = await openWalletDB()
    await idbPut(db, key, {
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext))
    })
  }

  async load(key: string, passphrase: string): Promise<WalletData> {
    const db = await openWalletDB()
    const record = await idbGet<{ salt: string; iv: string; ciphertext: string }>(db, key)
    if (!record) throw new Error(`Wallet key "${key}" not found`)

    const salt = fromBase64(record.salt)
    const iv = fromBase64(record.iv)
    const ciphertext = fromBase64(record.ciphertext)
    const cryptoKey = await deriveKey(passphrase, salt)

    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
    const json = new TextDecoder().decode(plaintext)
    return deserializeWalletData(json)
  }

  async destroy(key: string): Promise<void> {
    const db = await openWalletDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  }
}
