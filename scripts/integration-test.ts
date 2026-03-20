import WebSocket from 'ws'
import { encode, decode } from '@msgpack/msgpack'
import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const HOLOCHAIN_BIN = `${process.env.HOME}/repos/hexafield/holochain-conductor/target/release/holochain`
const HAPP_PATH = `${process.env.HOME}/Desktop/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/Perspective-Diff-Sync.happ`
const ADMIN_PORT = 4321
const NETWORK_SEED = `test-${Date.now()}`

// ─── Helpers ────────────────────────────────────────────────────────────────

let requestId = 0

function sendRequest(ws: WebSocket, request: unknown): Promise<unknown> {
  const id = requestId++
  const innerData = encode(request)
  const msg = encode({ type: 'request', id, data: innerData })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timed out: ${JSON.stringify(request).slice(0, 100)}`))
    }, 30000)

    const handler = (raw: WebSocket.RawData) => {
      const outer = decode(new Uint8Array(raw as ArrayBuffer)) as Record<string, unknown>
      if (outer.type === 'response' && outer.id === id) {
        clearTimeout(timeout)
        ws.off('message', handler)
        if (outer.data) {
          resolve(decode(outer.data as Uint8Array))
        } else {
          resolve(null)
        }
      }
    }
    ws.on('message', handler)
    ws.send(msg)
  })
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

async function waitForPort(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ws = await connectWs(`ws://localhost:${port}`)
      ws.close()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`Timeout waiting for port ${port}`)
}

// ─── Main Test ──────────────────────────────────────────────────────────────

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hc-test-'))
  console.log(`Temp dir: ${tmpDir}`)

  // Write conductor config
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

  // Start conductor
  console.log('Starting Holochain conductor...')
  const conductor = spawn(HOLOCHAIN_BIN, ['-c', configPath, '--piped'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, RUST_LOG: 'warn' }
  })

  // Send passphrase via stdin (empty passphrase)
  conductor.stdin.write('\n')
  conductor.stdin.end()

  conductor.stdout.on('data', (d: Buffer) => process.stdout.write(`[conductor] ${d}`))
  conductor.stderr.on('data', (d: Buffer) => process.stderr.write(`[conductor] ${d}`))

  try {
    await waitForPort(ADMIN_PORT)
    console.log('Conductor ready on port', ADMIN_PORT)

    const adminWs = await connectWs(`ws://localhost:${ADMIN_PORT}`)
    console.log('Connected to admin interface')

    // Generate two agent keys
    const agentAResp = (await sendRequest(adminWs, { type: 'generate_agent_pub_key' })) as {
      type: string
      value: Uint8Array
    }
    const agentBResp = (await sendRequest(adminWs, { type: 'generate_agent_pub_key' })) as {
      type: string
      value: Uint8Array
    }
    console.log('Agent A key:', Buffer.from(agentAResp.value).toString('hex').slice(0, 16) + '...')
    console.log('Agent B key:', Buffer.from(agentBResp.value).toString('hex').slice(0, 16) + '...')

    // Install app for Agent A
    const installA = (await sendRequest(adminWs, {
      type: 'install_app',
      value: {
        source: { path: HAPP_PATH },
        agent_key: agentAResp.value,
        installed_app_id: 'agent-a',
        network_seed: NETWORK_SEED,
        roles_settings: null,
        ignore_genesis_failure: false
      }
    })) as {
      type: string
      value: {
        installed_app_id: string
        cell_info: Record<string, { provisioned: { cell_id: [Uint8Array, Uint8Array] } }[]>
      }
    }
    console.log('Agent A app installed:', installA.type)

    // Install app for Agent B
    const installB = (await sendRequest(adminWs, {
      type: 'install_app',
      value: {
        source: { path: HAPP_PATH },
        agent_key: agentBResp.value,
        installed_app_id: 'agent-b',
        network_seed: NETWORK_SEED,
        roles_settings: null,
        ignore_genesis_failure: false
      }
    })) as {
      type: string
      value: {
        installed_app_id: string
        cell_info: Record<string, { provisioned: { cell_id: [Uint8Array, Uint8Array] } }[]>
      }
    }
    console.log('Agent B app installed:', installB.type)

    // Enable both
    await sendRequest(adminWs, { type: 'enable_app', value: { installed_app_id: 'agent-a' } })
    await sendRequest(adminWs, { type: 'enable_app', value: { installed_app_id: 'agent-b' } })
    console.log('Both apps enabled')

    // Attach app interfaces
    const attachA = (await sendRequest(adminWs, {
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: 'agent-a' }
    })) as { type: string; value: { port: number } }
    const attachB = (await sendRequest(adminWs, {
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: 'agent-b' }
    })) as { type: string; value: { port: number } }
    console.log('App interface A on port:', attachA.value.port)
    console.log('App interface B on port:', attachB.value.port)

    // Issue auth tokens
    const tokenA = (await sendRequest(adminWs, {
      type: 'issue_app_authentication_token',
      value: { installed_app_id: 'agent-a', single_use: false, expiry_seconds: 0 }
    })) as { type: string; value: { token: Uint8Array } }
    const tokenB = (await sendRequest(adminWs, {
      type: 'issue_app_authentication_token',
      value: { installed_app_id: 'agent-b', single_use: false, expiry_seconds: 0 }
    })) as { type: string; value: { token: Uint8Array } }
    console.log('Auth tokens issued')

    // Connect to app interfaces
    const appWsA = await connectWs(`ws://localhost:${attachA.value.port}`)
    const appWsB = await connectWs(`ws://localhost:${attachB.value.port}`)

    // Authenticate
    appWsA.send(encode({ type: 'authenticate', data: encode({ token: tokenA.value.token }) }))
    appWsB.send(encode({ type: 'authenticate', data: encode({ token: tokenB.value.token }) }))
    // Small wait for auth to process
    await new Promise((r) => setTimeout(r, 500))
    console.log('Both agents authenticated')

    // Get cell IDs
    const cellInfoA = Object.values(installA.value.cell_info)[0]
    const cellIdA = cellInfoA[0].provisioned.cell_id
    const cellInfoB = Object.values(installB.value.cell_info)[0]
    const cellIdB = cellInfoB[0].provisioned.cell_id

    // Helper for zome calls
    async function callZome(ws: WebSocket, cellId: [Uint8Array, Uint8Array], fnName: string, payload: unknown) {
      const nonce = new Uint8Array(32)
      for (let i = 0; i < 32; i++) nonce[i] = Math.floor(Math.random() * 256)
      const expiresAt = BigInt((Date.now() + 300000) * 1000)

      return sendRequest(ws, {
        type: 'call_zome',
        value: {
          cell_id: cellId,
          zome_name: 'perspective_diff_sync',
          fn_name: fnName,
          payload: encode(payload),
          provenance: cellId[1],
          nonce,
          expires_at: expiresAt
        }
      })
    }

    // ─── Sync Test ────────────────────────────────────────────────────────

    console.log('\n=== Starting sync test ===\n')

    // Agent A: create DID link + add active agent
    const didA = 'did:test:agent-a'
    const didB = 'did:test:agent-b'

    console.log('Agent A: creating DID pub key link...')
    await callZome(appWsA, cellIdA, 'create_did_pub_key_link', didA)

    console.log('Agent A: adding active agent link...')
    await callZome(appWsA, cellIdA, 'add_active_agent_link', null)

    console.log('Agent A: initial sync...')
    await callZome(appWsA, cellIdA, 'sync', didA)

    // Agent A: commit a link
    console.log('Agent A: committing link...')
    const linkA = {
      author: didA,
      timestamp: new Date().toISOString(),
      data: { source: 'a://source', target: 'a://target', predicate: 'a://predicate' },
      proof: { key: '', signature: '' }
    }
    const diffA = {
      additions: [linkA],
      removals: []
    }
    const commitAResult = await callZome(appWsA, cellIdA, 'commit', { diff: diffA, my_did: didA })
    console.log('Agent A commit result type:', (commitAResult as Record<string, unknown>).type)

    // Agent A: render to verify
    const renderA = (await callZome(appWsA, cellIdA, 'render', null)) as { type: string; value: Uint8Array }
    const renderAData = renderA.value ? decode(renderA.value) : renderA
    console.log('Agent A render:', JSON.stringify(renderAData).slice(0, 200))

    // Agent B: set up and sync
    console.log('\nAgent B: creating DID pub key link...')
    await callZome(appWsB, cellIdB, 'create_did_pub_key_link', didB)

    console.log('Agent B: adding active agent link...')
    await callZome(appWsB, cellIdB, 'add_active_agent_link', null)

    console.log("Agent B: syncing (should see Agent A's link)...")
    await callZome(appWsB, cellIdB, 'sync', didB)

    // Wait for gossip
    console.log('Waiting for gossip...')
    await new Promise((r) => setTimeout(r, 3000))

    // Agent B: sync again after gossip
    await callZome(appWsB, cellIdB, 'sync', didB)

    const renderB = (await callZome(appWsB, cellIdB, 'render', null)) as { type: string; value: Uint8Array }
    const renderBData = renderB.value ? decode(renderB.value) : renderB
    console.log('Agent B render:', JSON.stringify(renderBData).slice(0, 200))

    // Agent B: commit a different link
    console.log('\nAgent B: committing link...')
    const linkB = {
      author: didB,
      timestamp: new Date().toISOString(),
      data: { source: 'b://source', target: 'b://target', predicate: 'b://predicate' },
      proof: { key: '', signature: '' }
    }
    const diffB = {
      additions: [linkB],
      removals: []
    }
    await callZome(appWsB, cellIdB, 'commit', { diff: diffB, my_did: didB })

    // Wait for gossip
    console.log('Waiting for gossip...')
    await new Promise((r) => setTimeout(r, 3000))

    // Agent A: sync and render
    console.log("\nAgent A: syncing (should see Agent B's link)...")
    await callZome(appWsA, cellIdA, 'sync', didA)

    const renderA2 = (await callZome(appWsA, cellIdA, 'render', null)) as { type: string; value: Uint8Array }
    const renderA2Data = renderA2.value ? decode(renderA2.value) : renderA2
    console.log('Agent A final render:', JSON.stringify(renderA2Data).slice(0, 400))

    // Agent B: final render
    const renderB2 = (await callZome(appWsB, cellIdB, 'render', null)) as { type: string; value: Uint8Array }
    const renderB2Data = renderB2.value ? decode(renderB2.value) : renderB2
    console.log('Agent B final render:', JSON.stringify(renderB2Data).slice(0, 400))

    console.log('\n=== Integration test complete ===')

    // Cleanup websockets
    appWsA.close()
    appWsB.close()
    adminWs.close()
  } finally {
    // Kill conductor
    conductor.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 1000))
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      /* ignore */
    }
    console.log('Cleaned up')
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
