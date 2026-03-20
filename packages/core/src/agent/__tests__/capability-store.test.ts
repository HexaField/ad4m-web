import { describe, it, expect } from 'vitest'
import { CapabilityStore } from '../capability-store'

describe('CapabilityStore', () => {
  it('stores and retrieves pending requests', () => {
    const store = new CapabilityStore()
    const authInfo = { appName: 'Test', appDesc: 'desc' }
    store.addPendingRequest('req-1', authInfo, '123456')
    const pending = store.getPendingRequest('req-1')
    expect(pending).toBeDefined()
    expect(pending!.authInfo.appName).toBe('Test')
    expect(pending!.rand).toBe('123456')
  })

  it('returns undefined for unknown pending request', () => {
    const store = new CapabilityStore()
    expect(store.getPendingRequest('nonexistent')).toBeUndefined()
  })

  it('removes pending requests', () => {
    const store = new CapabilityStore()
    store.addPendingRequest('req-1', { appName: 'Test', appDesc: 'desc' }, '111111')
    store.removePendingRequest('req-1')
    expect(store.getPendingRequest('req-1')).toBeUndefined()
  })

  it('stores and lists granted apps', () => {
    const store = new CapabilityStore()
    const auth1 = { appName: 'App1', appDesc: 'desc1' }
    const auth2 = { appName: 'App2', appDesc: 'desc2' }
    store.addGrantedApp('req-1', auth1, 'token1')
    store.addGrantedApp('req-2', auth2, 'token2')
    const apps = store.getGrantedApps()
    expect(apps).toHaveLength(2)
    expect(apps.map((a) => a.authInfo.appName)).toContain('App1')
    expect(apps.map((a) => a.authInfo.appName)).toContain('App2')
  })

  it('revokes granted apps', () => {
    const store = new CapabilityStore()
    store.addGrantedApp('req-1', { appName: 'App', appDesc: 'desc' }, 'token')
    expect(store.revokeApp('req-1')).toBe(true)
    expect(store.getGrantedApps()).toHaveLength(0)
  })

  it('revokeApp returns false for unknown ID', () => {
    const store = new CapabilityStore()
    expect(store.revokeApp('nonexistent')).toBe(false)
  })
})
