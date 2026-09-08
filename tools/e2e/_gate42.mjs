// 짧은 재현 — **막힌 순간의 변수와 활성 이벤트를 실측한다** (후속 지시 §2의 1)
//
//     node tools/e2e/_gate42.mjs [--headed] [--budget=900]
//
// ⚠️ **좌표가 맞는다고 그 이벤트가 돌았다는 뜻이 아니다.** 지시서가 못 박은
// 자리다 — 「115,852 좌표 일치만으로 활성 트리거를 확정하지 않는다」. 그래서
// 여기서는 **호수를 끝내기 전에** 201번도로 동쪽 문턱을 일부러 밟고,
// 밟는 동안 `VAR_FOLLOWER_RIVAL_STATE`(16518)와 **지금 도는 스크립트의
// 파일·읽기 위치**를 200ms마다 적는다.
//
// ⚠️ **표식의 `script=1`은 「무언가 돈다」다.** 원본 스크립트 번호 1이 아니다
// (`app/sceneMark`). 어느 파일의 어느 자리인지는 `fieldScripts.ctx`에만 있다.
//
// ⚠️ **읽기만 한다.** 값을 넣어 문을 열지 않는다. 이 재현이 끝나면 그 판은
// 버린다 — 여기서 만든 상태를 다른 검사의 증거로 쓰지 않는다.
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
const OUT = resolve(ROOT, `shots/gate42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 201번도로 · 동쪽 문턱. `events.json` 328번 표의 `script 14`가 걸린 칸이다 */
const ROUTE = 342
const EAST = { x: 115, z: 853 }

const out = { stamp: STAMP, samples: [], steps: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-gate42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await playOpening(page)

  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    totalMs: BUDGET,
    // 호수 **앞**까지만 간다 — 가방에서 파트너를 고르고 라이벌전까지가 여섯째다
    upTo: 6,
    after: async (api) => {
      const before = await api.lakeVars()
      note('호수 앞 변수', JSON.stringify(before))
      // 라이벌이 아직 안 붙었으면(2) 첫 장면 칸을 밟아 3으로 만든다.
      // ⚠️ **먼저 그 맵으로 가야 한다** — 가방을 고르고 나면 이야기가 주인공을
      // 집(414)으로 데려가므로, 거기서 `stepOn(342, …)`을 부르면 첫 바퀴에
      // 곧바로 `warped`다 (`lakeVerity` 단계 ①과 같은 차례로 간다)
      if (before.rival === 2) {
        await api.goTo(ROUTE, Math.min(150_000, api.left()))
        await api.stepOn(ROUTE, { x: 111, z: 857 }, Math.min(150_000, api.left()))
        await api.settle()
      }
      const armed = await api.lakeVars()
      note('문턱을 밟기 직전', JSON.stringify(armed))
      if (armed.rival !== 3) {
        note('재현이 성립 안 한다', `상태가 3이 아니라 ${String(armed.rival)}다`)
        return { armed, why: '상태 3이 아니다' }
      }

      // 밟는 동안 계속 적는다 — 값과 도는 스크립트를 **한 시계 위에** 얹는다
      let sampling = true
      const tick = (async () => {
        while (sampling) {
          try {
            const [s, v] = await Promise.all([api.snapshot(), api.lakeVars()])
            out.samples.push({ t: Date.now(), ...s, vars: v })
          } catch { /* 페이지가 바쁜 순간은 건너뛴다 */ }
          await page.waitForTimeout(200)
        }
      })()

      const came = await api.goTo(ROUTE, Math.min(180_000, api.left()))
      note('201번도로로 간다', String(came))
      const stood = await api.stepOn(ROUTE, EAST, Math.min(180_000, api.left()))
      await api.settle()
      await page.waitForTimeout(2000)
      sampling = false
      await tick

      const at = await api.snapshot()
      const after = await api.lakeVars()
      note('밟기 결과', `${stood} · 지금 맵 ${String(at.map)} 칸 ${String(at.x)},${String(at.z)}`)
      note('밟은 뒤 변수', JSON.stringify(after))
      // 밟는 동안 실제로 돈 스크립트들
      const ran = [...new Set(out.samples.filter((s) => s.running !== null)
        .map((s) => `${String(s.running.file)}@${String(s.running.pc)}`))]
      note('그 사이에 돈 스크립트', ran.length === 0 ? '없다' : ran.join(' · '))
      await page.screenshot({ path: `${OUT}/문턱.png` })
      return { armed, stood, at, after, ran }
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
process.exit(out.crash === undefined ? 0 : 1)
