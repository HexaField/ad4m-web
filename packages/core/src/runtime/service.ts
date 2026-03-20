export interface ReadinessStatus {
  graphqlReady: boolean
  holochainReady: boolean
  languagesReady: boolean
}

export interface HostingUserInfo {
  did: string
  email: string
  credits: number
  freeAccess: boolean
}

export interface PaymentRequestResult {
  success: boolean
  paymentUrl: string | null
  error: string | null
}

export class RuntimeService {
  private trustedAgents = new Set<string>()
  private knownLinkLanguageTemplates = new Set<string>()
  private hotWalletAddress: string | null = null

  getTrustedAgents(): string[] {
    return [...this.trustedAgents]
  }

  addTrustedAgents(agents: string[]): string[] {
    for (const a of agents) this.trustedAgents.add(a)
    return this.getTrustedAgents()
  }

  removeTrustedAgents(agents: string[]): string[] {
    for (const a of agents) this.trustedAgents.delete(a)
    return this.getTrustedAgents()
  }

  getKnownLinkLanguageTemplates(): string[] {
    return [...this.knownLinkLanguageTemplates]
  }

  addKnownLinkLanguageTemplate(address: string): string[] {
    this.knownLinkLanguageTemplates.add(address)
    return this.getKnownLinkLanguageTemplates()
  }

  removeKnownLinkLanguageTemplate(address: string): string[] {
    this.knownLinkLanguageTemplates.delete(address)
    return this.getKnownLinkLanguageTemplates()
  }

  getReadiness(): ReadinessStatus {
    return { graphqlReady: true, holochainReady: true, languagesReady: true }
  }

  getHcAgentInfos(): string {
    return JSON.stringify([])
  }

  getNetworkMetrics(): string {
    return JSON.stringify({ peers: 0, connections: 0 })
  }

  getTlsDomain(): string | null {
    return null
  }

  getHostingUserInfo(): HostingUserInfo {
    return { did: '', email: '', credits: 0, freeAccess: false }
  }

  setHotWalletAddress(address: string): boolean {
    this.hotWalletAddress = address
    return true
  }

  getHotWalletAddress(): string | null {
    return this.hotWalletAddress
  }

  requestPayment(_amount: string): PaymentRequestResult {
    return { success: false, paymentUrl: null, error: 'Not implemented' }
  }

  setUserCredits(_userDid: string, _credits: number): boolean {
    return true
  }

  setUserFreeAccess(_userDid: string, _freeAccess: boolean): boolean {
    return true
  }
}
