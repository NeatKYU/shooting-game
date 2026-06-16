#!/usr/bin/env node
// PixelLab character + animation generator — 3-lane back-view samurai.
//
// The player is seen from BEHIND and angles toward the boss at top-center:
//   left lane   -> faces north-east   (key: ne)
//   center lane -> faces north         (key: n)
//   right lane  -> faces north-west    (key: nw)
//
// Flow:
//   1. GET  /balance
//   2. POST /create-character-with-8-directions   -> one consistent SWORDLESS character (8 dirs)
//   3. GET  /characters/{id}                       -> rotation_urls per direction
//   4. download north-east / north / north-west    -> base sprite per lane
//   5. POST /animate-with-text-v3 (x6)             -> roll + attack per lane (submitted concurrently)
//   6. GET  /background-jobs/{id}                   -> poll each, save frames
//
// Output -> public/pixellab/<dir>/{base.png, roll/*.png, attack/*.png}
//
// Usage:
//   node scripts/pixellab-gen.mjs                 # full run
//   node scripts/pixellab-gen.mjs --dry-run       # plan only
//   node scripts/pixellab-gen.mjs --only=n        # one lane only (ne|n|nw)
//   node scripts/pixellab-gen.mjs --regen-base    # rebuild the base character

import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public', 'pixellab')
const API = 'https://api.pixellab.ai/v2'

// ---- args -------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const DRY = !!args['dry-run']
const SIZE = Number(args.size || 64)
const VIEW = args.view || 'low top-down'
const REGEN_BASE = !!args['regen-base']
const ONLY = args.only ? String(args.only).split(',') : null

// ---- the character ----------------------------------------------------
// MapleStory-ish chibi + the Detective Conan "culprit" silhouette.
// IMPORTANT: no weapon in the base — the katana only shows up in the attack animation.
const CHARACTER =
  'chibi pixel art character with a big round head and small short body (maplestory proportions), ' +
  'a mysterious culprit silhouette wearing a dark navy trench coat and a fedora hat, ' +
  'face completely hidden in black shadow, empty hands, no weapon, ' +
  'clean readable pixel art, full body, centered'

const SEED = Number(args.seed || 7777)

const DIRECTIONS = [
  { key: 'ne', name: 'north-east', lane: 'left' },
  { key: 'n', name: 'north', lane: 'center' },
  { key: 'nw', name: 'north-west', lane: 'right' },
]

// frame_count must be even (4-16)
const ACTIONS = [
  { key: 'roll', action: 'forward dodge roll, tucking into a ball and rolling along the ground', frames: 8 },
  {
    key: 'attack',
    action: 'quickly drawing a katana sword and swinging it forward in a fast slash; the katana blade appears in the hand mid-swing',
    frames: 8,
  },
]

// ---- helpers ----------------------------------------------------------
function getSecret() {
  if (process.env.PIXELLAB_SECRET) return process.env.PIXELLAB_SECRET
  for (const f of ['.env', '.env.local']) {
    const p = join(ROOT, f)
    if (existsSync(p)) {
      const m = readFileSync(p, 'utf8').match(/^\s*PIXELLAB_SECRET\s*=\s*(.+)\s*$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  }
  return null
}
const SECRET = getSecret()

async function api(path, { method = 'GET', body } = {}, _try = 0) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  // Tier 0 allows only 8 concurrent jobs — back off and retry on 429.
  if (res.status === 429 && _try < 20) {
    await sleep(8000)
    return api(path, { method, body }, _try + 1)
  }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${JSON.stringify(json, null, 2).slice(0, 800)}`)
  return json
}

function stripPrefix(b64) {
  return b64.replace(/^data:image\/\w+;base64,/, '')
}
function savePng(path, b64) {
  writeFileSync(path, Buffer.from(stripPrefix(b64), 'base64'))
}
async function downloadB64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url} -> ${res.status}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DONE = new Set(['completed', 'success', 'succeeded', 'done', 'finished'])
const FAIL = new Set(['failed', 'error', 'cancelled', 'canceled'])

async function pollJob(jobId, label, timeoutMs = 480_000) {
  const started = Date.now()
  let lastBeat = 0
  while (Date.now() - started < timeoutMs) {
    const job = await api(`/background-jobs/${jobId}`)
    const elapsed = Math.round((Date.now() - started) / 1000)
    if (DONE.has(job.status)) {
      console.log(`   ✅ ${label} done (${elapsed}s)`)
      return job
    }
    if (FAIL.has(job.status)) throw new Error(`${label} failed: ${JSON.stringify(job).slice(0, 600)}`)
    if (elapsed - lastBeat >= 20) {
      lastBeat = elapsed
      console.log(`   · ${label} ${job.status} ${elapsed}s`)
    }
    await sleep(3000)
  }
  throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)
}

function extractFrames(lr) {
  const imgs = Array.isArray(lr?.images) ? lr.images : Array.isArray(lr?.frames) ? lr.frames : null
  if (imgs) return imgs.map((x) => (typeof x === 'string' ? x : x?.base64)).filter(Boolean)
  // fallback: collect any base64-looking strings
  const acc = []
  const walk = (n) => {
    if (n == null) return
    if (typeof n === 'string') {
      if (n.length > 200) acc.push(n)
    } else if (Array.isArray(n)) n.forEach(walk)
    else if (typeof n === 'object') (typeof n.base64 === 'string' ? acc.push(n.base64) : Object.values(n).forEach(walk))
  }
  walk(lr)
  return acc
}

// ---- main -------------------------------------------------------------
async function main() {
  const lanes = DIRECTIONS.filter((d) => !ONLY || ONLY.includes(d.key))
  console.log(`\n🎨 PixelLab generator  (back-view, 3 lanes, size=${SIZE}px, ${DRY ? 'DRY RUN' : 'LIVE'})`)
  console.log(`character (swordless): ${CHARACTER}\n`)
  console.log('lanes:', lanes.map((d) => `${d.key}=${d.name}(${d.lane})`).join(', '))
  console.log('animations:', ACTIONS.map((a) => `${a.key}(${a.frames}f)`).join(', '), '  (sword only in attack)\n')

  if (!SECRET) {
    console.log('⚠️  No API key. Put PIXELLAB_SECRET in shooting-game/.env')
    if (!DRY) process.exit(1)
  }
  if (DRY) {
    console.log(`(dry run) would create 1 swordless 8-dir character + ${lanes.length * ACTIONS.length} animations.`)
    return
  }

  const bal = await api('/balance')
  console.log(`💰 balance: $${bal.credits?.usd ?? '?'} · generations left: ${bal.subscription?.generations ?? '?'}\n`)

  mkdirSync(OUT, { recursive: true })

  // --- 1. base character (8 directions, swordless) ----------------------
  const charCache = join(OUT, 'character.json')
  let rotationUrls
  if (!REGEN_BASE && existsSync(charCache)) {
    rotationUrls = JSON.parse(readFileSync(charCache, 'utf8')).rotation_urls
    console.log('🧍 base character: reusing cached character.json (pass --regen-base to redo)')
  } else {
    console.log('🧍 creating swordless 8-direction character…')
    const created = await api('/create-character-with-8-directions', {
      method: 'POST',
      body: {
        description: CHARACTER,
        image_size: { width: SIZE, height: SIZE },
        mode: 'standard',
        view: VIEW,
        proportions: { type: 'preset', name: 'chibi' },
        seed: SEED,
        text_guidance_scale: 8,
      },
    })
    await pollJob(created.background_job_id, 'character')
    const char = await api(`/characters/${created.character_id}`)
    rotationUrls = char.rotation_urls
    writeFileSync(charCache, JSON.stringify({ character_id: created.character_id, rotation_urls: rotationUrls }, null, 2))
  }

  // --- 2. download the 3 lane base sprites ------------------------------
  const baseB64 = {}
  for (const d of lanes) {
    const url = rotationUrls[d.name]
    if (!url) throw new Error(`no rotation url for ${d.name}`)
    const b64 = await downloadB64(url)
    baseB64[d.key] = b64
    mkdirSync(join(OUT, d.key), { recursive: true })
    savePng(join(OUT, d.key, 'base.png'), b64)
    console.log(`   🧍 ${d.key} (${d.name}) base saved`)
  }

  // --- 3 + 4. submit -> poll -> save, bounded pool (Tier 0 = max 8 concurrent jobs) ---
  const manifest = { character: CHARACTER, size: SIZE, view: VIEW, lanes: {} }
  for (const d of lanes) manifest.lanes[d.key] = { direction: d.name, lane: d.lane, base: `${d.key}/base.png`, animations: {} }

  const tasks = []
  for (const d of lanes) for (const a of ACTIONS) tasks.push({ d, a })

  const POOL = Number(args.pool || 3)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const { d, a } = tasks[next++]
      const label = `${d.key}/${a.key}`
      const start = await api('/animate-with-text-v3', {
        method: 'POST',
        body: {
          first_frame: { type: 'base64', base64: stripPrefix(baseB64[d.key]), format: 'png' },
          action: a.action,
          frame_count: a.frames,
          no_background: true,
        },
      })
      console.log(`🎬 ${label} submitted`)
      const job = await pollJob(start.background_job_id, label)
      const frames = extractFrames(job.last_response)
      if (!frames.length) {
        console.log(`   ⚠️ ${label}: no frames; keys=${JSON.stringify(Object.keys(job.last_response || {}))}`)
        continue
      }
      const outDir = join(OUT, d.key, a.key)
      mkdirSync(outDir, { recursive: true })
      frames.forEach((f, i) => savePng(join(outDir, `frame_${String(i).padStart(2, '0')}.png`), f))
      manifest.lanes[d.key].animations[a.key] = { action: a.action, frames: frames.length, dir: `${d.key}/${a.key}` }
      console.log(`   💾 ${label}: ${frames.length} frames`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, tasks.length) }, worker))

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\n📄 wrote manifest.json')
  console.log('✨ done. Preview: `npm run dev` -> http://localhost:5173/pixellab/preview.html\n')
}

main().catch((e) => {
  console.error('\n❌', e.message)
  process.exit(1)
})
