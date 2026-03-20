import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedWriter } from '../debounce'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createDebouncedWriter', () => {
  it('calls write function after interval', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined)
    const writer = createDebouncedWriter(writeFn, 100)
    writer.markDirty()
    expect(writeFn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(writeFn).toHaveBeenCalledTimes(1)
    writer.stop()
  })

  it('multiple markDirty within interval → single write', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined)
    const writer = createDebouncedWriter(writeFn, 100)
    writer.markDirty()
    writer.markDirty()
    writer.markDirty()
    await vi.advanceTimersByTimeAsync(100)
    expect(writeFn).toHaveBeenCalledTimes(1)
    writer.stop()
  })

  it('flush writes immediately', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined)
    const writer = createDebouncedWriter(writeFn, 5000)
    writer.markDirty()
    await writer.flush()
    expect(writeFn).toHaveBeenCalledTimes(1)
    writer.stop()
  })

  it('stop prevents pending write', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined)
    const writer = createDebouncedWriter(writeFn, 100)
    writer.markDirty()
    writer.stop()
    await vi.advanceTimersByTimeAsync(200)
    expect(writeFn).not.toHaveBeenCalled()
  })

  it('does not write if not dirty', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined)
    const writer = createDebouncedWriter(writeFn, 100)
    await writer.flush()
    expect(writeFn).not.toHaveBeenCalled()
    writer.stop()
  })
})
