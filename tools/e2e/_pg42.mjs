// 진단 — **엔딩 뒤 고친 것을 제자리에서 재 본다** (REPAIR §134~§139 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_pg42.mjs [--case=r224|regi|ground|dex|legends [--only=이름,…]] [--headed]
//
//   r224  224번도로 오박사 → 석판 이름 짓기(화면에 글을 넣고 Enter) → 흰 화면 워프 → 파도의길이 트였나(북쪽으로 걸어 472에 드나)
//   regi  무쇠 유적 — 운명적 만남 레지기가스를 들고 점 일곱을 밟는다 → 석상(270) → 레지스틸 배틀이 열리나
//   dex   마박사 연구소 — 신오 210을 다 보면 전국도감 · 포켓트레
//   legends 전설 열둘 — 조건을 세우고 곁에서 A → 제 종족·레벨의 배틀이 열리나(크레세리아·새는 배회 · 깃발)
//   ground 배틀그라운드 — 오늘의 넷이 서나(관장 겉모습) → 첫째에게 말을 걸어 재대결이 열리나
//   fight  배틀에어리어 — 배에서 내리면 라이벌과 둘이서 전진·대엽과 태그 배틀이 열리나
//   charon 천관산 셋째 방 — 찬미가 잡히고 214 · 방 상태가 서나
//   rematch 사천왕 — 214가 서면 충호가 재대결 팀으로 나오나
//   temple 설원 신전 B5F — 얼음을 미끄러져 레지기가스 앞까지 가나
//   rotom  로토무의 방 — 맨 로토무 하나로 가전에 들어가나(파티 화면 없이) · 든 뒤에는 되돌리기가 뜨나
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
page.on('console', (m) => { if (m.type() === 'error') console.error(`  console ${m.text().slice(0, 200)}`) })
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
      ...(e.hour === undefined ? {} : { hour: e.hour }),
    })
    if (e.nationalDex) save.useSaveStore.getState().obtainNationalDex()
  }, [base, map, x, z, facing, extra])
  await page.waitForFunction((m) => document.documentElement.dataset.map === String(m)
    && document.documentElement.dataset.restoring === undefined, map, { timeout: 120_000 })
  await page.waitForTimeout(5000)
}
/** 타이틀 → 확인 지점 표 → `/play`. `warpTo`는 `/play`가 떠 있어야 받는다 */
const enterPlay = async () => {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  // ⚠️ **`warpTo`는 뛰어들 곳을 올려 두기만 한다** — `/play`가 떠 있어야 씬이 받는다. 타이틀의 확인 지점 표로
  // 바탕 지점에 먼저 선다(`story.mjs`의 길)
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator('[data-checkpoint="siwon"]').first()
  await row.hover(); await page.waitForTimeout(150); await row.click()
  // 기계가 바쁘면 클릭이 안 먹는 때가 있다 — 화면이 말하는 대로 Z(뛰어들기)를 한 번 더
  const went = await page.waitForURL('**/play', { timeout: 20_000 }).then(() => true, () => false)
  if (!went) { await row.hover(); await page.waitForTimeout(300); await page.keyboard.press('KeyZ') }
  await page.waitForURL('**/play', { timeout: 400_000 })
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(3000)
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
  await enterPlay()

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
  if (CASE === 'ground') {
    // 배틀그라운드 (454) — 들어서면 오늘의 넷을 뽑는다(§139). 환영 컷신이 먼저 돈다
    await warp('siwon', 454, 7, 10, 0, { postGame: true })
    await clear(30)
    const who = await page.evaluate(async () => {
      const n = await import('/src/engine/actor/npcs.ts')
      const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
      return {
        picked: [0, 1, 2, 3].map((i) => v.get(16485 + i)),
        hidden: [0, 1, 2, 3].map((i) => v.checkFlag(674 + i)),
        standing: n.npcActors.list.filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx]),
      }
    })
    log('오늘의 넷', who)
    await page.screenshot({ path: `${OUT}/ground-four.png` })
    // 첫째 (2,9) — (2,10)에서 북쪽을 보고 A, 물음엔 예
    await page.evaluate(async () => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(2.5, st.player.position.y, 10.5)
      st.player.prevPosition.copy(st.player.position)
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
    })
    await page.waitForTimeout(800)
    await tap('ArrowUp', 300, 90)
    await tap('Space', 400)
    let battle = false
    for (let i = 0; i < 40 && !battle; i++) {
      battle = await page.evaluate(() => document.documentElement.dataset.scene === 'battle')
      if (!battle) await tap('Space', 500)
    }
    await page.waitForTimeout(4000)
    const b = await page.evaluate(async () => {
      const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
      return { scene: document.documentElement.dataset.scene, kind: bs.kind, trainer: bs.trainerId, cls: bs.trainerClass, foes: bs.foes.map((m) => [m.species, m.level]) }
    })
    log('첫째에게 말 건 뒤', b)
    await page.screenshot({ path: `${OUT}/ground-battle.png` })
  }
  if (CASE === 'dex') {
    // 마박사 연구소 (422) — 신오 210을 다 봤으면 오박사가 와서 전국도감을 켜고 포켓트레(431)를 준다
    // 연구소 이야기 칸 3 — 깨어진 세계에서 돌아온 뒤다. 0이면 첫 방문(스타팅 고르기) 장면이 돈다
    await warp('siwon', 422, 7, 10, 0, { postGame: true, story: [[16550, 3]] })
    await clear(20)
    const setup = await page.evaluate(async () => {
      const save = (await import('/src/state/saveStore.ts')).useSaveStore
      const f = await import('/src/engine/script/field.ts')
      // 진단 — 본 것을 전부 채운다(전국 493). 신오 판정은 그중 210만 센다
      for (let n = 1; n <= 493; n++) save.getState().markSeen(n)
      // 영원시티 · 해안시티 첫 도착 (`SandgemTownLab_ProfRowanReactToPokedex` · `SetVarIfArrivedInSunyshoreCity`)
      f.forceFlag(2490); f.forceFlag(2494)
      return { national: save.getState().nationalDex, labState: f.fieldScripts.vars.get(16550) }
    })
    log('조건', setup)
    log('선 사람', await page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list
      .filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx])))
    // 이야기 칸 3이면 마박사는 (7,14)에서 남쪽을 본다(`SetProfRowanAndCounterpartPositions`) — 북쪽 (7,13)에서 남쪽을 보고 A
    await page.evaluate(async () => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(7.5, st.player.position.y, 13.5)
      st.player.prevPosition.copy(st.player.position)
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
    })
    await page.waitForTimeout(800)
    await tap('ArrowDown', 300, 90)
    await page.screenshot({ path: `${OUT}/dex-before.png` })
    await tap('Space', 400)
    // 긴 장면 — 오박사가 들어와 도감을 올리고 떠난 뒤 레이더를 준다
    for (let i = 0; i < 120; i++) {
      const at = await now()
      if (i > 5 && !at.talk && at.script !== '1') break
      await tap('Space', 450)
    }
    const after = await page.evaluate(async () => {
      const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
      const f = await import('/src/engine/script/field.ts')
      const radar = s.bag.flat().find((it) => it.item === 431) ?? null
      return { national: s.nationalDex, radar, shown: f.fieldScripts.vars.checkFlag(272) }
    })
    log('장면 뒤', after)
    await page.screenshot({ path: `${OUT}/dex-after.png` })
  }
  if (CASE === 'legends') {
    // 전설 열둘 — 조건은 디컴프에서 읽었다(스크립트 줄은 각 줄 끝). 판마다 새로 들어간다: 배틀을 끝내지 않고 다음으로 넘어간다
    const ONLY = flag('only', '')
    const LEGENDS = [
      { name: '히드런', map: 265, at: [7, 7], face: 'ArrowUp', story: [[16542, 1]], set: [293], clear: [288, 142, 477], want: [485, 50] }, // stark_mountain_room_3.s:23-32,73
      { name: '디아루가', map: 584, at: [29, 18], face: 'ArrowUp', story: [[16580, 0]], clear: [208], want: [483, 70] }, // spear_pillar_dialga.s:31-43
      { name: '펄기아', map: 585, at: [33, 18], face: 'ArrowUp', story: [[16581, 0]], clear: [209], want: [484, 70] },
      { name: '다크라이', map: 321, at: [16, 14], face: 'ArrowUp', story: [[16451, 0x1209]], items: [[454, 1]], clear: [344], want: [491, 50] }, // newmoon_island_forest.s:12-25,44
      { name: '쉐이미', map: 274, at: [911, 204], face: 'ArrowUp', story: [[16452, 0x1112]], items: [[452, 1]], clear: [291], want: [492, 30] }, // flower_paradise.s:12-26,46
      { name: '레지기가스', map: 283, at: [11, 13], face: 'ArrowUp', set: [282], clear: [579, 283, 142], want: [486, 1] }, // snowpoint_temple_b5f.s:24-51
      { name: '로토무', map: 300, at: [11, 4], face: 'ArrowUp', hour: 22, clear: [329, 2736], want: [479, 20] }, // old_chateau_back_middle_west_room.s:11-24
      { name: '기라티나', map: 270, at: [11, 15], face: 'ArrowUp', clear: [289, 592, 142], want: [487, 47] }, // turnback_cave_giratina_room.s:35
      { name: '유크시', map: 319, at: [14, 11], face: 'ArrowUp', clear: [481, 295, 142], want: [480, 50] }, // acuity_cavern.s:25-41
      { name: '아그놈', map: 316, at: [16, 15], face: 'ArrowUp', clear: [480, 294, 142], want: [482, 50] }, // valor_cavern.s:39-55
      { name: '크레세리아', map: 261, at: [15, 15], face: 'ArrowRight', story: [[16472, 0]], clear: [591, 287], roam: [1], flags: [591, 287] }, // fullmoon_island_forest.s:13-41
      { name: '전설의 새(오박사)', map: 82, at: [4, 6], face: 'ArrowUp', story: [[16478, 0], [16479, 0], [16480, 0]], clear: [578, 152, 153, 281], roam: [3, 4, 5], flags: [153, 281], item: 252 }, // eterna_city_south_house.s:9-49
    ].filter((l) => ONLY === '' || ONLY.split(',').includes(l.name))
    const table = []
    for (const [n, L] of LEGENDS.entries()) {
      if (n > 0) await enterPlay()
      // 깃발은 뛰기 **전에** — 들어서며 도는 OnTransition이 숨김을 정한다. VM과 세이브 두 군데에 적는다
      await page.evaluate(async ([set, clear]) => {
        const f = await import('/src/engine/script/field.ts')
        const save = (await import('/src/state/saveStore.ts')).useSaveStore
        const flags = Uint8Array.from(save.getState().flags)
        for (const id of set) { f.forceFlag(id); flags[id >> 3] |= 1 << (id & 7) }
        for (const id of clear) { f.fieldScripts.vars.clearFlag(id); flags[id >> 3] &= ~(1 << (id & 7)) }
        save.setState({ flags })
      }, [L.set ?? [], L.clear ?? []])
      await warp('siwon', L.map, L.at[0], L.at[1], 0, { postGame: true, nationalDex: true, story: L.story ?? [], items: L.items ?? [], hour: L.hour })
      await clear(20)
      const standing = await page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list
        .filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx]))
      await tap(L.face, 300, 90)
      await tap('Space', 400)
      let battle = false
      for (let i = 0; i < 30 && !battle; i++) {
        battle = await page.evaluate(() => document.documentElement.dataset.scene === 'battle')
        if (!battle) {
          const at = await now()
          if (i < 4 || i % 10 === 0) log(`  ${L.name} ${String(i)}`, at)
          if (L.want === undefined && i > 4 && !at.talk && at.script !== '1') break
          await tap('Space', 500)
        }
      }
      let got
      if (L.want) {
        await page.waitForTimeout(3500)
        got = await page.evaluate(async () => {
          const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
          const foe = bs.view?.active?.p2a ?? bs.truth?.active?.p2a ?? null
          return { scene: document.documentElement.dataset.scene, phase: bs.phase, foe: foe ? [foe.species, foe.level] : null }
        })
        got.ok = got.foe !== null && got.foe[0] === L.want[0] && got.foe[1] === L.want[1]
      } else {
        await clear(40)
        got = await page.evaluate(async ([slots, fl, item]) => {
          const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
          const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
          return {
            roam: slots.map((i) => [i, s.roamers[i]?.species, s.roamers[i]?.level, s.roamers[i]?.active]),
            flags: fl.map((id) => [id, v.checkFlag(id)]),
            item: item === null ? null : s.bag.flat().find((it) => it.item === item)?.count ?? 0,
          }
        }, [L.roam, L.flags, L.item ?? null])
        got.ok = got.roam.every((r) => r[3] === true) && got.flags.every((f) => f[1]) && (got.item === null || got.item > 0)
      }
      log(`${got.ok ? '✅' : '❌'} ${L.name}`, { ...got, standing: got.ok ? undefined : standing })
      table.push({ name: L.name, ...got })
      await page.screenshot({ path: `${OUT}/legend-${String(n).padStart(2, '0')}.png` })
    }
    log('합계', `${String(table.filter((t) => t.ok).length)}/${String(table.length)}`)
  }

  // 여럿을 쉼표로 이으면(`--case=fight,rotom`) 한 서버에서 차례로 돈다 — 둘째부터는 타이틀로 다시 들어간다
  const CASES = CASE.split(',')
  let turns = 0
  const turn = async (name) => {
    if (!CASES.includes(name)) return false
    if (turns++ > 0) await enterPlay()
    console.log(`\n  ── ${name}`)
    return true
  }
  /** 뛴 뒤 그 칸에 세운다 — 지나친 칸의 트리거를 안 친다 */
  const standAt = async (x, z) => {
    await page.evaluate(async ([tx, tz]) => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(tx + 0.5, st.player.position.y, tz + 0.5)
      st.player.prevPosition.copy(st.player.position)
      ;(await import('/src/engine/script/field.ts')).resetTriggerTile()
    }, [x, z])
    await page.waitForTimeout(800)
  }
  /** 대사를 넘기며 배틀이 열릴 때까지 */
  const untilBattle = async (n = 60) => {
    for (let i = 0; i < n; i++) {
      if (await page.evaluate(() => document.documentElement.dataset.scene === 'battle')) return true
      await tap('Space', 450)
    }
    return false
  }
  const battleInfo = () => page.evaluate(async () => {
    const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
    const a = bs.view?.active ?? {}
    return {
      scene: document.documentElement.dataset.scene, kind: bs.kind, doubles: bs.doubles,
      foes: bs.foes.map((t) => t.id), partner: bs.partner?.id ?? null,
      out: Object.entries(a).map(([k, m]) => [k, m?.species, m?.level]),
    }
  })
  const vf = (vars, flags) => page.evaluate(async ([vs, fs]) => {
    const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
    return { vars: vs.map((id) => [id, v.get(id)]), flags: fs.map((id) => [id, v.checkFlag(id)]) }
  }, [vars, flags])
  const setFlags = (set, clear) => page.evaluate(async ([s, c]) => {
    const f = await import('/src/engine/script/field.ts')
    const save = (await import('/src/state/saveStore.ts')).useSaveStore
    const flags = Uint8Array.from(save.getState().flags)
    for (const id of s) { f.forceFlag(id); flags[id >> 3] |= 1 << (id & 7) }
    for (const id of c) { f.fieldScripts.vars.clearFlag(id); flags[id >> 3] &= ~(1 << (id & 7)) }
    save.setState({ flags })
  }, [set, clear])

  if (await turn('fight')) {
    // 배틀에어리어 — 배에서 내리면 라이벌이 기다리고, 라이벌 + 주인공 대 전진 + 대엽의 태그 배틀(fight_area.s · snowpoint_city.s:210)
    await setFlags([], [467, 468, 482])
    await warp('siwon', 188, 623, 434, 0, { postGame: true, nationalDex: true, story: [[16513, 0], [16542, 0]] })
    log('내린 자리', await now())
    const opened = await untilBattle(80)
    await page.waitForTimeout(4000)
    const b = await battleInfo()
    // 원작 — 상대 921(전진) · 922(대엽), 편은 스타팅에 따라 923~925
    log(`${opened && b.foes.includes(921) && b.foes.includes(922) && b.partner !== null ? '✅' : '❌'} 태그 배틀`, b)
    await page.screenshot({ path: `${OUT}/fight-tag.png` })
  }
  if (await turn('charon')) {
    // 천관산 셋째 방 — 먼저 들어선 찬미를 국제경찰이 잡는다(stark_mountain_room_3.s). 끝나면 214 · 16542=1 · 16544=2
    await setFlags([], [475, 476, 478, 563, 214])
    await warp('siwon', 265, 7, 16, 0, { postGame: true, nationalDex: true, story: [[16542, 0]] })
    log('선 사람', await page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list
      .filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx])))
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(200); if ((await now()).script === '1') break }
    await page.keyboard.up('ArrowUp')
    log('걸은 뒤', await now())
    await page.screenshot({ path: `${OUT}/charon-start.png` })
    for (let i = 0; i < 150; i++) {
      const at = await now()
      if (i > 10 && !at.talk && at.script !== '1') break
      if (at.scene === 'battle') { log('배틀이 열렸다', await battleInfo()); break }
      await tap('Space', 450)
    }
    const after = await vf([16542, 16544], [214])
    log(`${after.flags[0][1] && after.vars[0][1] === 1 && after.vars[1][1] === 2 ? '✅' : '❌'} 찬미 뒤`, after)
    await page.screenshot({ path: `${OUT}/charon-after.png` })
  }
  if (await turn('rematch')) {
    // 사천왕 재대결 — 214가 서면 방마다 `_REMATCH` 트레이너(pokemon_league_*.s). 들어서면 두 칸 북쪽으로 걷는다
    await setFlags([214], [176])
    await warp('siwon', 177, 8, 11, 0, { postGame: true, nationalDex: true })
    await clear(20)
    log('들어선 뒤', await now())
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(200); if ((await now()).z <= 6) break }
    await page.keyboard.up('ArrowUp')
    await tap('ArrowUp', 300, 90)
    log('충호 앞', await now())
    await tap('Space', 400)
    const opened = await untilBattle(40)
    await page.waitForTimeout(4000)
    const b = await battleInfo()
    // 원작 — 충호 재대결 866 · 선두 메가자리 Lv65
    log(`${opened && b.foes[0] === 866 ? '✅' : '❌'} 충호 재대결`, b)
    await page.screenshot({ path: `${OUT}/rematch-aaron.png` })
  }
  if (await turn('temple')) {
    // 설원 신전 B5F — 얼음을 미끄러져 레지기가스 앞까지(snowpoint_temple_b5f.s). 길은 격자로 찾았고 높이는 안 봤다 — 멈춘 자리를 적는다
    await setFlags([282], [579, 283, 142])
    await warp('siwon', 283, 8, 4, 0, { postGame: true, nationalDex: true })
    await clear(10)
    const PATH = [['ArrowLeft', 7, 4], ['ArrowDown', 7, 17], ['ArrowDown', 7, 18], ['ArrowRight', 16, 18], ['ArrowUp', 16, 10],
      ['ArrowLeft', 4, 10], ['ArrowDown', 4, 16], ['ArrowRight', 11, 16], ['ArrowUp', 11, 15], ['ArrowUp', 11, 14], ['ArrowUp', 11, 13]]
    let ok = true
    for (const [key, wx, wz] of PATH) {
      await page.keyboard.down(key); await page.waitForTimeout(90); await page.keyboard.up(key)
      // 미끄러짐이 멈출 때까지 — 같은 칸이 여섯 번 이어지면 멈춘 것이다
      let last = ''; let same = 0
      for (let i = 0; i < 80 && same < 6; i++) {
        await page.waitForTimeout(120)
        const at = await now(); const k = `${String(at.x)},${String(at.z)}`
        same = k === last ? same + 1 : 0; last = k
      }
      const hit = last === `${String(wx)},${String(wz)}`
      ok &&= hit
      log(`${hit ? '·' : '✗'} ${key}`, `${last} (격자로 본 곳 ${String(wx)},${String(wz)})`)
      if (!hit) break
    }
    await page.screenshot({ path: `${OUT}/temple-ice.png` })
    if (ok) {
      await tap('ArrowUp', 300, 90)
      await tap('Space', 400)
      const opened = await untilBattle(40)
      await page.waitForTimeout(3500)
      const b = await battleInfo()
      log(`${opened && b.out.some((o) => o[1] === 486) ? '✅' : '❌'} 얼음 끝 레지기가스`, b)
      await page.screenshot({ path: `${OUT}/temple-regigigas.png` })
    }
  }
  if (await turn('rotom')) {
    // 로토무의 방 (571) — 맨 로토무 하나로 전자레인지 → 예/아니오만 뜨고, 파티 화면 없이 그 로토무가 들어간다(REPAIR §140)
    await setFlags([129], [])
    await warp('siwon', 571, 4, 7, 0, { postGame: true, nationalDex: true, items: [[467, 1]], story: [[16454, 0x1103]] })
    await clear(20)
    await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const { party } = save.useSaveStore.getState()
      save.useSaveStore.setState({ party: [...party.slice(0, 5), { ...party[0], species: 479, form: 0, isEgg: false, nickname: null }] })
    })
    const mon = () => page.evaluate(async () => {
      const m = (await import('/src/state/saveStore.ts')).useSaveStore.getState().party.find((p) => p.species === 479)
      return m ? { form: m.form, moves: m.moves.map((s) => s.move) } : null
    })
    log('들고 간 로토무', await mon())
    const menus = async (label) => {
      const seen = []
      await tap('ArrowUp', 300, 90)
      await tap('Space', 400)
      for (let i = 0; i < 40; i++) {
        const at = await now()
        // 스크립트 메뉴는 `FieldWorld.menu`에 선다(예/아니오도) — 칸 수가 곧 되돌리기가 붙었는가다
        const sm = await page.evaluate(async () => {
          const m = (await import('/src/engine/script/field.ts')).fieldScripts.world?.menu ?? null
          return m === null ? null : `${m.kind}/${String(m.entries.length)}`
        })
        if (sm !== null) seen.push(`script:${sm}`)
        if (at.menu !== undefined) seen.push(at.menu)
        if (i > 4 && !at.talk && at.script !== '1' && at.menu === undefined) break
        await tap('Space', 450)
      }
      log(`${label} — 지나간 메뉴`, [...new Set(seen)])
      return seen
    }
    await standAt(4, 7)
    const first = await menus('맨 로토무로 전자레인지')
    const m1 = await mon()
    // 원작 — 폼 1(히트) · 오버히트(315)를 안다 · 예/아니오 둘만 떴고 파티 화면(스크립트 메뉴가 아닌 화면)이 안 떴다
    const onlyYesNo = first.every((s) => s === 'script:yesno/2')
    log(`${m1?.form === 1 && m1.moves.includes(315) && onlyYesNo ? '✅' : '❌'} 들어갔다`, m1)
    await page.screenshot({ path: `${OUT}/rotom-heat.png` })
    await standAt(4, 7)
    await menus('히트 로토무로 다시 전자레인지(되돌리기 메뉴가 떠야 한다)')
    log('그 뒤', { mon: await mon(), ...(await vf([16667], [119])) })
  }
} catch (e) {
  console.error(`  터졌다 — ${String(e?.stack ?? e).slice(0, 700)}`)
  await page.screenshot({ path: `${OUT}/crash.png` }).catch(() => {})
  console.error(`  그때 — ${page.url()} ${JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset })).catch(() => null))}`)
} finally {
  await browser.close()
  vite.child.kill()
}
