// 짧은 재현 — **트레이너 스쿨 문 앞 (168,777)에서 왜 못 들어가는가**
//
//     node tools/e2e/_school43.mjs [--save=.audit/journey/seg-08.rpsave] [--rounds=8]
//
// ⚠️ **판정이 아니라 탐침이다.** 대표 구간 1판·8판이 그 칸에서 섰다(문은 (168,776)).
// 문을 여러 번 드나들며 못 들어간 판의 **정확한 자리·얼굴·미는 쪽**과 그림을 남긴다.
// 읽기만 한다 — 옮기지도 쓰지도 않는다
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const SAVE = flag('save', '.audit/journey/seg-08.rpsave')
const ROUNDS = Number(flag('rounds', '8'))
const FROM_EAST = args.includes("--east")
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/school43/${STAMP}`)
mkdirSync(OUT, { recursive: true })
const out = { save: SAVE, rounds: [] }

/** 주인공의 정확한 자리·얼굴 (읽기만) */
const exact = (page) => page.evaluate(async () => {
  const st = await import('/src/state/worldState.ts')
  const p = st.worldState.player
  return { x: p.position.x, z: p.position.z, facing: p.facing, move: [st.worldState.input.move.x, st.worldState.input.move.y] }
})

let vite = null, browser = null
try {
  const port = await freePort()
  vite = await startVite(port, flag('cache', 'node_modules/.vite-school43'))
  browser = await chromium.launch({ args: gpuArgs('gl'), headless: true })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  out.console = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') out.console.push(`${m.type()} ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => { out.console.push(`pageerror ${String(e.message).slice(0, 300)}`) })
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
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
    totalMs: 3_000_000,
    skipStory: true,
    after: async (api) => {
      for (let r = 0; r < ROUNDS; r++) {
        // 판마다 다른 데서 다가간다 — 동·서·남에서
        const from = FROM_EAST ? { x: 175, z: 782 } : [{ x: 175, z: 782 }, { x: 160, z: 781 }, { x: 168, z: 786 }, { x: 180, z: 777 }][r % 4]
        const went = await api.stepOn(3, from, 240_000)
        const t0 = Date.now()
        // 스쿨 안에서 곧바로 끊기지 않게 짧은 예산으로 문 하나만 본다
        const got = await api.goTo(29, 150_000)
        const one = { r, from, went, got, ms: Date.now() - t0 }
        if (got !== 'arrived') {
          one.at = await exact(page)
          one.marks = await page.evaluate(() => ({ ...document.documentElement.dataset }))
          await page.screenshot({ path: `${OUT}/round-${String(r)}.png` })
          // 그 자리에서 **위를 1초 누르며** 제품의 문 판정 재료를 프레임마다 읽는다 (읽기만)
          await page.keyboard.down('ArrowUp')
          one.probe = []
          for (let i = 0; i < 12; i++) {
            await page.waitForTimeout(80)
            one.probe.push(await page.evaluate(async () => {
              const w = await import('/src/engine/map/world.ts')
              const st = await import('/src/state/worldState.ts')
              const mv = await import('/src/engine/input/move.ts')
              const p = st.worldState.player
              const push = mv.pushDirection()
              const door = w.world.grid ? w.doorEntry(w.world.grid, w.warpsOf(w.world.mapId),
                { x: p.position.x, z: p.position.z, facing: p.facing }, push) : 'no grid'
              return {
                x: +p.position.x.toFixed(3), z: +p.position.z.toFixed(3), facing: +p.facing.toFixed(3),
                push, armed: w.world.armed, door: door && typeof door === 'object' ? door.to : door,
                pending: w.world.pending ? 'yes' : null, mode: st.worldState.camera.mode,
              }
            }))
          }
          await page.keyboard.up('ArrowUp')
          one.after = await page.evaluate(() => document.documentElement.dataset.map)
        }
        one.console = out.console.splice(0)
        out.rounds.push(one)
        console.log(`  · ${String(r)} ${JSON.stringify(one)}`)
        if (got === 'arrived') {
          const back = await api.goTo(3, 240_000)
          console.log(`    밖으로 → ${back}`)
          if (back !== 'arrived') break
        }
      }
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e).slice(0, 900)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}
writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
const bad = out.rounds.filter((x) => x.got !== 'arrived').length
console.log(`\n  ${OUT}\n  못 들어간 판 ${String(bad)} / ${String(out.rounds.length)}`)
