import { describe, it, expect } from 'vitest'
import { parseNeighbourhoodUrl, createNeighbourhoodUrl } from '../url'

describe('neighbourhood URL utilities', () => {
  it('parseNeighbourhoodUrl extracts address', () => {
    expect(parseNeighbourhoodUrl('neighbourhood://Qmabc123')).toBe('Qmabc123')
  })

  it('parseNeighbourhoodUrl throws on invalid prefix', () => {
    expect(() => parseNeighbourhoodUrl('http://example.com')).toThrow('Invalid neighbourhood URL')
  })

  it('createNeighbourhoodUrl creates valid URL', () => {
    expect(createNeighbourhoodUrl('Qmabc123')).toBe('neighbourhood://Qmabc123')
  })

  it('round-trip: create then parse', () => {
    const address = 'Qmxyz789'
    const url = createNeighbourhoodUrl(address)
    expect(parseNeighbourhoodUrl(url)).toBe(address)
  })
})
