// 진단 탐침 — **난천 좌표 이벤트가 왜 판마다 다른가**
//
//     node tools/e2e/_cyn43.mjs [--headed] [--save=.audit/journey/end.rpsave] [--url=…]
//
// `_cyn42` 세 판(2026-09-22, 문 고침 뒤) 가운데 **둘은 돌고 하나는 안 돌았다.**
// 안 돈 판은 z=522를 서쪽으로 걸어 (306,522)·(305,522)를 밟고도 상태가 1 그대로였다.
// 롬 표(`events_eterna_city.json`)의 난천 좌표 이벤트는 둘이다:
//
//   #3  script 1 · x 304 폭 3 · z 522 길이 1   → (304,522) (305,522) (306,522)
//   #6  script 1 · x 304 폭 1 · z 523 길이 3   → (304,523) (304,524) (304,525)
//
// 둘 다 `VAR_ETERNA_CITY_STATE == 1`일 때만 선다.
//
// 여기서 가르는 것은 **둘**이다:
//   ① 표와 변수가 「돌아야 한다」고 말하는가  — 제품의 `triggerAt`을 그 칸으로 직접 묻는다
//   ② 걸어서 밟으면 도는가                   — 여섯 칸에 **방향을 바꿔 가며** 들어서 본다
//
// ①이 참인데 ②가 거짓이면 밟기 판정(`StepTrace`·`tryTrigger`)이고,
// ①이 거짓이면 표나 변수를 우리가 잘못 읽고 있는 것이다.
//
// ⚠️ **판정이 아니라 진단이다.** 읽기만 한다 — 변수도 깃발도 안 쓴다
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
const OUT = resolve(ROOT, `shots/cyn43/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 난천 좌표 이벤트가 덮는 칸 여섯 (롬 표 그대로) */
const CYNTHIA_TILES = [
  { x: 304, z: 522 }, { x: 305, z: 522 }, { x: 306, z: 522 },
  { x: 304, z: 523 }, { x: 304, z: 524 }, { x: 304, z: 525 },
]
/** 그 칸에 **동쪽에서** 들어서려면 서려는 칸의 동쪽 이웃부터 */
const APPROACH = [
  { from: { x: 308, z: 522 }, to: { x: 306, z: 522 }, how: '동쪽에서 서쪽으로' },
  { from: { x: 302, z: 522 }, to: { x: 304, z: 522 }, how: '서쪽에서 동쪽으로' },
  { from: { x: 305, z: 520 }, to: { x: 305, z: 522 }, how: '북쪽에서 남쪽으로' },
  { from: { x: 305, z: 524 }, to: { x: 305, z: 522 }, how: '남쪽에서 북쪽으로' },
]

const out = { stamp: STAMP, save: SAVE, asked: [], walks: [], notes: [] }
const note = (what, detail) => { out.notes.push({ what, detail }); console.log(`  · ${what} — ${detail}`) }

/**
 * **제품에게 직접 묻는다** — 그 칸에 서면 어느 스크립트가 걸리는가.
 *
 * ⚠️ 제품이 export 하는 것만 부른다 (`probe-must-be-verified-too`). `triggerAt`과
 * `triggersOf`는 둘 다 export고, 변수는 `fieldScripts.vars` 그 store다
 */
const askTiles = (p, tiles) => p.evaluate(async (list) => {
  const f = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  const v = f.fieldScripts.vars
  return {
    map: w.world.mapId,
    eterna: v.get(16506),
    table: w.triggersOf(w.world.mapId).map((t) => ({
      script: t.script, x: t.x, z: t.z, width: t.width, length: t.length,
      var: t.var, value: t.value, now: v.get(t.var),
    })),
    tiles: list.map((t) => ({ ...t, script: f.triggerAt(w.world.mapId, t.x, t.z, v) })),
  }
}, tiles)

/** 지금 자리와 밟기 자취 (`StepTrace`가 어디까지 왔는지는 못 읽는다 — 자리만) */
const whereNow = (p) => p.evaluate(async () => {
  const st = await import('/src/state/worldState.ts')
  const w = await import('/src/engine/map/world.ts')
  const f = await import('/src/engine/script/field.ts')
  const pos = st.worldState.player.position
  return {
    map: w.world.mapId, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2),
    facing: +st.worldState.player.facing.toFixed(2),
    eterna: f.fieldScripts.vars.get(16506),
    script: f.fieldScripts.ctx === null ? null : f.fieldScripts.ctx.file,
  }
})

let vite = null
let browser = null
let page = null
try {
  let url = URL
  if (url === null) {
    const port = await freePort()
    vite = await startVite(port, 'node_modules/.vite-cyn43')
    url = vite.url
  }
  browser = await chromium.launch({ args: gpuArgs('gl'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { out.notes.push({ what: 'pageerror', detail: String(e.message).slice(0, 200) }) })
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

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: false,
    totalMs: 1_200_000,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(65, 600_000)
      note('영원시티로', came)

      // 태홍 장면을 먼저 돌려 상태를 1로 만든다 — 난천은 그래야 선다
      let v = await api.storyVars()
      if ((v?.eterna ?? 0) < 1) {
        const stood = await api.stepOn(65, { x: 303, z: 524 }, 300_000)
        await api.clearTalk(); await api.settle()
        v = await api.storyVars()
        note('태홍 장면 (303,524)', `${stood} · 상태 ${String(v?.eterna)}`)
      }
      if ((v?.eterna ?? 0) !== 1) {
        note('상태가 1이 아니다 — 여기서 그만', `상태 ${String(v?.eterna)}`)
        return
      }

      // ① 표와 변수가 뭐라고 하는가
      const asked = await askTiles(page, CYNTHIA_TILES)
      out.asked.push(asked)
      note('① 제품에게 물었다', `상태 ${String(asked.eterna)} · `
        + asked.tiles.map((t) => `(${String(t.x)},${String(t.z)})→${String(t.script)}`).join(' '))
      out.table = asked.table

      // ② 방향을 바꿔 가며 걸어 들어간다. 한 번이라도 돌면 거기서 끝이다
      for (const step of APPROACH) {
        const before = await api.storyVars()
        if ((before?.eterna ?? 0) !== 1) { note('이미 돌았다 — 나머지 접근은 미실행', `상태 ${String(before?.eterna)}`); break }
        const parked = await api.stepOn(65, step.from, 300_000)
        await api.settle()
        const atFrom = await whereNow(page)
        const walked = await api.stepOn(65, step.to, 300_000)
        await api.clearTalk(); await api.settle()
        const after = await api.storyVars()
        const atTo = await whereNow(page)
        const bag = await api.bagState()
        const hm01 = (bag?.items ?? []).some((one) => one.item === 420 && one.count > 0)
        const row = {
          how: step.how, from: step.from, to: step.to,
          parked, walked, atFrom, atTo,
          eternaBefore: before?.eterna ?? null, eternaAfter: after?.eterna ?? null,
          fired: (after?.eterna ?? 0) >= 2, hm01,
        }
        out.walks.push(row)
        note(`② ${step.how} (${String(step.to.x)},${String(step.to.z)})`,
          `선 자리 ${parked} → 밟기 ${walked} · 상태 ${String(before?.eterna)}→${String(after?.eterna)}`
          + ` · ${row.fired ? '**돌았다**' : '안 돌았다'} · 끝 자리 ${String(atTo.x)},${String(atTo.z)}`)
      }
      await page.screenshot({ path: `${OUT}/끝.png` })
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  page = null
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
