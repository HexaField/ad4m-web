/**
 * Integration test: Verify ad4m-web p-diff-sync interop with reference AD4M executor.
 *
 * Prerequisites:
 * - Holochain conductor running on ws://localhost:4322 with bootstrap.ad4m.dev:4433
 * - Reference AD4M executor at http://192.168.1.2:12000/graphql
 * - p-diff-sync hApp file available
 *
 * Run: npx tsx packages/core/src/language/__tests__/interop-verify.ts
 */

import { readFileSync } from 'node:fs'
import { AdminWebsocket, AppWebsocket } from '@holochain/client'

const CONDUCTOR_URL = new URL('ws://localhost:4322')
const NETWORK_SEED = 'interop-test-1773997172'
const HAPP_PATH = process.env.HAPP_PATH || `${import.meta.dirname}/reference-pdiffsync.happ`
const REFERENCE_GRAPHQL = 'http://192.168.1.2:12000/graphql'
const REFERENCE_PERSPECTIVE = 'cc56503c-3d78-42c5-bff4-3dd9db334cba'
const REFERENCE_DID = 'did:key:z6MkoSpk2fgnWgaMj7A1bcNz7aHXnpFFNt2SUbse12PHSFWx'

const ZOME_NAME = 'perspective_diff_sync'

async function referenceQuery(query: string): Promise<any> {
  const res = await fetch(REFERENCE_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'test-admin-token' },
    body: JSON.stringify({ query })
  })
  return res.json()
}

async function main() {
  console.log('=== ad4m-web p-diff-sync interop verification ===\n')

  // Read hApp
  console.log(`Reading hApp from ${HAPP_PATH}...`)
  const happBytes = readFileSync(HAPP_PATH)
  console.log(`  hApp size: ${happBytes.length} bytes`)

  // Connect admin
  console.log(`\nConnecting to conductor at ${CONDUCTOR_URL}...`)
  const adminWs = await AdminWebsocket.connect({ url: CONDUCTOR_URL, wsClientOptions: { origin: 'http://localhost' } })
  console.log('  Connected to admin interface')

  // Install app with network seed
  const appId = `pdiff-interop-test-${Date.now()}`
  console.log(`\nInstalling app "${appId}" with network seed "${NETWORK_SEED}"...`)

  const agentKey = await adminWs.generateAgentPubKey()
  console.log(`  Agent key generated`)

  const appInfo = await adminWs.installApp({
    source: { type: 'path', value: HAPP_PATH },
    agent_key: agentKey,
    installed_app_id: appId
  })
  console.log(`  App installed: ${appInfo.installed_app_id}`)

  // Enable
  await adminWs.enableApp({ installed_app_id: appId })
  console.log('  App enabled')

  // Attach app interface
  const { port: appPort } = await adminWs.attachAppInterface({ port: 0, allowed_origins: '*', installed_app_id: appId })
  console.log(`  App interface on port ${appPort}`)

  // Issue token and connect app
  const { token } = await adminWs.issueAppAuthenticationToken({ installed_app_id: appId })
  const appWs = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${appPort}`),
    token,
    wsClientOptions: { origin: 'http://localhost' }
  })
  console.log('  App websocket connected')

  // Get cell_id
  const appInfoFull = await appWs.appInfo()
  if (!appInfoFull) throw new Error('No app info')

  const cells = appInfoFull.cell_info['perspective-diff-sync']
  const cell = cells[0] as any
  let cellId: any
  if (cell.type === 'provisioned') {
    cellId = cell.value.cell_id
  } else if ('provisioned' in cell) {
    cellId = (cell as any).provisioned.cell_id
  } else {
    throw new Error(`Unexpected cell format: ${JSON.stringify(cell).slice(0, 200)}`)
  }
  console.log(`  Cell ID found`)

  // Authorize signing credentials for the cell
  await adminWs.authorizeSigningCredentials(cellId)
  console.log('  Signing credentials authorized')

  // Helper for zome calls
  async function callZome(fnName: string, payload: any): Promise<any> {
    return appWs.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: fnName,
      payload
    })
  }

  // Step 1: create_did_pub_key_link + add_active_agent_link
  const myDid = 'did:key:z6MkAdamWebTestAgent1234567890abcdef'
  console.log(`\n--- Step 1: create_did_pub_key_link for ${myDid} ---`)
  try {
    const res = await callZome('create_did_pub_key_link', myDid)
    console.log('  ✅ DID link created:', res ? 'success' : 'null response (ok)')
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 2: sync (and repeat to broadcast our revision to peers)
  console.log('\n--- Step 2: sync ---')
  try {
    const syncRes = await callZome('sync', myDid)
    console.log(
      '  ✅ Sync result:',
      syncRes instanceof Uint8Array ? `ActionHash (${syncRes.length} bytes)` : typeof syncRes
    )
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 3: get_others
  console.log('\n--- Step 3: get_others ---')
  try {
    const others = await callZome('get_others', null)
    console.log('  Others:', JSON.stringify(others))
    if (Array.isArray(others) && others.includes(REFERENCE_DID)) {
      console.log(`  ✅ Reference agent ${REFERENCE_DID} found!`)
    } else {
      console.log(`  ⚠️  Reference agent not yet visible (may need DHT propagation time)`)
    }
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Wait for DHT gossip (active_agent links need time to propagate)
  console.log('\nWaiting 60s for DHT propagation (syncing every 5s)...')
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      await callZome('sync', myDid)
    } catch {
      /* ignore */
    }
    // Check get_others periodically
    try {
      const others = (await callZome('get_others', null)) as string[]
      const refFound = others.some((d: string) => d !== myDid)
      console.log(`  Sync ${i + 1}/12... get_others: ${others.length} DIDs${refFound ? ' (REFERENCE FOUND!)' : ''}`)
      if (refFound) break
    } catch {
      console.log(`  Sync ${i + 1}/12`)
    }
  }

  // Step 4: render
  console.log('\n--- Step 4: render ---')
  try {
    const rendered = await callZome('render', null)
    console.log('  Render result:', JSON.stringify(rendered).slice(0, 500))
    if (rendered && rendered.links && rendered.links.length > 0) {
      console.log(`  ✅ Got ${rendered.links.length} links from render!`)
    } else {
      console.log('  ⚠️  No links yet (may need more gossip time)')
    }
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 5: get_others again
  console.log('\n--- Step 5: get_others (after wait) ---')
  try {
    const others2 = await callZome('get_others', null)
    console.log('  Others:', JSON.stringify(others2))
    if (Array.isArray(others2) && others2.some((d: string) => d === REFERENCE_DID)) {
      console.log(`  ✅ Reference agent visible!`)
    }
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 6: Commit a test link
  console.log('\n--- Step 6: commit test link ---')
  try {
    const testLink = {
      diff: {
        additions: [
          {
            author: myDid,
            timestamp: new Date().toISOString(),
            data: {
              source: 'ad4m://self',
              predicate: 'test://from-ad4m-web',
              target: 'literal://string:hello-from-ad4m-web'
            },
            proof: { key: 'test', signature: 'test' }
          }
        ],
        removals: []
      },
      my_did: myDid
    }
    const commitRes = await callZome('commit', testLink)
    console.log(
      '  ✅ Commit result:',
      commitRes instanceof Uint8Array
        ? `ActionHash (${commitRes.length} bytes)`
        : JSON.stringify(commitRes).slice(0, 200)
    )
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 6b: render after commit
  console.log('\n--- Step 6b: render (after our commit) ---')
  try {
    const rendered = await callZome('render', null)
    console.log('  Render result:', JSON.stringify(rendered).slice(0, 500))
    if (rendered && rendered.links && rendered.links.length > 0) {
      console.log(`  ✅ Got ${rendered.links.length} links from render!`)
      for (const link of rendered.links) {
        console.log(
          `    ${link.data?.source || link.source} → ${link.data?.predicate || link.predicate} → ${link.data?.target || link.target}`
        )
      }
    } else {
      console.log('  ⚠️  No links yet')
    }
  } catch (e: any) {
    console.log('  ❌ Error:', e.message?.slice(0, 200))
  }

  // Step 7: Periodic sync to broadcast, then check reference
  console.log('\n--- Step 7: Periodic sync + check reference for our link ---')
  for (let i = 0; i < 20; i++) {
    try {
      await callZome('sync', myDid)
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 5000))
    console.log(`  Sync iteration ${i + 1}/20...`)

    try {
      const refResult = await referenceQuery(
        `{ perspectiveQueryLinks(uuid: "${REFERENCE_PERSPECTIVE}", query: {}) { data { source predicate target } author } }`
      )
      const links = refResult.data?.perspectiveQueryLinks || []
      const ourLink = links.find((l: any) => l.data.predicate === 'test://from-ad4m-web')
      if (ourLink) {
        console.log(`  ✅ Reference sees our link! ${links.length} total links`)
        for (const link of links) {
          console.log(
            `    ${link.data.source} → ${link.data.predicate} → ${link.data.target} (by ${link.author.slice(0, 30)}...)`
          )
        }
        break
      } else {
        console.log(`  ⏳ Reference has ${links.length} links, ours not yet visible`)
      }
    } catch (e: any) {
      console.log('  Error querying reference:', e.message)
    }
  }

  console.log('\n=== Verification complete ===')

  // Cleanup
  await adminWs.client.close()
  await appWs.client.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
