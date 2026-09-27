// 진단 — **엔딩 뒤 고친 것 셋을 제자리에서 재 본다** (REPAIR §134~§137 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_pg42.mjs [--case=r224|regi] [--headed]
//
//   r224  224번도로 오박사 → 석판 이름 짓기(화면에 글을 넣고 Enter) → 흰 화면 워프 → 파도의길이 트였나(북쪽으로 걸어 472에 드나)
//   regi  무쇠 유적 — 운명적 만남 레지기가스를 들고 점 일곱을 밟는다 → 석상(270) → 레지스틸 배틀이 열리나
//
// ⚠️ **조건은 개발 모듈로 세운다** — 전국도감 · 배포 표식 · 편지 · 전당등록. 걸어서 거기까지 가는 판이 아니다(그건 다음 일).
// 대사·이름·걸음·배틀은 전부 화면과 키다
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const CASE = flag('case', 'r224')
const OUT = resolve(ROOT, 'shots/pg42')
mkdirSync(OUT, { recursive: true })

const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
const log = (what, v) => { console.log(`  ${what} — ${typeof v === 'string' ? v : JSON.stringify(v)}`) }
const tap = async (key, ms = 150, hold = 70) => {
  await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(ms)
}
const facing = () => page.evaluate(async () => (await import('/src/state/worldState.ts')).worldState.player.facing)
const now = () => page.evaluate(async () => {
  const w = (await import('/src/engine/map/world.ts')).world
  const st = (await import('/src/state/worldState.ts')).worldState
  const f = await import('/src/engine/script/field.ts')
  return {
    map: Number(document.documentElement.dataset.map ?? -1), wm: w.mapId, x: Math.floor(st.player.position.x), z: Math.floor(st.player.position.z),
    menu: document.documentElement.dataset.menu, scene: document.documentElement.dataset.scene,
    talk: document.documentElement.dataset.talk === '1', script: document.documentElement.dataset.script,
  }
})
/** 확인 지점 하나를 바탕으로 그 맵 그 칸에 선다 (`shot --warp`와 같은 길) */
/**
 * @param extra 확인 지점에 더할 것 — `story`(변수) · `items` · `postGame`. `nationalDex`면 뛰어드는 **그 틀 안에서** 전국도감을
 *   켠다(설정 단계에 그 칸이 없다) — 씬이 맵에 들어서며 도는 스크립트가 그것을 봐야 한다
 */
const warp = async (base, map, x, z, facing, extra = {}) => {
  await page.evaluate(async ([b, m, tx, tz, f, e]) => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const save = await import('/src/state/saveStore.ts')
    const cp = CHECKPOINTS.find((c) => c.id === b)
    await warpTo({
      ...cp, id: `pg>${String(m)}`, map: m, spot: { kind: 'tile', x: tx, z: tz, facing: f },
      postGame: e.postGame ?? cp.postGame, story: [...(cp.story ?? []), ...(e.story ?? [])],
      items: [...(cp.items ?? []), ...(e.items ?? [])],
    })
    if (e.nationalDex) save.useSaveStore.getState().obtainNationalDex()
  }, [base, map, x, z, facing, extra])
  await page.waitForFunction((m) => document.documentElement.dataset.map === String(m)
    && document.documentElement.dataset.restoring === undefined, map, { timeout: 120_000 })
  await page.waitForTimeout(5000)
}
/** 대사를 넘긴다 — 물음이면 첫 칸(예) */
const clear = async (n = 40) => {
  for (let i = 0; i < n; i++) {
    const at = await now()
    if (!at.talk && at.menu === undefined && at.script !== '1') { await page.waitForTimeout(300); if (!(await now()).talk) return }
    if (at.menu === 'naming') return
    await tap('Space', 350)
  }
}

try {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  // ⚠️ **`warpTo`는 뛰어들 곳을 올려 두기만 한다** — `/play`가 떠 있어야 씬이 받는다. 타이틀의 확인 지점 표로
  // 바탕 지점에 먼저 선다(`story.mjs`의 길)
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator('[data-checkpoint="siwon"]').first()
  await row.hover(); await page.waitForTimeout(150); await row.click()
  await page.waitForURL('**/play', { timeout: 60_000 })
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)

  if (CASE === 'r224') {
    // 전당등록 · 전국도감 · 오박사의 편지 · 배포 표식(쉐이미 0x1112) · 쉐이미 사건 상태 1 — 오박사를 세우는 것은 들어설 때의 스크립트다
    await warp('siwon', 399, 909, 494, 0, {
      postGame: true, nationalDex: true, items: [[452, 1]], story: [[16451 + 1, 0x1112], [16471, 1]],
    })
    log('224번도로', await now())
    const oak = await page.evaluate(async () => {
      const n = await import('/src/engine/actor/npcs.ts')
      return n.npcActors.list.filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx])
    })
    log('선 사람', oak)
    // 오박사 (909,492) — 한 칸 아래 (909,493)에서 북쪽을 보고 A
    await page.evaluate(async () => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(909.5, st.player.position.y, 493.5)
      st.player.prevPosition.copy(st.player.position)
      // 뛴 자리 사이의 칸을 밟은 것으로 안 친다 — 안 그러면 지나친 점의 트리거가 엉뚱한 자리에서 돈다
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
    })
    await page.waitForTimeout(800)
    await tap('ArrowUp', 300, 90)
    log('오박사 쪽을 봤나', await facing())
    await page.screenshot({ path: `${OUT}/r224-talk.png` })
    await tap('Space', 100)
    for (let i = 0; i < 16; i++) {
      const d = await page.evaluate(async () => {
        const f = await import('/src/engine/script/field.ts')
        const { talk, script, menu, tile } = document.documentElement.dataset
        return { talk, script, menu, tile, oakState: f.fieldScripts.vars.get(16525), shaymin: f.fieldScripts.vars.get(16471) }
      })
      log(`A 뒤 ${String(i * 500)}ms`, d)
      if (d.menu === 'naming') break
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: `${OUT}/r224-after-a.png` })
    await clear(60)
    let named = false
    for (let i = 0; i < 40 && !named; i++) {
      const at = await now()
      if (at.menu === 'naming') {
        await page.screenshot({ path: `${OUT}/r224-naming.png` })
        await page.fill('input', 'SHAYMIN')
        await tap('Enter', 800)
        named = true
      } else { await tap('Space', 400) }
    }
    log('이름 짓기 화면', named ? '열려서 적었다' : '안 열렸다')
    await clear(80)
    await page.waitForTimeout(3000)
    const after = await page.evaluate(async () => {
      const f = await import('/src/engine/script/field.ts')
      const w = (await import('/src/engine/map/world.ts')).world
      const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
      const g = w.grid
      return {
        tablet: s.trainer.tabletName, wrote: f.fieldScripts.vars.checkFlag(301) === true,
        seabreak: f.fieldScripts.vars.get(16438 + 3), land: g?.meta.chunks.find((c) => c.i === 15 * 30 + 28)?.land,
        path: [0, 3, 6, 9].map((z) => g?.isBlocked(28 * 32 + 15, 15 * 32 + z)),
      }
    })
    log('석판 뒤', after)
    await page.screenshot({ path: `${OUT}/r224-after.png` })
    // 파도의길로 — (911,480) 쉐이미 자리 북쪽 벽 줄을 지나 472로 드는지 북쪽으로 걸어 본다
    const walk = await page.evaluate(async () => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(28 * 32 + 15.5, st.player.position.y, 15 * 32 + 12.5)
      st.player.prevPosition.copy(st.player.position)
      // 뛴 자리 사이의 칸을 밟은 것으로 안 친다 — 안 그러면 지나친 점의 트리거가 엉뚱한 자리에서 돈다
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
      return true
    })
    log('파도의길 입구에 섰다', walk)
    await page.waitForTimeout(1500)
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250)
      const at = await now()
      if (at.map !== 399) break
    }
    await page.keyboard.up('ArrowUp')
    await page.waitForTimeout(1500)
    log('북쪽으로 걸은 뒤', await now())
    await page.screenshot({ path: `${OUT}/r224-north.png` })
  }

  if (CASE === 'regi') {
    await warp('siwon', 588, 7, 11, 0, { postGame: true })
    // 운명적 만남 레지기가스 — 원작에서 이 문을 여는 길은 배포뿐이다(SIWON.md §1). 진단이라 세이브에 바로 넣는다
    const gigas = await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const { party } = save.useSaveStore.getState()
      const lead = party[0]
      if (!lead) return 'no party'
      save.useSaveStore.setState({ party: [...party.slice(0, 5), { ...lead, species: 486, origin: { ...lead.origin, fateful: true } }] })
      return save.useSaveStore.getState().party.map((m) => [m.species, m.level, m.origin.fateful === true])
    })
    log('파티', gigas)
    const tileNow = () => page.evaluate(() => document.documentElement.dataset.tile)
    /** 누른 채 그 칸에 들 때까지 — 도는 걸음 하나, 걷는 걸음 하나 */
    const stepInto = async (key, want) => {
      await page.keyboard.down(key)
      const till = Date.now() + 3000
      while (Date.now() < till && (await tileNow()) !== want) await page.waitForTimeout(25)
      await page.keyboard.up(key)
      await page.waitForTimeout(700)
      return tileNow()
    }
    const DOTS = [[4, 7], [5, 5], [5, 9], [7, 7], [9, 5], [9, 9], [10, 7]]
    for (const [x, z] of DOTS) {
      // 점 한 칸 아래에 세우고 북쪽으로 한 칸 — 좌표 이벤트는 들어설 때 걸린다
      await page.evaluate(async ([tx, tz]) => {
        const st = (await import('/src/state/worldState.ts')).worldState
        st.player.position.set(tx + 0.5, st.player.position.y, tz + 1.5)
        st.player.prevPosition.copy(st.player.position)
      // 뛴 자리 사이의 칸을 밟은 것으로 안 친다 — 안 그러면 지나친 점의 트리거가 엉뚱한 자리에서 돈다
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
      }, [x, z])
      await page.waitForTimeout(600)
      const at = await stepInto('ArrowUp', `${String(x)},${String(z)}`)
      await clear(20)
      const state = await page.evaluate(async () => {
        const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
        const st = (await import('/src/state/worldState.ts')).worldState
        return `${String(v.get(16489))} · 지역 ${[1, 2, 3, 4, 5, 6, 7].map((i) => v.get(16384 + i)).join('')} · 자리 ${st.player.position.x.toFixed(2)},${st.player.position.z.toFixed(2)}`
      })
      log(`점 (${String(x)},${String(z)})`, `섰다 ${String(at)} · 유적 상태 ${String(state)}`)
    }
    await page.screenshot({ path: `${OUT}/regi-dots.png` })
    // 석상 (7,1) — (7,2)에서 북쪽을 보고 A
    await page.evaluate(async () => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(7.5, st.player.position.y, 3.5)
      st.player.prevPosition.copy(st.player.position)
      // 뛴 자리 사이의 칸을 밟은 것으로 안 친다 — 안 그러면 지나친 점의 트리거가 엉뚱한 자리에서 돈다
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
    })
    await page.waitForTimeout(600)
    log('석상 앞', await stepInto('ArrowUp', '7,2'))
    await tap('ArrowUp', 300, 90)
    await tap('Space', 300)
    let battle = false
    for (let i = 0; i < 40 && !battle; i++) {
      battle = await page.evaluate(() => document.documentElement.dataset.scene === 'battle')
      if (!battle) await tap('Space', 500)
    }
    await page.waitForTimeout(4000)
    const b = await page.evaluate(async () => {
      const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
      return { scene: document.documentElement.dataset.scene, battle: document.documentElement.dataset.battle, phase: bs.phase, kind: bs.kind, foes: bs.foes.map((m) => [m.species, m.level]) }
    })
    log('석상 A 뒤', b)
    await page.screenshot({ path: `${OUT}/regi-battle.png` })
  }
} catch (e) {
  console.error(`  터졌다 — ${String(e?.stack ?? e).slice(0, 700)}`)
} finally {
  await browser.close()
  vite.child.kill()
}
