import type { HolochainLanguageDelegate, Dna } from '../language/types'
import type { HolochainConductor, CellId, HolochainSignal, ZomeCallSigner } from './types'

export class HolochainLanguageDelegateImpl implements HolochainLanguageDelegate {
  private conductor: HolochainConductor
  private nickToCellId: Map<string, CellId> = new Map()
  private registeredCellIds: Set<string> = new Set()
  private networkSeed?: string
  private defaultSigner?: ZomeCallSigner

  constructor(conductor: HolochainConductor, networkSeed?: string) {
    this.conductor = conductor
    this.networkSeed = networkSeed
  }

  /** Set a default signer for all zome calls when one isn't provided explicitly. */
  setDefaultSigner(signer: ZomeCallSigner): void {
    this.defaultSigner = signer
  }

  private cellIdKey(cellId: CellId): string {
    return `${Array.from(cellId.dnaHash).join(',')}_${Array.from(cellId.agentPubKey).join(',')}`
  }

  async registerDNAs(
    dnas: Dna[],
    holochainSignalCallback?: (signal: HolochainSignal) => void,
    signer?: ZomeCallSigner
  ): Promise<void> {
    const agentKey = await this.conductor.generateAgentPubKey()
    for (const dna of dnas) {
      const appInfo = await this.conductor.installApp({
        installedAppId: `app-${dna.nick}-${Date.now()}`,
        agentKey,
        happBytes: dna.file,
        networkSeed: this.networkSeed
      })
      for (const cells of Object.values(appInfo.cellInfo)) {
        for (const cell of cells) {
          if ('provisioned' in cell) {
            const cellId: CellId = {
              dnaHash: cell.provisioned.cellId[0],
              agentPubKey: cell.provisioned.cellId[1]
            }
            this.nickToCellId.set(dna.nick, cellId)
            this.registeredCellIds.add(this.cellIdKey(cellId))

            // Create signing credentials if none provided
            const effectiveSigner = signer ?? this.defaultSigner
            if (effectiveSigner) {
              await this.conductor.grantCapability(cellId, effectiveSigner)
            } else {
              // Auto-create signing credentials
              const autoSigner = await this.conductor.createSigningCredentials(cellId)
              this.setDefaultSigner(autoSigner)
            }
          }
        }
      }
    }

    if (holochainSignalCallback) {
      this.conductor.onSignal((signal: HolochainSignal) => {
        if (this.registeredCellIds.has(this.cellIdKey(signal.cellId))) {
          holochainSignalCallback(signal)
        }
      })
    }
  }

  async call(
    dnaNick: string,
    zomeName: string,
    fnName: string,
    params: unknown,
    signer?: ZomeCallSigner
  ): Promise<unknown> {
    const cellId = this.nickToCellId.get(dnaNick)
    if (!cellId) throw new Error(`Unknown DNA nick: ${dnaNick}`)
    const effectiveSigner = signer ?? this.defaultSigner
    if (!effectiveSigner) throw new Error('ZomeCallSigner required')
    return this.conductor.callZome(cellId, zomeName, fnName, params, effectiveSigner)
  }
}
