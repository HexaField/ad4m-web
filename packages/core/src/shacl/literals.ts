export function parseLiteral(uri: string): { type: string; value: any } | null {
  if (!uri.startsWith('literal://')) return null

  const rest = uri.slice('literal://'.length)

  if (rest.startsWith('string:')) {
    return { type: 'string', value: rest.slice('string:'.length) }
  }
  if (rest.startsWith('number:')) {
    return { type: 'number', value: parseFloat(rest.slice('number:'.length)) }
  }
  if (rest.startsWith('boolean:')) {
    return { type: 'boolean', value: rest.slice('boolean:'.length) === 'true' }
  }
  if (rest.startsWith('json(') && rest.endsWith(')')) {
    const jsonStr = rest.slice('json('.length, -1)
    return { type: 'json', value: JSON.parse(jsonStr) }
  }

  return null
}

export function toLiteral(value: string | number | boolean): string {
  if (typeof value === 'string') return `literal://string:${value}`
  if (typeof value === 'number') return `literal://number:${value}`
  if (typeof value === 'boolean') return `literal://boolean:${value}`
  return `literal://string:${String(value)}`
}
