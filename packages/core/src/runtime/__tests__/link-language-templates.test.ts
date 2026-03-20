import { describe, it, expect } from 'vitest'
import { LinkLanguageTemplateService } from '../link-language-templates'

describe('LinkLanguageTemplateService', () => {
  it('starts empty', () => {
    const svc = new LinkLanguageTemplateService()
    expect(svc.getKnownTemplates()).toEqual([])
  })

  it('accepts initial templates', () => {
    const svc = new LinkLanguageTemplateService(['addr1'])
    expect(svc.getKnownTemplates()).toEqual(['addr1'])
  })

  it('addTemplate adds and returns all', () => {
    const svc = new LinkLanguageTemplateService()
    const result = svc.addTemplate('addr1')
    expect(result).toEqual(['addr1'])
  })

  it('deduplicates templates', () => {
    const svc = new LinkLanguageTemplateService()
    svc.addTemplate('addr1')
    svc.addTemplate('addr1')
    expect(svc.getKnownTemplates()).toHaveLength(1)
  })

  it('removeTemplate removes and returns remaining', () => {
    const svc = new LinkLanguageTemplateService(['addr1', 'addr2'])
    const result = svc.removeTemplate('addr1')
    expect(result).toEqual(['addr2'])
  })

  it('hasTemplate checks membership', () => {
    const svc = new LinkLanguageTemplateService(['addr1'])
    expect(svc.hasTemplate('addr1')).toBe(true)
    expect(svc.hasTemplate('addr2')).toBe(false)
  })

  it('toJSON / fromJSON round-trip', () => {
    const svc = new LinkLanguageTemplateService(['addr1', 'addr2'])
    const json = svc.toJSON()
    const restored = LinkLanguageTemplateService.fromJSON(json)
    expect(restored.getKnownTemplates()).toEqual(svc.getKnownTemplates())
  })
})
