import type { Expression } from '../agent/types'
import type { ContentStore } from '../bootstrap/types'
import type { LinkExpression } from '../linkstore/types'
import type { LanguageManager } from '../language/manager'
import type { OnlineAgent } from '../language/types'
import type { PerspectiveManager } from '../perspective/manager'
import { PerspectiveState, type PerspectiveHandle } from '../perspective/types'
import type { NeighbourhoodExpression, Neighbourhood } from './types'
import { parseNeighbourhoodUrl, createNeighbourhoodUrl } from './url'

export type SignExpressionFn = (data: any) => Promise<Expression<any>>

export class NeighbourhoodManager {
  private perspectiveManager: PerspectiveManager
  private languageManager: LanguageManager
  private contentStore: ContentStore
  private sign: SignExpressionFn

  constructor(
    perspectiveManager: PerspectiveManager,
    languageManager: LanguageManager,
    contentStore: ContentStore,
    sign: SignExpressionFn
  ) {
    this.perspectiveManager = perspectiveManager
    this.languageManager = languageManager
    this.contentStore = contentStore
    this.sign = sign
  }

  async joinFromUrl(url: string): Promise<PerspectiveHandle> {
    const address = parseNeighbourhoodUrl(url)

    const raw = await this.contentStore.get(address)
    if (!raw) {
      throw new Error(`Neighbourhood expression not found at address: ${address}`)
    }

    const neighbourhoodExpr: NeighbourhoodExpression = JSON.parse(raw)
    const linkLanguageAddress = neighbourhoodExpr.data.linkLanguage

    // Create perspective in join-initiated state
    const handle = this.perspectiveManager.add(`Joined: ${linkLanguageAddress.slice(0, 8)}`)
    handle.state = PerspectiveState.NeighbourhoodJoinInitiated
    handle.sharedUrl = url
    handle.neighbourhood = neighbourhoodExpr

    // Wire the link language's sync adapter into the perspective
    const langHandle = this.languageManager.getLanguage(linkLanguageAddress)
    if (langHandle?.language.linksAdapter) {
      this.perspectiveManager.setLinkLanguage(handle.uuid, langHandle.language.linksAdapter)
    }
    handle.state = PerspectiveState.Synced

    return handle
  }

  async publishFromPerspective(
    uuid: string,
    linkLanguageAddress: string,
    meta: { links: LinkExpression[] }
  ): Promise<string> {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle) {
      throw new Error(`Perspective not found: ${uuid}`)
    }

    const neighbourhood: Neighbourhood = {
      linkLanguage: linkLanguageAddress,
      meta
    }

    const signed = await this.sign(neighbourhood)
    const neighbourhoodExpr: NeighbourhoodExpression = {
      author: signed.author,
      data: neighbourhood,
      proof: signed.proof,
      timestamp: signed.timestamp
    }

    handle.state = PerspectiveState.NeighbourhoodCreationInitiated

    const content = JSON.stringify(neighbourhoodExpr)
    const address = await this.contentStore.put(content)
    const neighbourhoodUrl = createNeighbourhoodUrl(address)

    handle.sharedUrl = neighbourhoodUrl
    handle.neighbourhood = neighbourhoodExpr

    // Wire the link language's sync adapter into the perspective
    const langHandle = this.languageManager.getLanguage(linkLanguageAddress)
    if (langHandle?.language.linksAdapter) {
      this.perspectiveManager.setLinkLanguage(uuid, langHandle.language.linksAdapter)
    }

    handle.state = PerspectiveState.Synced

    return neighbourhoodUrl
  }

  async getOtherAgents(uuid: string): Promise<string[]> {
    const adapter = this.perspectiveManager.getLinkLanguage(uuid)
    if (!adapter) return []
    return adapter.others()
  }

  async getOnlineAgents(uuid: string): Promise<OnlineAgent[]> {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle?.neighbourhood) return []

    const langHandle = this.languageManager.getLanguage(handle.neighbourhood.data.linkLanguage)
    if (!langHandle?.language.telepresenceAdapter) return []
    return langHandle.language.telepresenceAdapter.getOnlineAgents()
  }

  hasTelepresenceAdapter(uuid: string): boolean {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle?.neighbourhood) return false

    const langHandle = this.languageManager.getLanguage(handle.neighbourhood.data.linkLanguage)
    return !!langHandle?.language.telepresenceAdapter
  }

  async setOnlineStatus(uuid: string, status: any): Promise<void> {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle?.neighbourhood) throw new Error('Not a shared perspective')

    const langHandle = this.languageManager.getLanguage(handle.neighbourhood.data.linkLanguage)
    if (!langHandle?.language.telepresenceAdapter) throw new Error('No telepresence adapter')
    await langHandle.language.telepresenceAdapter.setOnlineStatus(status)
  }

  async sendSignal(uuid: string, remoteDid: string, payload: any): Promise<void> {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle?.neighbourhood) throw new Error('Not a shared perspective')

    const langHandle = this.languageManager.getLanguage(handle.neighbourhood.data.linkLanguage)
    if (!langHandle?.language.telepresenceAdapter) throw new Error('No telepresence adapter')
    await langHandle.language.telepresenceAdapter.sendSignal(remoteDid, payload)
  }

  async sendBroadcast(uuid: string, payload: any): Promise<void> {
    const handle = this.perspectiveManager.get(uuid)
    if (!handle?.neighbourhood) throw new Error('Not a shared perspective')

    const langHandle = this.languageManager.getLanguage(handle.neighbourhood.data.linkLanguage)
    if (!langHandle?.language.telepresenceAdapter) throw new Error('No telepresence adapter')
    await langHandle.language.telepresenceAdapter.sendBroadcast(payload)
  }
}
