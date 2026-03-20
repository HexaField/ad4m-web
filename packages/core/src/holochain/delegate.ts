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
    const cells = await this.conductor.installApp(dnas)
    for (const cell of cells) {
      this.nickToCellId.set(cell.nick, cell.cellId)
      this.registeredCellIds.add(this.cellIdKey(cell.cellId))
    }

    if (holochainSignalCallback) {
      this.conductor.onSignal((signal: HolochainSignal) => {
        if (this.registeredCellIds.has(this.cellIdKey(signal.cellId))) {
          holochainSignalCallback(signal)
        }
      })
    }
  }

  async call(dnaNick: string, zomeName: string, fnName: string, params: any): Promise<any> {
    const cellId = this.nickToCellId.get(dnaNick)
    if (!cellId) {
      throw new Error(`Unknown DNA nick: ${dnaNick}`)
    }
    return this.conductor.callZome(cellId, zomeName, fnName, params)
  }
}
