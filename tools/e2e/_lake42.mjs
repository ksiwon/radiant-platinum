// 짧은 재현 — **예진호수 장면과 201번도로 동쪽 통행** (후속 지시 §2)
//
//     node tools/e2e/_lake42.mjs [--headed]
//
// ⚠️ **대표 구간을 통째로 다시 돌리지 않는다.** 같은 실패로 77분을 되풀이하는
// 대신 새 게임에서 호수까지만 몰고(길목 일곱), 거기서 **막힌 순간의 값**을
// 읽는다 — 맵·칸·도는 스크립트의 파일과 읽기 위치·대사 상태, 그리고
// `VAR_FOLLOWER_RIVAL_STATE`(16518) · `VAR_VERITY_LAKEFRONT_STATE`(16514) ·
// `VAR_VISITED_LAKE_VERITY_WITH_RIVAL`(16533).
//
// ⚠️ **읽기만 한다.** 변수도 플래그도 여기서 쓰지 않는다. 진행은 방향키와
// A로만 만들고, 값이 3에서 4로 가는 것은 **원본 장면이** 해야 한다
// (`scripts_lake_verity_low_water.s`의 `EndRivalFollower`).
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const HEADED = process.argv.includes('--headed')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/lake42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 길목 일곱 — 집 1층 · 떡잎 · 라이벌 집 2층 · 떡잎 · 201번도로 · 가방 · 호수 */
const UP_TO = 7
const out = { stamp: STAMP, lines: [], noise: [] }
const log = (line) => { out.lines.push(line); console.log(`  ${line}`) }

let vite = null
let browser = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-lake42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  const noise = []
  page.on('pageerror', (e) => { noise.push(`pageerror ${String(e.message).slice(0, 200)}`) })
  page.on('console', (m) => {
    if (m.type() === 'error') noise.push(`console ${m.text().slice(0, 200)}`)
  })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await playOpening(page)
  await page.waitForFunction(() => document.documentElement.dataset.scene === 'overworld',
    null, { timeout: 180_000 })
  log('오프닝을 지났다')

  out.story = await driveStory(page, {
    log, verbose: true, totalMs: 1_500_000, upTo: UP_TO,
    /**
     * 길목이 끝난 자리에서 **그대로 한 번 더 잰다.** 호수가 끝났으면 동쪽이
     * 열려 있어야 하고, 안 끝났으면 (115,852~855)에서 되돌려 세워진다
     */
    after: async ({ snapshot, lakeVars, stepOn, settle, now }) => {
      const at = await snapshot()
      const vars = await lakeVars()
      log(`막힌 자리 — ${JSON.stringify(at)}`)
      log(`이야기 변수 — ${JSON.stringify(vars)}`)
      await page.screenshot({ path: `${OUT}/막힌자리.png` })
      // 동쪽 문턱에 서 본다. 되돌려 세워지면 칸이 안 남는다
      const east = await stepOn(342, { x: 115, z: 853 }, 150_000)
      await settle()
      const there = await now()
      const after = await lakeVars()
      log(`동쪽 문턱 — 밟기 ${east} · 맵 ${String(there.map)} 칸 ${String(there.x)},${String(there.z)}`
        + ` · 라이벌 ${String(after.rival)}`)
      await page.screenshot({ path: `${OUT}/동쪽문턱.png` })
      return { at, vars, east: { verdict: east, map: there.map, x: there.x, z: there.z, vars: after } }
    },
  })
  out.noise = noise.slice(0, 30)
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 500)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
// ⚠️ **여기서 PASS를 만들지 않는다.** 이 도구는 값을 읽어 남기는 자리고,
// 판정은 대표 구간(`journey`)이 제 봉투에 적는다
process.exit(out.crash === undefined && out.story?.scenes?.[0]?.ok === true ? 0 : 1)
