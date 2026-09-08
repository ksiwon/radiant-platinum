// 짧은 재현 — **첫 배지를 막은 것이 정말 간호사인가** (후속 지시 §6)
//
//     node tools/e2e/_heal42.mjs [--headed] [--budget=600]
//
// ⚠️ **막힌 자리는 관장이 아니었다.** 대표 구간(2026-09-08 두 번째 판)은 탄광에서
// 관장 로안을 **만났고**, 그 다음 줄에서 「간호사에게 못 걸었다」로 멈췄다 —
// `journey.mjs`의 회복 계약이 안 서서 도전을 안 간 것이다. 그래서 여기서는
// **말 걸기 하나만** 짧게 재현한다: 맵 48의 간호사(스크립트 1)와 맵 47의
// 트레이너 둘(3243 · 3244).
//
// ⚠️ **계약을 무르게 하지 않는다.** 반쯤 깎인 파티로 관장에게 보내는 것은
// 「이겼다」를 못 만든다(`drive.mjs`의 `fullyHealed`). 여기서 고칠 수 있는 것은
// **말을 어떻게 거는가**뿐이고, 회복의 판정도 배지도 안 건드린다.
//
// ⚠️ **읽기만 한다.** 배치표와 지금 서 있는 칸을 읽고, 진행은 방향키와 A로만
// 만든다. 뒷문은 자리로 뛰어드는 것 하나뿐이다(확인 지점 `oreburgh`).
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '900') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/heal42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 무쇠시티 포켓몬센터 1F · 간호사는 그 맵 스크립트의 첫 항목이다 */
const CENTER = 48
/** 무쇠 체육관 · 부하 둘의 배치표 스크립트 번호 */
const GYM = 47
const GRUNTS = [3243, 3244]

const out = { stamp: STAMP, steps: [] }
const note = (what, verdict, detail) => {
  out.steps.push({ what, verdict, detail })
  console.log(`  ${verdict === 'PASS' ? '✓' : verdict === 'FAIL' ? '✗' : '·'} ${what} — ${detail}`)
}

/** 그 맵에 실제로 서 있는 사람들을 **읽는다** */
const roster = (page) => page.evaluate(async () => {
  const m = await import('/src/engine/actor/npcs.ts')
  const reg = m.npcActors
  return {
    mapId: reg.mapId,
    list: reg.list.map((a) => ({
      script: a.info?.script ?? null,
      localID: a.info?.localID ?? null,
      sprite: a.info?.sprite ?? null,
      at: { x: Math.round(a.x), z: Math.round(a.z) },
      spawn: a.info === undefined ? null : { x: a.info.x, z: a.info.z },
      visible: a.visible !== false,
    })),
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-heal42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForFunction(() => document.documentElement.dataset.scene === 'overworld',
    null, { timeout: 180_000 })

  // 무쇠시티 앞마당으로 뛰어든다 — 파티는 확인 지점이 주는 그대로다
  const bad = await page.evaluate(async () => {
    const cps = await import('/src/engine/dev/checkpoints.ts')
    const dw = await import('/src/app/devWarp.ts')
    const one = cps.CHECKPOINTS.find((c) => c.id === 'gym1')
    if (!one) return '확인 지점 gym1이 없다'
    const { battle, ...rest } = one
    await dw.warpTo(rest)
    return null
  })
  if (bad !== null) throw new Error(bad)
  await page.waitForFunction(() => document.documentElement.dataset.map === '47'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  note('무쇠 체육관에 선다', 'PASS', JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset }))))

  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      const found = {}

      // ① 체육관 부하 둘 — 여기 서 있는 채로 바로 잰다
      found.gym = { roster: await roster(page), tries: [] }
      for (const script of GRUNTS) {
        const spot = await api.npcSpot(GYM, script)
        const said = spot === null ? false
          : await api.talkTo(GYM, spot, Math.min(90_000, api.left()))
        await api.settle()
        found.gym.tries.push({ script, spot, said, after: await api.snapshot() })
        note(`체육관 트레이너 ${String(script)}`, said ? 'PASS' : 'FAIL',
          `배치표 자리 ${JSON.stringify(spot)} · ${said ? '반응했다' : '못 걸었다'}`)
        await api.clearTalk()
      }

      // ② 센터로 걸어 들어가 간호사를 찾는다
      const came = await api.goTo(CENTER, Math.min(240_000, api.left()))
      note('센터로 걸어간다', came === 'arrived' ? 'PASS' : 'FAIL', String(came))
      if (came === 'arrived') {
        await api.settle()
        found.center = { roster: await roster(page), at: await api.snapshot() }
        const spot = await api.npcSpot(CENTER, 1)
        note('간호사를 배치표에서 찾는다', spot === null ? 'FAIL' : 'PASS',
          spot === null
            ? `스크립트 1인 사람이 없다 — 지금 선 사람들 ${JSON.stringify(found.center.roster.list.map((n) => n.script))}`
            : JSON.stringify(spot))
        if (spot !== null) {
          const said = await api.talkTo(CENTER, spot, Math.min(120_000, api.left()))
          note('간호사에게 말을 건다', said ? 'PASS' : 'FAIL', said ? '열렸다' : '못 걸었다')
          found.center.said = said
          await api.clearTalk()
        }
        const got = await api.healAt(CENTER, Math.min(300_000, api.left()))
        note('회복 계약', got.ok ? 'PASS' : 'FAIL',
          `${String(got.why ?? '나았다')} · 파티 ${JSON.stringify(got.party?.map((p) => `${String(p.hp)}/${String(p.max)}`))}`)
        found.heal = got
      }
      await page.screenshot({ path: `${OUT}/끝난자리.png` })
      return found
    },
  })
  out.result = result
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
const bad = out.steps.filter((s) => s.verdict === 'FAIL').length
console.log(`  실패 ${String(bad)}건`)
process.exit(out.crash === undefined && bad === 0 ? 0 : 1)
