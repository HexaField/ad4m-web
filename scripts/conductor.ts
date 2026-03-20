import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import WebSocket from 'ws'

const HOLOCHAIN_BIN = `${process.env.HOME}/repos/hexafield/holochain-conductor/target/release/holochain`
const ADMIN_PORT = 4321 + Math.floor(Math.random() * 1000)

async function waitForPort(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ws = new WebSocket(`ws://localhost:${port}`, { headers: { Origin: 'localhost' } })
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.close()
          resolve()
        })
        ws.on('error', reject)
      })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`Timeout waiting for port ${port}`)
}

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hc-conductor-'))
  const configPath = join(tmpDir, 'conductor-config.yaml')

  writeFileSync(
    configPath,
    `
data_root_path: ${tmpDir}/data
keystore:
  type: lair_server_in_proc
admin_interfaces:
  - driver:
      type: websocket
      port: ${ADMIN_PORT}
      allowed_origins: "*"
network:
  bootstrap_url: https://bootstrap.ad4m.dev:4433
  signal_url: wss://sbd.holo.host
  relay_url: wss://sbd.holo.host
  webrtc_config: null
`
  )

  const conductor = spawn(HOLOCHAIN_BIN, ['-c', configPath, '--piped'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, RUST_LOG: 'warn' }
  })

  conductor.stdin.write('\n')
  conductor.stdin.end()

  await waitForPort(ADMIN_PORT)

  console.log(JSON.stringify({ adminPort: ADMIN_PORT, dataDir: tmpDir }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
