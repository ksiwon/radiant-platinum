// 진단 탐침 — **영원시티 난천 장면**에서 주인공이 어디로 가는가
//
//     node tools/e2e/_cyn42.mjs [--headed] [--save=.audit/journey/end.rpsave] [--url=…]
//
// `_cut42` 1판(2026-09-22)에서 태홍·라이벌 장면(상태 0→1) 뒤 난천 칸을 밟으러 가다
// 주인공이 **약초가게(81)** 안에 서 있었다 — 상태는 1 그대로, 비전머신01은 없었다.
// 무엇이 주인공을 (316,521) 문으로 데려갔는지 **150ms마다 자리를 적어** 본다.
//
// ⚠️ 판정이 아니라 진단이다. 읽기만 한다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const HEADED = args.includes('--headed')
const SAVE = flag('save', '.audit/journey/end.rpsave')
const URL = flag('url', null)
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/cyn42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, trace: [], notes: [] }
const note = (what, detail) => { out.notes.push({ what, detail }); console.log(`  · ${what} — ${detail}`) }

const snap = (p) => p.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const f = await import('/src/engine/script/field.ts')
  const n = await import('/src/engine/actor/npcs.ts')
  const pos = st.worldState.player.position
  const ctx = f.fieldScripts.ctx
  const v = f.fieldScripts.vars
  const who = (id) => {
    const a = n.npcActors.byLocalID.get(id)
    return a === undefined ? null : { x: Math.round(a.x), z: Math.round(a.z), vis: a.visible }
  }
  const tw = f.triggerWatch
  return {
    t: Date.now(), map: w.world.mapId, x: +pos.x.toFixed(1), z: +pos.z.toFixed(1),
    script: ctx === null ? null : { file: ctx.file, pc: ctx.pointer },
    err: f.fieldScripts.lastError === null ? null : String(f.fieldScripts.lastError).slice(0, 160),
    eterna: v.get(16506), rival: who(33), cyrus: who(32), cynthia: who(12),
    /**
     * **밟기 판정이 무엇을 봤는가** (`field.triggerWatch` · REPAIR §52).
     * 제품이 내놓는 값만 읽는다 — 여기서 만들어 내지 않는다
     */
    watch: {
      calls: tw.calls, stepped: tw.stepped, fired: tw.fired, skipped: { ...tw.skipped },
      recent: tw.recent.slice(-8),
    },
    marks: { ...document.documentElement.dataset },
  }
})

let vite = null
let browser = null
let page = null
try {
  let url = URL
  if (url === null) {
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-cyn42')
    url = vite.url
  }
  browser = await chromium.launch({ args: gpuArgs('gl'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { out.notes.push({ what: 'pageerror', detail: String(e.message).slice(0, 200) }) })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') out.notes.push({ what: `console.${m.type()}`, detail: m.text().slice(0, 200) })
  })
  await page.goto(url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  let tracing = false
  const tracer = (async () => {
    while (page !== null && !page.isClosed()) {
      if (tracing) {
        const s = await snap(page).catch(() => null)
        if (s !== null) {
          const last = out.trace.at(-1)
          if (last === undefined || last.map !== s.map || last.x !== s.x || last.z !== s.z
            || last.eterna !== s.eterna || (last.script === null) !== (s.script === null) || last.err !== s.err
            // **본 칸이 늘었으면 그것도 새 소식이다** — 놓친 판에서 무엇을 봤는지가
            // 여기 있다 (REPAIR §52)
            || last.watch?.stepped !== s.watch?.stepped) {
            out.trace.push(s)
            console.log(`    ${JSON.stringify(s)}`)
          }
        }
      }
      await page.waitForTimeout(150).catch(() => {})
    }
  })()

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: 900_000,
    skipStory: true,
    after: async (api) => {
      tracing = true
      const came = await api.goTo(65, 600_000)
      note('영원시티로', `${came} · ${JSON.stringify(await snap(page))}`)
      let v = await api.storyVars()
      if ((v?.eterna ?? 0) < 1) {
        const stood = await api.stepOn(65, { x: 303, z: 524 }, 300_000)
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        note('라이벌·태홍 장면 (303,524)', `${stood} · 상태 ${String(v?.eterna)} · ${JSON.stringify(await snap(page))}`)
        await page.screenshot({ path: `${OUT}/1-태홍뒤.png` })
      }
      if ((await api.now()).map !== 65) {
        note('맵을 벗어났다', JSON.stringify(await snap(page)))
        const back = await api.goTo(65, 300_000)
        note('영원시티로 되돌아옴', back)
      }
      const stood2 = await api.stepOn(65, { x: 305, z: 522 }, 300_000)
      await api.clearTalk(); await api.settle()
      v = await api.storyVars()
      const bag = await api.bagState()
      note('난천 칸 (305,522)', `${stood2} · 상태 ${String(v?.eterna)} · 비전머신01 ${(bag?.items ?? []).some((o) => o.item === 420) ? '있다' : '없다'} · ${JSON.stringify(await snap(page))}`)
      await page.screenshot({ path: `${OUT}/2-난천뒤.png` })
      tracing = false
    },
  })
  out.end = await snap(page)
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  const p = page
  page = null
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
