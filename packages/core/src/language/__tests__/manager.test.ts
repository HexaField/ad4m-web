import { describe, it, expect } from 'vitest'
import { InProcessLanguageHost } from '../host'
import { LanguageManager } from '../manager'
import { createMockLanguage, createMockContext } from './mock'
import type { LanguageMeta } from '../types'

describe('LanguageManager', () => {
  const context = createMockContext()
  const meta: LanguageMeta = {
    address: 'addr1',
    author: 'did:test:author',
    name: 'Test Language',
    description: 'A test language'
  }

  it('install() loads language and stores meta', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()

    const handle = await manager.install('addr1', meta, language as any, context)
    expect(handle.address).toBe('addr1')
    expect(manager.getMeta('addr1')).toBe(meta)
  })

  it('getLanguage() returns handle', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()

    const handle = await manager.install('addr1', meta, language as any, context)
    expect(manager.getLanguage('addr1')).toBe(handle)
  })

  it('getMeta() returns metadata', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()

    await manager.install('addr1', meta, language as any, context)
    expect(manager.getMeta('addr1')).toEqual(meta)
    expect(manager.getMeta('unknown')).toBeUndefined()
  })

  it('uninstall() unloads and removes', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language, tornDown } = createMockLanguage()

    await manager.install('addr1', meta, language as any, context)
    await manager.uninstall('addr1')

    expect(tornDown.value).toBe(true)
    expect(manager.getLanguage('addr1')).toBeUndefined()
    expect(manager.getMeta('addr1')).toBeUndefined()
  })

  it('getAllInstalled() returns all metadata', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language: lang1 } = createMockLanguage()
    const { language: lang2 } = createMockLanguage()

    const meta2: LanguageMeta = { address: 'addr2', author: 'did:test:author2', name: 'Test 2' }

    await manager.install('addr1', meta, lang1 as any, context)
    await manager.install('addr2', meta2, lang2 as any, context)

    expect(manager.getAllInstalled()).toHaveLength(2)
  })
})
