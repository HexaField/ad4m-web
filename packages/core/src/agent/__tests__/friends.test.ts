import { describe, it, expect } from 'vitest'
import { FriendService } from '../friends'

describe('FriendService', () => {
  it('starts with empty friends list', () => {
    const svc = new FriendService()
    expect(svc.getFriends()).toEqual([])
  })

  it('adds a friend', () => {
    const svc = new FriendService()
    const result = svc.addFriend('did:test:alice')
    expect(result).toContain('did:test:alice')
  })

  it('removes a friend', () => {
    const svc = new FriendService()
    svc.addFriend('did:test:alice')
    const result = svc.removeFriend('did:test:alice')
    expect(result).toEqual([])
  })

  it('returns null for friend status', () => {
    const svc = new FriendService()
    expect(svc.getFriendStatus('did:test:unknown')).toBeNull()
  })
})
