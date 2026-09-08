// 진단 — **입력은 들어오는데 왜 안 걷는가** (REPAIR §42).
//
//     node tools/e2e/_move42.mjs --save=.audit/journey/end.rpsave
//
// ⚠️ **판정기가 아니다.** 앞 진단(`_stall42`)이 여기까지 좁혔다: 세이브를 들여
// 필드에 선 뒤 방향키를 눌러도 자리가 안 바뀌는데, 문지기는 다 열려 있었다 —
// `isGameActive()` 참 · `isUiCaptured()` 거짓 · 메뉴 없음 · `input.move`가
// `[0,-1]`. 즉 **키는 주인공까지 온다.** 그런데 안 간다.
//
// 그러면 남는 자리는 `actor/player`의 `fixedUpdate` 안이다. 거기서 걸음을
// 막을 수 있는 것들을 **하나씩 값으로 읽는다** — 컷인·타는 것·얼음·판·장애물·
// 사람·격자·특징. 무엇이 참인지 보면 어느 갈래가 잡고 있는지가 그 자리에서 난다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const SAVE = flag('save', '.audit/journey/end.rpsave')
const KEY = flag('key', 'ArrowUp')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/move42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 걸음을 막을 수 있는 것들을 한꺼번에 읽는다 (`actor/player`의 차례 그대로) */
const look = (page) => page.evaluate(async () => {
  const s = await import('/src/state/worldState.ts')
  const z = await import('/src/engine/map/zone.ts')
  const cut = await import('/src/engine/battle/encounterCutIn.ts')
  const ob = await import('/src/engine/actor/obstacles.ts')
  const ice = await import('/src/engine/actor/ice.ts')
  const dis = await import('/src/engine/world/distortion.ts')
  const feat = await import('/src/engine/world/mapFeatures.ts')
  const loop = await import('/src/engine/loop/GameLoop.ts')
  const pause = await import('/src/engine/loop/pause.ts')
  const w = await import('/src/engine/map/world.ts')
  const save = await import('/src/state/saveStore.ts')
  const p = s.worldState.player
  const g = z.activeZone.grid
  const tx = Math.floor(p.position.x)
  const tz = Math.floor(p.position.z)
  const near = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  return {
    world: { map: w.world.mapId, matrix: w.world.matrix },
    saved: save.useSaveStore.getState().position,
    at: [Number(p.position.x.toFixed(3)), Number(p.position.y.toFixed(3)),
      Number(p.position.z.toFixed(3))],
    vel: [Number(p.velocity.x.toFixed(3)), Number(p.velocity.y.toFixed(3)),
      Number(p.velocity.z.toFixed(3))],
    move: [s.worldState.input.move.x, s.worldState.input.move.y],
    bumpDir: p.bumpDir,
    facing: Number(p.facing.toFixed(3)),
    // ① 발을 통째로 묶는 셋 (`fixedUpdate` 첫 갈래)
    riding: p.riding, flying: p.flying, cutIn: cut.cutInFrame.now,
    // ② 세계가 도는가
    paused: loop.gameLoop.paused, holds: pause.loopHolds(), systems: loop.gameLoop.systems.length,
    // ③ 격자
    grid: g !== null,
    zoneAt: g?.zoneAt?.(tx, tz) ?? null,
    hereBlocked: g?.isBlockedAtWorld?.(p.position.x, p.position.z) ?? null,
    aroundBlocked: near.map(([dx, dz]) =>
      g?.isBlockedAtWorld?.(p.position.x + dx, p.position.z + dz) ?? null),
    height: g?.heightAtWorld?.(p.position.x, p.position.z, p.position.y) ?? null,
    // ④ 미끄러지는 것들
    sliding: ice.isSliding?.() ?? null,
    // ⑤ 자리를 막는 것들 — 바위·사람·특징
    obstacle: near.map(([dx, dz]) => (ob.obstacleAt?.(tx + dx, tz + dz) ?? null) !== null),
    solidNpc: near.map(([dx, dz]) => (ob.solidNpcAt?.(tx + dx, tz + dz) ?? null) !== null),
    feature: near.map(([dx, dz]) => feat.mapFeatureBridge?.blocked?.(tx + dx, tz + dz, p.position.y)
      ?? null),
    distortion: dis.distortionBridge?.frame?.() ?? null,
  }
})

let vite = null
let browser = null
const out = { stamp: STAMP, save: SAVE, key: KEY, samples: [] }
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-move42')
  browser = await chromium.launch({ args: gpuArgs('webgpu') })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  const noise = []
  page.on('pageerror', (e) => { noise.push(String(e.message).slice(0, 200)) })
  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForTimeout(3000)

  /**
   * **세계가 아직 도는가.** 키를 다 놓았는데도 `input.move`가 마지막 값
   * (`[0,-1]`)에 멎어 있었다 — 그 값을 세우는 것은 `inputSystem.fixedUpdate`뿐이라,
   * 값이 안 바뀐다는 것은 **고정 스텝이 안 돈다**는 뜻일 수 있다.
   *
   * 그래서 셋을 함께 잰다: 브라우저의 rAF가 오는가 · `gameLoop`가 프레임을
   * 세는가 · 스크립트 표식이 그 사이 어떻게 바뀌는가. rAF는 오는데 `tick`이
   * 안 늘면 그리는 쪽(R3F)이 우리를 안 부르는 것이고, rAF도 안 오면 탭이 묻힌 것이다
   */
  const beat = async (page, label) => {
    const got = await page.evaluate(async () => {
      const loop = await import('/src/engine/loop/GameLoop.ts')
      const fs2 = await import('/src/engine/loop/frameStats.ts')
      const s = await import('/src/state/worldState.ts')
      const start = { raf: 0, t: performance.now() }
      await new Promise((done) => {
        const step = () => {
          start.raf += 1
          if (performance.now() - start.t < 600) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      })
      return {
        raf: start.raf,
        fps: loop.gameLoop.stats.fps,
        frameMs: Number(loop.gameLoop.stats.frameMs.toFixed(2)),
        paused: loop.gameLoop.paused,
        elapsed: Number(s.worldState.time.elapsed.toFixed(2)),
        p50: Number(fs2.frameStats.percentile(50).toFixed(2)),
        script: document.documentElement.dataset.script ?? '-',
      }
    })
    out.beats = out.beats ?? []
    out.beats.push({ label, ...got })
    return got
  }
  await beat(page, '누르기 전')

  out.before = await look(page)
  // ⚠️ **네 방향을 다 눌러 본다.** 한 방향만 누르면 벽 하나로도 「안 움직인다」가
  // 되는데, 그것은 정상이다. 네 방향이 다 막혀야 갇힌 것이다
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    const was = await look(page)
    await page.keyboard.down(key)
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(150)
      out.samples.push({ key, ...await look(page) })
    }
    await page.keyboard.up(key)
    await page.waitForTimeout(300)
    await beat(page, key)
    const now = await look(page)
    out.tries = out.tries ?? []
    out.tries.push({
      key,
      from: was.at, to: now.at,
      moved: Math.hypot(now.at[0] - was.at[0], now.at[2] - was.at[2]) > 0.05,
      bump: now.bumpDir, blocked: was.aroundBlocked,
    })
  }
  out.after = await look(page)
  await page.screenshot({ path: `${OUT}/누른뒤.png` })
  out.noise = noise.slice(0, 6)
} catch (e) {
  out.crash = String(e?.stack ?? e).slice(0, 600)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
const say = (s) => (s === undefined || s === null ? '못 읽었다' : JSON.stringify(s))
console.log(`\n  누르기 전 ${say(out.before)}`)
for (const t of out.tries ?? []) {
  console.log(`  ${t.key} ${t.moved ? '움직였다' : '**안 움직였다**'} `
    + `${say(t.from)} → ${say(t.to)} · 부딪힘 ${say(t.bump)}`)
}
console.log(`\n  놓은 뒤 ${say(out.after)}`)
console.log(`\n  ${OUT}`)
if (out.crash) console.log(`  터졌다 ${out.crash}`)
