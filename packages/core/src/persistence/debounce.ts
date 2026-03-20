import type { DebouncedWriter } from './types'

export function createDebouncedWriter(writeFn: () => Promise<void>, intervalMs = 2000): DebouncedWriter {
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing = false

  async function doWrite(): Promise<void> {
    if (!dirty || writing) return
    dirty = false
    writing = true
    try {
      await writeFn()
    } finally {
      writing = false
    }
  }

  function schedule(): void {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      void doWrite()
    }, intervalMs)
  }

  return {
    markDirty(): void {
      dirty = true
      schedule()
    },

    async flush(): Promise<void> {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      await doWrite()
    },

    stop(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      dirty = false
    }
  }
}
