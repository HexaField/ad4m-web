export class FriendService {
  private friends = new Set<string>()

  getFriends(): string[] {
    return [...this.friends]
  }

  addFriend(did: string): string[] {
    this.friends.add(did)
    return this.getFriends()
  }

  removeFriend(did: string): string[] {
    this.friends.delete(did)
    return this.getFriends()
  }

  getFriendStatus(
    _did: string
  ): { author: string; timestamp: string; data: { links: never[] }; proof: { key: string; signature: string } } | null {
    return null
  }
}
