// 진단 — **어디서 못 나아가는가**를 짧게 잡는다 (REPAIR §42 · 검토 지시 2).
//
//     node tools/e2e/_stall42.mjs --save=.audit/journey/start.rpsave --goto=418
//     node tools/e2e/_stall42.mjs --save=…  --goto=3 --cap=240 --headed
//
// ⚠️ **판정기가 아니다.** 관문은 `pnpm journey`고, 이 파일은 정체 순간을 잡는다.
//
// 왜 따로 두나: 대표 구간을 수십 분씩 되풀이해서는 못 가른다. 실패 직전의
// **정상 세이브를 들여** 그 한 구간만 몬다. 들인 세이브는 진단용이고 정상
// 플레이의 증거로 세지 않는다.
//
// 재는 것 셋 (벽시계 하나로 때우지 않는다):
//
//   ① 단계별 성공 조건 — 목적지 도착
//   ② 무진행 감지    — 자리·대사·스크립트·잠금이 그대로면 **거기서 멈추고 적는다**
//   ③ 전체 시간 상한 — 브라우저나 엔진이 통째로 멎은 경우의 마지막 빗장
//
// 멈춘 순간에 남기는 것: 마지막으로 준 입력, 자리, 이동 잠금, 도는 스크립트,
// 대사와 고르는 줄, 워프·전투 상태, 그리고 그 화면 그림.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const SAVE = flag('save', '.audit/journey/start.rpsave')
const GOTO = Number(flag('goto', '418'))
const CAP_MS = Number(flag('cap', '300')) * 1000
/** 몇 번 연달아 「그대로」면 멈춘 것으로 볼까. 250ms 간격이니 기본은 12초다 */
const STUCK = Number(flag('stuck', '48'))
const HEADED = args.includes('--headed')
/** 이야기를 처음부터 몰까. 안 주면 들인 세이브에서 그 한 구간만 간다 */
const STORY = args.includes('--story')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/stall42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

let vite = null
let browser = null
const out = { stamp: STAMP, save: SAVE, goto: GOTO, capMs: CAP_MS, notes: [] }

/**
 * 지금 상태 한 벌. **화면의 읽기 전용 표식 + 엔진이 든 값**이다.
 *
 * ⚠️ **`data-tile`만으로는 못 가른다.** 잠긴 채 제자리인 것과 걸을 수 있는데
 * 안 걷는 것은 다른 일이고, 그것을 가르는 값은 이동 잠금과 도는 스크립트다
 */
const snap = (page) => page.evaluate(async () => {
  const ds = { ...document.documentElement.dataset }
  const w = await import('/src/engine/map/world.ts')
  const s = await import('/src/state/worldState.ts')
  const f = await import('/src/engine/script/field.ts')
  const k = await import('/src/engine/input/keys.ts')
  const loop = await import('/src/engine/loop/GameLoop.ts')
  const menu = await import('/src/state/menuStore.ts')
  const p = s.worldState.player
  const row = document.querySelector('[role="radiogroup"]')
  const choices = row === null ? null
    : [...row.querySelectorAll('[role="radio"]')].map((e) => ({
      label: (e.textContent ?? '').slice(0, 24),
      on: e.getAttribute('aria-checked') === 'true',
    }))
  return {
    ds,
    world: { map: w.world.mapId, matrix: w.world.matrix, grid: w.world.grid !== null },
    player: {
      x: Number(p.position.x.toFixed(3)), z: Number(p.position.z.toFixed(3)),
      facing: Number(p.facing.toFixed(3)),
      /**
       * 발이 묶이는 자리들. **`locked`라는 칸은 없다** — 조작을 막는 것은
       * 이 넷과 `<html data-script>`다 (`state/worldState`가 각각의 까닭을 적는다)
       */
      hop: p.hop.active, flying: p.flying, riding: p.riding, surfing: p.surfing,
      cycling: p.cycling,
      moving: Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z) > 0.001,
    },
    /**
     * 도는 스크립트. **번호와 멈춘 자리까지 적는다** — 「스크립트가 돈다」만으로는
     * 어느 것이 안 끝나는지 못 짚는다. `state`가 `waiting`이면 무언가를
     * 기다리는 중이고, 같은 `pointer`에 오래 머물면 그 명령이 안 풀리는 것이다
     */
    /**
     * **세계가 몇 프레임이나 도는가.** 정체를 「막혔다」로만 읽으면 안 된다 —
     * 초당 한 프레임이면 잠금이 하나도 없어도 사람은 못 걷는다. 실측으로
     * 복원 직후 0.6초에 rAF가 **1번** 온 판이 있었다 (fps 4)
     */
    fps: loop.gameLoop.stats.fps,
    script: {
      errors: f.fieldScripts.errors ?? 0,
      last: String(f.fieldScripts.lastError ?? '').slice(0, 160),
      running: f.fieldScripts.ctx !== null,
      state: f.fieldScripts.ctx?.state ?? null,
      file: f.fieldScripts.ctx?.file ?? null,
      pointer: f.fieldScripts.ctx?.pointer ?? null,
    },
    /**
     * **입력이 주인공까지 가는가.** 자리가 안 바뀌는 까닭은 둘이다 — 발이
     * 묶였거나, 입력이 아예 안 들어오거나. 잠금은 위에서 봤으니 여기서는
     * 뒤쪽을 본다 (`engine/input/keyboard`의 `inputSystem`이 이 셋으로 자른다)
     */
    gate: {
      gameActive: k.isGameActive(),
      uiCaptured: k.isUiCaptured(),
      menuStack: menu.useMenuStore.getState().stack.map((m) => m.kind ?? m.name ?? String(m)),
      focus: document.activeElement?.tagName ?? null,
      move: [s.worldState.input.move.x, s.worldState.input.move.y],
    },
    text: (document.querySelector('[data-talkbox], [class*=talk]')?.textContent ?? '').slice(0, 120),
    choices,
  }
})

/** 그 상태를 **한 줄로** 접는다. 이 줄이 안 바뀌면 못 나아간 것이다*/
const fold = (s) => [
  s.world.map, s.world.matrix, s.player.x, s.player.z, s.player.facing,
  s.player.hop, s.player.flying, s.player.riding, s.player.surfing, s.player.moving, s.ds.scene, s.ds.talk, s.ds.script, s.ds.menu,
  s.ds.battle, s.script.file, s.script.pointer, (s.choices ?? []).map((c) => `${c.label}${c.on ? '*' : ''}`).join('/'),
  s.text,
].join('|')

try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-stall42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  const noise = []
  page.on('pageerror', (e) => { noise.push(`pageerror ${String(e.message).slice(0, 200)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  // 진단용 세이브를 정상 UI로 들인다
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  /**
   * **들이는 동안의 자취.** 어디에 서는가는 한 번 보고 끝낼 값이 아니다 —
   * 같은 세이브가 판마다 다른 자리로 섰다(맵 342의 저장 자리 · 맵 411의
   * 113.7,885.3). 그래서 누른 직후부터 250ms마다 **맵과 자리**를 적는다:
   * 저장 자리에 섰다가 옮겨지는지, 처음부터 엉뚱한 데 서는지가 여기서 갈린다
   */
  const landing = []
  const watchLanding = (async () => {
    for (let i = 0; i < 60; i++) {
      const one = await page.evaluate(async () => {
        const w = await import('/src/engine/map/world.ts')
        const s = await import('/src/state/worldState.ts')
        const p = s.worldState.player
        return {
          map: w.world.mapId,
          matrix: w.world.matrix,
          x: Number(p.position.x.toFixed(3)),
          z: Number(p.position.z.toFixed(3)),
          scene: document.documentElement.dataset.scene ?? null,
        }
      }).catch(() => null)
      if (one !== null) {
        const last = landing[landing.length - 1]
        if (last === undefined || last.map !== one.map || last.x !== one.x || last.z !== one.z) {
          landing.push({ ms: i * 250, ...one })
        }
      }
      await page.waitForTimeout(250)
    }
  })()

  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 180_000 })
  await page.waitForTimeout(2500)
  out.from = await snap(page)
  console.log(`  들였다 — 맵 ${String(out.from.world.map)} ${String(out.from.player.x)},${String(out.from.player.z)}`)

  /**
   * ② **무진행 감지.** 몰기와 나란히 돌면서 접은 줄을 지켜보다가, 같은 줄이
   * `STUCK`번 이어지면 그 자리를 통째로 적고 몰기를 끊는다
   */
  let same = 0
  const fpsSeries = []
  let last = null
  const trail = []
  let stalled = null
  const watching = (async () => {
    const until = Date.now() + CAP_MS
    while (Date.now() < until && stalled === null) {
      const s = await snap(page).catch(() => null)
      if (s !== null) {
        fpsSeries.push(s.fps)
        const line = fold(s)
        if (line === last) same += 1
        else { same = 0; last = line; trail.push({ at: Date.now(), line: line.slice(0, 200) }) }
        if (same >= STUCK) { stalled = { at: Date.now(), snap: s, sameFor: same * 250 } }
      }
      await page.waitForTimeout(250)
    }
  })()

  await watchLanding
  out.landing = landing
  console.log(`  들이는 자취 ${landing.map((l) => `${String(l.ms)}ms 맵${String(l.map)} ${String(l.x)},${String(l.z)}`).join(' → ')}`)

  const drive = await driveStory(page, {
    log: (line) => { console.log(`    ${line}`) },
    totalMs: CAP_MS,
    skipStory: !STORY,
    after: async (api) => {
      const verdict = await api.goTo(GOTO, CAP_MS)
      return { verdict, at: await api.now() }
    },
  })
  await watching
  out.drive = drive.extra
  out.trail = trail.slice(-40).map((t) => t.line)
  out.fps = {
    samples: fpsSeries.length,
    min: fpsSeries.length > 0 ? Math.min(...fpsSeries) : null,
    max: fpsSeries.length > 0 ? Math.max(...fpsSeries) : null,
    median: fpsSeries.length > 0
      ? [...fpsSeries].sort((a, b) => a - b)[Math.floor(fpsSeries.length / 2)] : null,
    under10: fpsSeries.filter((v) => v < 10).length,
  }
  out.stalled = stalled
  out.to = await snap(page)
  await page.screenshot({ path: `${OUT}/멈춘자리.png` })
  out.noise = noise.slice(0, 8)
} catch (e) {
  out.crash = String(e?.stack ?? e).slice(0, 600)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  몰기 ${JSON.stringify(out.drive ?? null)}`)
if (out.stalled) {
  const s = out.stalled.snap
  console.log(`\n  ⚠️ **못 나아갔다** — ${String(Math.round(out.stalled.sameFor / 1000))}초 동안 그대로다`)
  console.log(`     자리   맵 ${String(s.world.map)}/${String(s.world.matrix)} `
    + `${String(s.player.x)},${String(s.player.z)} 바라보는 각 ${String(s.player.facing)}`)
  console.log(`     발     ${JSON.stringify(s.player)}`)
  console.log(`     화면   ${JSON.stringify(s.ds)}`)
  console.log(`     스크립트 ${JSON.stringify(s.script)}`)
  console.log(`     고르는 줄 ${JSON.stringify(s.choices)}`)
  console.log(`     글     ${JSON.stringify(s.text)}`)
  console.log(`     문지기 ${JSON.stringify(s.gate)}`)
} else {
  console.log('\n  멈춘 자리는 안 잡혔다 (성공했거나 계속 움직이고 있었다)')
}
console.log(`\n  자취 ${String((out.trail ?? []).length)}줄 · ${OUT}`)
if (out.crash) console.log(`  터졌다 ${out.crash}`)
process.exit(out.drive?.verdict === 'arrived' ? 0 : 1)
