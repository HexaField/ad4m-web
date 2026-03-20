import WebSocket from 'ws'
import { encode, decode } from '@msgpack/msgpack'
import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash, randomBytes, generateKeyPairSync, sign as cryptoSign, createPrivateKey } from 'crypto'

const HOLOCHAIN_BIN = `${process.env.HOME}/repos/hexafield/holochain-conductor/target/release/holochain`
const HAPP_PATH = `${process.env.HOME}/Desktop/ad4m/bootstrap-languages/p-diff-sync/hc-dna/workdir/Perspective-Diff-Sync.happ`
const ADMIN_PORT = 4321 + Math.floor(Math.random() * 1000)
const NETWORK_SEED = `test-${Date.now()}`
const APP_ID_A = `agent-a-${Date.now()}`
const APP_ID_B = `agent-b-${Date.now()}`
const AGENT_PREFIX = Buffer.from([0x84, 0x20, 0x24])

// ─── Signing helpers ────────────────────────────────────────────────────────

interface SigningKeys {
  rawPubKey: Uint8Array // 32 bytes
  agentPubKey: Uint8Array // 39 bytes (HoloHash)
  privateKeyObj: ReturnType<typeof createPrivateKey>
}

function generateSigningKeys(): SigningKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  })
  const rawPub = new Uint8Array(publicKey.subarray(12)) // 32 bytes after SPKI header
  const locHash = createHash('sha256').update(rawPub).digest()
  const loc = locHash.subarray(0, 4)
  const agentPubKey = new Uint8Array(Buffer.concat([AGENT_PREFIX, rawPub, loc]))

  return {
    rawPubKey: rawPub,
    agentPubKey,
    privateKeyObj: createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' })
  }
}

function signData(data: Uint8Array, privateKeyObj: ReturnType<typeof createPrivateKey>): Uint8Array {
  const hash = createHash('sha512').update(data).digest()
  const sig = cryptoSign(null, hash, privateKeyObj)
  return new Uint8Array(sig)
}

// ─── WS helpers ─────────────────────────────────────────────────────────────

let requestId = 0

function sendRequest(ws: WebSocket, request: unknown): Promise<unknown> {
  const id = requestId++
  const innerData = encode(request)
  const msg = encode({ type: 'request', id, data: innerData })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout`)), 30000)
    const handler = (raw: WebSocket.RawData) => {
      const outer = decode(new Uint8Array(raw as ArrayBuffer)) as Record<string, unknown>
      if (outer.type === 'response' && outer.id === id) {
        clearTimeout(timeout)
        ws.off('message', handler)
        if (outer.data) resolve(decode(outer.data as Uint8Array))
        else resolve(null)
      }
    }
    ws.on('message', handler)
    ws.send(msg)
  })
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: 'localhost' } })
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hc-test-'))
  console.log(`Temp dir: ${tmpDir}`)

  writeFileSync(
    join(tmpDir, 'conductor-config.yaml'),
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

  console.log('Starting conductor...')

  const conductor = spawn(HOLOCHAIN_BIN, ['-c', join(tmpDir, 'conductor-config.yaml'), '--piped'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, RUST_LOG: 'warn' }
  })
  conductor.stdin.write('\n')
  conductor.stdin.end()
  conductor.stderr.on('data', (d: Buffer) => {
    if (d.toString().includes('ERROR')) process.stderr.write(`[hc] ${d}`)
  })

  try {
    await waitForPort(ADMIN_PORT)
    console.log('Conductor ready')

    const adminWs = await connectWs(`ws://localhost:${ADMIN_PORT}`)

    // Generate agent keys via lair (conductor-managed)
    const genA = (await sendRequest(adminWs, { type: 'generate_agent_pub_key' })) as { value: Uint8Array }
    const genB = (await sendRequest(adminWs, { type: 'generate_agent_pub_key' })) as { value: Uint8Array }
    console.log('Agent keys generated')

    // Install apps (send as bytes since macOS TCC may block file access)
    const happBytes = readFileSync(HAPP_PATH)
    console.log('Happ size:', happBytes.length)
    const installA = (await sendRequest(adminWs, {
      type: 'install_app',
      value: {
        source: { type: 'bytes', value: new Uint8Array(happBytes) },
        agent_key: genA.value,
        installed_app_id: APP_ID_A,
        network_seed: NETWORK_SEED
      }
    })) as Record<string, unknown>
    if (installA.type !== 'app_installed') throw new Error(`Install A: ${JSON.stringify(installA).slice(0, 1000)}`)
    console.log('Agent A installed')

    const installB = (await sendRequest(adminWs, {
      type: 'install_app',
      value: {
        source: { type: 'bytes', value: new Uint8Array(happBytes) },
        agent_key: genB.value,
        installed_app_id: APP_ID_B,
        network_seed: NETWORK_SEED
      }
    })) as Record<string, unknown>
    if (installB.type !== 'app_installed') throw new Error(`Install B: ${JSON.stringify(installB).slice(0, 300)}`)
    console.log('Agent B installed')

    // Enable
    await sendRequest(adminWs, { type: 'enable_app', value: { installed_app_id: APP_ID_A } })
    await sendRequest(adminWs, { type: 'enable_app', value: { installed_app_id: APP_ID_B } })

    // Get cell IDs
    const valA = installA.value as Record<string, unknown>
    const valB = installB.value as Record<string, unknown>
    const cellMapA = valA.cell_info as Record<string, { type: string; value: { cell_id: [Uint8Array, Uint8Array] } }[]>
    const cellMapB = valB.cell_info as Record<string, { type: string; value: { cell_id: [Uint8Array, Uint8Array] } }[]>
    const cellIdA = Object.values(cellMapA)[0][0].value.cell_id
    const cellIdB = Object.values(cellMapB)[0][0].value.cell_id

    // Generate signing keypairs and grant capabilities
    const sigKeysA = generateSigningKeys()
    const sigKeysB = generateSigningKeys()
    const capSecretA = new Uint8Array(randomBytes(64))
    const capSecretB = new Uint8Array(randomBytes(64))

    // Grant capability for agent A's cell
    const grantA = (await sendRequest(adminWs, {
      type: 'grant_zome_call_capability',
      value: {
        cell_id: cellIdA,
        cap_grant: {
          tag: 'integration-test',
          access: {
            type: 'assigned',
            value: {
              secret: capSecretA,
              assignees: [sigKeysA.agentPubKey]
            }
          },
          functions: { type: 'all' }
        }
      }
    })) as Record<string, unknown>
    console.log('Grant A:', grantA.type)

    const grantB = (await sendRequest(adminWs, {
      type: 'grant_zome_call_capability',
      value: {
        cell_id: cellIdB,
        cap_grant: {
          tag: 'integration-test',
          access: {
            type: 'assigned',
            value: {
              secret: capSecretB,
              assignees: [sigKeysB.agentPubKey]
            }
          },
          functions: { type: 'all' }
        }
      }
    })) as Record<string, unknown>
    console.log('Grant B:', grantB.type)

    // Attach app interfaces
    const attachA = (await sendRequest(adminWs, {
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: APP_ID_A }
    })) as { value: { port: number } }
    const attachB = (await sendRequest(adminWs, {
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: APP_ID_B }
    })) as { value: { port: number } }
    console.log('App ports:', attachA.value.port, attachB.value.port)

    // Auth tokens
    const tokenA = (await sendRequest(adminWs, {
      type: 'issue_app_authentication_token',
      value: { installed_app_id: APP_ID_A, single_use: false, expiry_seconds: 0 }
    })) as { value: { token: Uint8Array } }
    const tokenB = (await sendRequest(adminWs, {
      type: 'issue_app_authentication_token',
      value: { installed_app_id: APP_ID_B, single_use: false, expiry_seconds: 0 }
    })) as { value: { token: Uint8Array } }

    // Connect & authenticate app websockets
    await new Promise((r) => setTimeout(r, 1000)) // Wait for ports to bind
    const appWsA = await connectWs(`ws://localhost:${attachA.value.port}`)
    const appWsB = await connectWs(`ws://localhost:${attachB.value.port}`)
    appWsA.send(encode({ type: 'authenticate', data: encode({ token: tokenA.value.token }) }))
    appWsB.send(encode({ type: 'authenticate', data: encode({ token: tokenB.value.token }) }))
    await new Promise((r) => setTimeout(r, 500))
    console.log('Both agents authenticated')

    // Helper for signed zome calls
    async function callZome(
      ws: WebSocket,
      cellId: [Uint8Array, Uint8Array],
      sigKeys: SigningKeys,
      capSecret: Uint8Array,
      fnName: string,
      payload: unknown
    ) {
      const nonce = new Uint8Array(randomBytes(32))
      const expiresAt = (Date.now() + 300000) * 1000 // microseconds

      // Construct ZomeCallParams matching Rust struct field order
      const zomeCallParams = {
        provenance: sigKeys.agentPubKey,
        cell_id: cellId,
        zome_name: 'perspective_diff_sync',
        fn_name: fnName,
        cap_secret: capSecret,
        payload: encode(payload),
        nonce,
        expires_at: expiresAt
      }

      // Serialize with msgpack (matching holochain_serialized_bytes::encode)
      const paramsBytes = encode(zomeCallParams)

      // Sign SHA-512 of serialized params
      const signature = signData(new Uint8Array(paramsBytes), sigKeys.privateKeyObj)

      const result = (await sendRequest(ws, {
        type: 'call_zome',
        value: {
          bytes: paramsBytes,
          signature
        }
      })) as Record<string, unknown>

      if (result.type === 'error') {
        throw new Error(`${fnName}: ${JSON.stringify(result.value).slice(0, 300)}`)
      }
      if (result.value instanceof Uint8Array && result.value.length > 0) {
        try {
          return decode(result.value)
        } catch {
          return result.value
        }
      }
      return result.value
    }

    // ─── Sync Test ────────────────────────────────────────────────────

    console.log('\n=== Sync Test ===\n')

    const didA = 'did:test:agent-a'
    const didB = 'did:test:agent-b'

    console.log('A: create_did_pub_key_link')
    await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'create_did_pub_key_link', didA)

    console.log('A: sync')
    await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'sync', didA)

    console.log('A: commit link')
    const linkA = {
      author: didA,
      timestamp: new Date().toISOString(),
      data: { source: 'a://source', target: 'a://target', predicate: 'a://predicate' },
      proof: { signature: '', key: '' }
    }
    await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'commit', {
      diff: { additions: [linkA], removals: [] },
      my_did: didA
    })
    console.log('A: committed')

    const renderA = await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'render', null)
    console.log('A render:', JSON.stringify(renderA).slice(0, 300))

    // Agent B
    console.log('\nB: create_did_pub_key_link')
    await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'create_did_pub_key_link', didB)

    console.log('Waiting for gossip (10s)...')
    await new Promise((r) => setTimeout(r, 10000))

    console.log('B: sync')
    const syncB = await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'sync', didB)
    console.log('B sync result:', JSON.stringify(syncB).slice(0, 200))

    console.log('B: current_revision')
    const revB = await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'current_revision', null)
    console.log('B revision:', JSON.stringify(revB).slice(0, 200))

    // Only render if we have a revision
    if (revB) {
      const renderB = await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'render', null)
      console.log('B render:', JSON.stringify(renderB).slice(0, 300))
    } else {
      console.log('B: no revision yet (gossip may need more time)')
    }

    console.log('\nB: commit link')
    const linkB = {
      author: didB,
      timestamp: new Date().toISOString(),
      data: { source: 'b://source', target: 'b://target', predicate: 'b://predicate' },
      proof: { signature: '', key: '' }
    }
    await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'commit', {
      diff: { additions: [linkB], removals: [] },
      my_did: didB
    })

    console.log('Waiting for gossip (5s)...')
    await new Promise((r) => setTimeout(r, 5000))

    console.log('\nA: sync')
    await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'sync', didA)

    const renderA2 = await callZome(appWsA, cellIdA, sigKeysA, capSecretA, 'render', null)
    console.log('A final:', JSON.stringify(renderA2).slice(0, 500))

    const renderB2 = await callZome(appWsB, cellIdB, sigKeysB, capSecretB, 'render', null)
    console.log('B final:', JSON.stringify(renderB2).slice(0, 500))

    console.log('\n=== Test complete ===')

    appWsA.close()
    appWsB.close()
    adminWs.close()
  } finally {
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
