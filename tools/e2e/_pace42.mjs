// 짧은 재현 — **대표 구간은 왜 두 시간인가**: 걷기 속도를 잰다
//
//     node tools/e2e/_pace42.mjs [--runs=960x640:webgpu,640x400:webgpu,960x640:gl]
//
// ⚠️ **진단이다. 판정에 안 쓴다.** 세이브를 물려 **같은 길을 같은 걸음으로**
// 걷고, 초당 몇 칸인지만 본다.
//
// 재는 까닭 — 지난 대표 구간 한 판(6,339초)을 뜯으면 배틀 64회가 554초(9%)고
// 길 계획 4,865회가 **0.3초**다. 나머지 90%가 **걷는 시간**이다. 그런데 계기판은
// 프레임 45~65ms(FPS 4~5)를 찍는데 우리 루프는 2.3ms다 — 그리는 쪽이 붙잡고
// 있다는 뜻이고, 그러면 한 칸이 그 배수만큼 걸린다.
//
// 그래서 **무엇을 바꾸면 빨라지는가**를 판마다 하나씩만 바꿔 잰다:
// 화면 크기와 그래픽 백엔드다. 걷는 길과 걸음 수는 판마다 똑같다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7)
  ?? '.audit/journey/probe-jubilife.rpsave'
const RUNS = (args.find((a) => a.startsWith('--runs='))?.slice(7)
  ?? '960x640:webgpu,640x400:webgpu,480x320:webgpu,960x640:gl').split(',')
/** 한 판에 몇 칸을 걷나. 길이 아니라 **키를 누른 횟수**다 */
const STEPS = Number(args.find((a) => a.startsWith('--steps='))?.slice(8) ?? '60')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/pace42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const out = { stamp: STAMP, save: SAVE, steps: STEPS, runs: [] }

/** 지금 선 칸과 계기판 */
const look = (p) => p.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const st = await import('/src/state/worldState.ts')
  const refs = await import('/src/scene/sceneRefs.ts')
  const pos = st.worldState.player.position
  const perf = refs.perfSnapshot
  return {
    map: w.world.mapId, x: Math.floor(pos.x), z: Math.floor(pos.z),
    fps: perf?.fps ?? null, ms: perf?.ms ?? null, draws: perf?.draws ?? null,
  }
})

let vite = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-pace42')

  for (const spec of RUNS) {
    const [size, gpu] = spec.split(':')
    const [width, height] = size.split('x').map(Number)
    const browser = await chromium.launch({ args: gpuArgs(gpu) })
    const page = await browser.newPage({ viewport: { width, height } })
    const one = { spec, width, height, gpu }
    try {
      await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
      await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
      await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
      const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
      await bring.waitFor({ timeout: 60_000 })
      await bring.click()
      await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
      await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
        && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
      await page.waitForTimeout(3000)

      /**
       * ⚠️ **하네스가 실제로 걷는 그대로 잰다.** 한 칸씩 떼어 누르면
       * 재는 자의 왕복이 한 칸마다 붙어서(누름 120ms + 관측) **드라이버보다
       * 느리게** 나온다 — `runKeys`는 같은 방향을 **키를 누른 채로** 몰고
       * 25ms마다 볼 뿐이다. 그래서 `goTo`를 그대로 불러 시간을 잰다.
       *
       * 길은 **도시 안**으로 고른다 — 풀밭을 넣으면 야생 배틀이 판마다 다르게
       * 붙어서 백엔드 차이가 그 잡음에 묻힌다
       */
      const legs = [
        { map: 4, what: '축복 마트' },
        { map: 3, what: '축복시티' },
        { map: 6, what: '축복 센터' },
        { map: 3, what: '축복시티(다시)' },
      ]
      one.legs = []
      await driveStory(page, {
        log: () => {},
        totalMs: 900_000,
        skipStory: true,
        after: async (api) => {
          for (const leg of legs) {
            const t1 = Date.now()
            const how = await api.goTo(leg.map, 240_000)
            one.legs.push({ ...leg, how, ms: Date.now() - t1 })
          }
          return null
        },
      })
      const ms = one.legs.reduce((a, b) => a + b.ms, 0)
      const ok = one.legs.filter((l) => l.how === 'arrived').length
      one.ms = ms
      one.arrived = `${String(ok)}/${String(legs.length)}`
      const end = await look(page)
      one.fps = end.fps
      one.at = end
      console.log(`  ${spec} — ${one.arrived} 도착 · ${String(Math.round(ms / 1000))}초`
        + ` · 다리마다 ${JSON.stringify(one.legs.map((l) => Math.round(l.ms / 1000)))}초`
        + ` · FPS ${String(end.fps)}`)
      await page.screenshot({ path: `${OUT}/${spec.replace(':', '-')}.png` })
    } catch (e) {
      one.crash = String(e?.message ?? e).slice(0, 300)
      console.error(`  ${spec} — 터졌다: ${one.crash}`)
    } finally {
      await browser.close()
    }
    out.runs.push(one)
  }
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
