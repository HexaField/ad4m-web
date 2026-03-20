import type { HolochainLanguageDelegate, Dna } from '../language/types'
import type { HolochainConductor, CellId, HolochainSignal, ZomeCallSigner } from './types'

export class HolochainLanguageDelegateImpl implements HolochainLanguageDelegate {
  private conductor: HolochainConductor
  private nickToCellId: Map<string, CellId> = new Map()
  private registeredCellIds: Set<string> = new Set()

  constructor(conductor: HolochainConductor) {
    this.conductor = conductor
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
        happBytes: dna.file
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
            if (signer) {
              await this.conductor.grantCapability(cellId, signer)
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
    if (!signer) throw new Error('ZomeCallSigner required')
    return this.conductor.callZome(cellId, zomeName, fnName, params, signer)
  }
}
