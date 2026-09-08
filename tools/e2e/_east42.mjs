// 짧은 재현 — **포켓치 없이 203번도로로 나가지는가** (검토 지시 5)
//
//     node tools/e2e/_east42.mjs [--headed] [--save=.audit/journey/seg-08.rpsave]
//
// ⚠️ **앞서 세운 「동쪽 잠금」 가설은 틀린 자리를 짚었다.** 포켓치를 받아야
// 동쪽이 열린다고 적었는데, 원본을 읽어 보면 **포켓치 게이트가 아니다** —
// 막는 것은 좌표 이벤트에 걸린 **핸섬**이다.
//
// 원본이 적어 둔 것 (`res/field/events/events_jubilife_city.json` ·
// `res/field/scripts/scripts_jubilife_city.s`):
//
//   · 좌표 이벤트 (188, 757~760) · `VAR_JUBILIFE_CITY_STATE == 1`
//       → `JubilifeCity_CoordEvent_LookerBlockRoute203` (ScriptEntry 3번)
//   · 그 스크립트가 하는 일 — 플레이어의 z를 읽어 핸섬을 그 줄로 **걸어오게**
//     하고(`ApplyMovement LOCALID_LOOKER`), 말을 건 뒤
//     `JubilifeCity_Movement_PlayerWalkWestWithLooker`로 **서쪽으로 밀어낸다.**
//
// 즉 원본도 **벽으로 막지 않는다** — 스크립트가 밀어낸다. 그러니 「지나갔다」는
// 사실만으로는 결함인지 아닌지를 못 가른다. 갈리는 자리는 셋이다:
//
//   ① `VAR_JUBILIFE_CITY_STATE`가 그때 정말 1이었는가
//   ② 그 칸(188, 757~760)을 **실제로 밟았는가** — 다른 줄로 돌아 나가면
//      원본에서도 안 걸린다
//   ③ 밟았는데 스크립트가 **안 걸렸는가**, 걸렸는데 **밀어내기가 안 먹었는가**
//
// 여기서는 셋을 나눠서 잰다. `x=188`의 네 줄을 하나씩 밟아 보고, 밟기 직전과
// 직후의 이야기 변수·도는 스크립트·플레이어 자리를 적는다.
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 쓰지 않고, 사람을 옮기지도 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-08.rpsave'
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '600') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/east42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 떡잎시티 */
const JUBILIFE = 3
/** 원본의 좌표 이벤트가 앉은 칸 — x 하나에 z 넷 */
const GATE_X = 188
const GATE_Z = [757, 758, 759, 760]

const out = { stamp: STAMP, save: SAVE, steps: [], rows: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/**
 * 지금의 이야기 상태 — **읽기만 한다**.
 *
 * `triggerAt`은 제품이 좌표 트리거를 푸는 그 함수다. 우리가 표를 다시 읽어
 * 세지 않고 **제품에게 물어본다** — 「그 칸에 서면 몇 번이 걸리는가」
 */
const storyNow = (page) => page.evaluate(async ([map, gx, gz]) => {
  const f = await import('/src/engine/script/field.ts')
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const v = f.fieldScripts.vars
  const p = st.worldState.player
  const ctx = f.fieldScripts.ctx
  return {
    map: w.world.mapId,
    player: { x: p.position.x, z: p.position.z, tile: { x: Math.floor(p.position.x), z: Math.floor(p.position.z) } },
    /** `VAR_JUBILIFE_CITY_STATE` — 1이면 핸섬이 막을 때다 */
    cityState: v.get(16503),
    /** 둘째 좌표 이벤트가 보는 변수 */
    var16502: v.get(16502),
    coupons: [237, 238, 239].map((n) => v.checkFlag(n)),
    poketch: v.checkFlag(243),
    /** **제품이** 그 칸에서 푸는 트리거 번호. null이면 아무것도 안 걸린다 */
    triggers: gz.map((z) => ({ z, script: f.triggerAt(map, gx, z, v) })),
    /** 원본 표가 그 칸에 적어 둔 것 — 제품의 답과 견준다 */
    placed: w.triggersOf(map)
      .filter((t) => t.x <= gx && gx < t.x + t.width && t.z <= gz[3] && gz[0] < t.z + t.length)
      .map((t) => ({ script: t.script, x: t.x, z: t.z, w: t.width, l: t.length, var: t.var, value: t.value })),
    running: ctx === null ? null : { file: ctx.file, pc: ctx.pointer },
    marks: { ...document.documentElement.dataset },
  }
}, [JUBILIFE, GATE_X, GATE_Z])

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-east42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  out.atLoad = await storyNow(page)
  note('들인 자리', JSON.stringify({
    map: out.atLoad.map, cityState: out.atLoad.cityState, poketch: out.atLoad.poketch,
    coupons: out.atLoad.coupons,
  }))
  note('원본 표가 그 칸에 적어 둔 것', JSON.stringify(out.atLoad.placed))
  note('제품이 그 칸에서 푸는 번호', JSON.stringify(out.atLoad.triggers))

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(JUBILIFE, Math.min(180_000, api.left()))
      note('떡잎시티로', String(came))
      if (came !== 'arrived') return { came }

      // 네 줄을 하나씩 **직접 밟는다**. 어느 줄이 걸리고 어느 줄이 안 걸리는지가
      // 「우회로로 빠져나갔다」와 「걸려야 하는데 안 걸렸다」를 가른다
      for (const z of GATE_Z) {
        if (api.left() < 60_000) { note('예산', '남은 줄은 못 밟았다'); break }
        const before = await storyNow(page)
        const stood = await api.stepOn(JUBILIFE, { x: GATE_X, z }, Math.min(120_000, api.left()))
        await api.settle()
        const after = await storyNow(page)
        const row = {
          z, stood,
          cityState: [before.cityState, after.cityState],
          on: after.player.tile,
          running: after.running,
          fired: after.running !== null || after.marks.talk === '1',
          map: after.map,
        }
        out.rows.push(row)
        note(`(${String(GATE_X)},${String(z)})을 밟는다`,
          `${stood} → 선 칸 ${JSON.stringify(after.player.tile)} · 맵 ${String(after.map)}`
          + ` · 도시단계 ${String(after.cityState)}`
          + ` · 도는 스크립트 ${JSON.stringify(after.running)}`
          + ` · ${row.fired ? '**뭔가 걸렸다**' : '아무것도 안 걸렸다'}`)
        if (row.fired) await api.clearTalk()
      }

      // 마지막으로 **동쪽으로 실제로 나가지는가**
      const gone = await api.goTo(344, Math.min(180_000, api.left()))
      const end = await storyNow(page)
      out.east = { gone, map: end.map, cityState: end.cityState, poketch: end.poketch }
      note('203번도로(344)로 나간다', `${gone} · 맵 ${String(end.map)}`
        + ` · 도시단계 ${String(end.cityState)} · 포켓치 ${String(end.poketch)}`)
      await page.screenshot({ path: `${OUT}/동쪽.png` })
      return { came, gone }
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 800)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
