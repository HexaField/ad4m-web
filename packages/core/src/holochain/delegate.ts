import type { HolochainLanguageDelegate, Dna } from '../language/types'
import type { HolochainConductor, CellId, HolochainSignal } from './types'

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

  async registerDNAs(dnas: Dna[], holochainSignalCallback?: (signal: HolochainSignal) => void): Promise<void> {
    const agentKey = await this.conductor.generateAgentPubKey()
    for (const dna of dnas) {
      const appInfo = await this.conductor.installApp({
        installedAppId: `app-${dna.nick}-${Date.now()}`,
        agentKey,
        happBytes: dna.file
      })
      // Extract cell IDs from cell_info
      for (const [roleName, cells] of Object.entries(appInfo.cellInfo)) {
        for (const cell of cells) {
          if ('provisioned' in cell) {
            const cellId: CellId = {
              dnaHash: cell.provisioned.cellId[0],
              agentPubKey: cell.provisioned.cellId[1]
            }
            // Use roleName or dna.nick as the key
            this.nickToCellId.set(dna.nick, cellId)
            this.registeredCellIds.add(this.cellIdKey(cellId))
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

  async call(dnaNick: string, zomeName: string, fnName: string, params: unknown): Promise<unknown> {
    const cellId = this.nickToCellId.get(dnaNick)
    if (!cellId) {
      throw new Error(`Unknown DNA nick: ${dnaNick}`)
    }
    return this.conductor.callZome(cellId, zomeName, fnName, params)
  }
}
