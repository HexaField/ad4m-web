import { describe, it, expect } from 'vitest'
import { InProcessLanguageHost } from '../host'
import { LanguageManager } from '../manager'
import { createMockLanguage, createMockContext } from './mock'
import type { LanguageMeta } from '../types'

describe('Language Registry (LanguageManager extended)', () => {
  const context = createMockContext()
  const meta: LanguageMeta = {
    address: 'addr1',
    author: 'did:test:author',
    name: 'Test Language',
    description: 'A test language'
  }

  it('getLanguageSource() returns stored bundle source', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()
    await manager.install('addr1', meta, language as any, context)
    const source = manager.getLanguageSource('addr1')
    expect(source).toBeTruthy()
  })

  it('getLanguageSource() throws for unknown address', () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    expect(() => manager.getLanguageSource('unknown')).toThrow('Source not found')
  })

  it('listLanguages() returns all loaded languages', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language: l1 } = createMockLanguage()
    const { language: l2 } = createMockLanguage()
    await manager.install('addr1', meta, l1 as any, context)
    await manager.install('addr2', { ...meta, address: 'addr2', name: 'Other Lang' }, l2 as any, context)

    const all = manager.listLanguages()
    expect(all).toHaveLength(2)
  })

  it('listLanguages() filters by name', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language: l1 } = createMockLanguage()
    const { language: l2 } = createMockLanguage()
    await manager.install('addr1', meta, l1 as any, context)
    await manager.install('addr2', { ...meta, address: 'addr2', name: 'Other Lang' }, l2 as any, context)

    const filtered = manager.listLanguages('test')
    expect(filtered).toHaveLength(2)
    const noMatch = manager.listLanguages('nonexistent')
    expect(noMatch).toHaveLength(0)
  })

  it('removeLanguage() removes and returns true', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()
    await manager.install('addr1', meta, language as any, context)
    expect(manager.removeLanguage('addr1')).toBe(true)
    expect(manager.getLanguage('addr1')).toBeUndefined()
  })

  it('removeLanguage() returns false for unknown', () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    expect(manager.removeLanguage('unknown')).toBe(false)
  })

  it('writeSettings() and getSettings()', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()
    await manager.install('addr1', meta, language as any, context)

    expect(manager.getSettings('addr1')).toBe('{}')
    expect(manager.writeSettings('addr1', '{"key":"val"}')).toBe(true)
    expect(manager.getSettings('addr1')).toBe('{"key":"val"}')
  })

  it('writeSettings() returns false for unknown language', () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    expect(manager.writeSettings('unknown', '{}')).toBe(false)
  })

  it('uninstall() cleans up settings and sources', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()
    await manager.install('addr1', meta, language as any, context)
    manager.writeSettings('addr1', '{"x":1}')

    await manager.uninstall('addr1')
    expect(manager.getSettings('addr1')).toBe('{}')
    expect(() => manager.getLanguageSource('addr1')).toThrow()
  })
})
