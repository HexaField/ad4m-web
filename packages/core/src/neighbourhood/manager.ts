import type { Expression } from '../agent/types'
import type { ContentStore } from '../bootstrap/types'
import type { LinkExpression } from '../linkstore/types'
import type { LanguageManager } from '../language/manager'
import type { LanguageContext, OnlineAgent } from '../language/types'
import type { HolochainConductor } from '../holochain/types'
import { HolochainLanguageDelegateImpl } from '../holochain/delegate'
import { createPDiffSyncLanguage } from '../language/p-diff-sync'
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
  private holochainConductor?: HolochainConductor
  private baseLanguageContext?: LanguageContext

  constructor(
    perspectiveManager: PerspectiveManager,
    languageManager: LanguageManager,
    contentStore: ContentStore,
    sign: SignExpressionFn,
    holochainConductor?: HolochainConductor,
    baseLanguageContext?: LanguageContext
  ) {
    this.perspectiveManager = perspectiveManager
    this.languageManager = languageManager
    this.contentStore = contentStore
    this.sign = sign
    this.holochainConductor = holochainConductor
    this.baseLanguageContext = baseLanguageContext
  }

  /**
   * Extract the network seed (uid) from a neighbourhood's link language metadata.
   */
  private extractNetworkSeed(linkLanguageAddress: string): string | undefined {
    const meta = this.languageManager.getMeta(linkLanguageAddress)
    if (meta?.templateAppliedParams) {
      try {
        const params = JSON.parse(meta.templateAppliedParams)
        return params.uid
      } catch {
        // not valid JSON
      }
    }
    return undefined
  }

  /**
   * Extract hApp bytes from a language bundle source string.
   * Looks for the base64-encoded BUNDLE export in the bundle JS.
   */
  private extractHappBytesFromBundle(bundleSource: string): Uint8Array | null {
    // The bundle embeds the hApp as a base64 string in a variable like:
    // var happ_default = "base64data..."
    // or BUNDLE = Buffer.from(happ_default, "base64")
    // Look for a large base64 string assignment
    const match = bundleSource.match(/var\s+happ_default\s*=\s*"([A-Za-z0-9+/=]{1000,})"/)
    if (match) {
      const b64 = match[1]
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }
    return null
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

    // Check if language is already loaded
    let langHandle = this.languageManager.getLanguage(linkLanguageAddress)

    // If not loaded and we have a Holochain conductor, try to install from the language bundle
    if (!langHandle?.language.linksAdapter && this.holochainConductor && this.baseLanguageContext) {
      const networkSeed = this.extractNetworkSeed(linkLanguageAddress)

      // Try to get the bundle source and extract hApp bytes
      let happBytes: Uint8Array | null = null
      try {
        const source = this.languageManager.getLanguageSource(linkLanguageAddress)
        happBytes = this.extractHappBytesFromBundle(source)
      } catch {
        // Source not available — check the template source language
        const meta = this.languageManager.getMeta(linkLanguageAddress)
        if (meta?.templateSourceLanguageAddress) {
          try {
            const source = this.languageManager.getLanguageSource(meta.templateSourceLanguageAddress)
            happBytes = this.extractHappBytesFromBundle(source)
          } catch {
            // No source available
          }
        }
      }

      if (happBytes) {
        // Create a per-neighbourhood delegate with the correct network seed
        const delegate = new HolochainLanguageDelegateImpl(this.holochainConductor, networkSeed)
        const context: LanguageContext = {
          ...this.baseLanguageContext,
          Holochain: delegate
        }

        const language = await createPDiffSyncLanguage(
          `p-diff-sync-${linkLanguageAddress.slice(0, 8)}`,
          context,
          happBytes
        )

        // Register directly as a loaded language handle
        langHandle = {
          address: linkLanguageAddress,
          name: language.name,
          language
        }
      }
    }

    // Wire the link language's sync adapter into the perspective
    if (langHandle?.language.linksAdapter) {
      await this.perspectiveManager.startSync(handle.uuid, langHandle.language.linksAdapter)
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
      await this.perspectiveManager.startSync(uuid, langHandle.language.linksAdapter)
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
