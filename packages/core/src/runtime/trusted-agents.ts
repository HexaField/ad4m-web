/**
 * Manages a set of trusted agent DIDs.
 * Trusted agents are DIDs the executor trusts for certain operations
 * (e.g. accepting link language templates, neighbourhood joins).
 */
export class TrustedAgentService {
  private agents = new Set<string>()

  constructor(initial?: string[]) {
    if (initial) {
      for (const a of initial) this.agents.add(a)
    }
  }

  getTrustedAgents(): string[] {
    return [...this.agents]
  }

  addTrustedAgents(agents: string[]): string[] {
    for (const a of agents) this.agents.add(a)
    return this.getTrustedAgents()
  }

  removeTrustedAgents(agents: string[]): string[] {
    for (const a of agents) this.agents.delete(a)
    return this.getTrustedAgents()
  }

  isTrusted(did: string): boolean {
    return this.agents.has(did)
  }

  /** Serialize for persistence */
  toJSON(): string[] {
    return this.getTrustedAgents()
  }

  /** Restore from persisted data */
  static fromJSON(data: string[]): TrustedAgentService {
    return new TrustedAgentService(data)
  }
}
