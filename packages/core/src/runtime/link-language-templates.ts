/**
 * Manages known link language template addresses.
 * Templates are Language addresses that can be used to create new neighbourhoods.
 */
export class LinkLanguageTemplateService {
  private templates = new Set<string>()

  constructor(initial?: string[]) {
    if (initial) {
      for (const t of initial) this.templates.add(t)
    }
  }

  getKnownTemplates(): string[] {
    return [...this.templates]
  }

  addTemplate(address: string): string[] {
    this.templates.add(address)
    return this.getKnownTemplates()
  }

  removeTemplate(address: string): string[] {
    this.templates.delete(address)
    return this.getKnownTemplates()
  }

  hasTemplate(address: string): boolean {
    return this.templates.has(address)
  }

  /** Serialize for persistence */
  toJSON(): string[] {
    return this.getKnownTemplates()
  }

  /** Restore from persisted data */
  static fromJSON(data: string[]): LinkLanguageTemplateService {
    return new LinkLanguageTemplateService(data)
  }
}
