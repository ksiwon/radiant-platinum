// 진단 — **엔딩 뒤 고친 것을 제자리에서 재 본다** (REPAIR §134~§139 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_pg42.mjs [--case=r224|regi|ground|dex|legends [--only=이름,…]] [--headed]
//
//   r224  224번도로 오박사 → 석판 이름 짓기(화면에 글을 넣고 Enter) → 흰 화면 워프 → 파도의길이 트였나(북쪽으로 걸어 472에 드나)
//   regi  무쇠 유적 — 운명적 만남 레지기가스를 들고 점 일곱을 밟는다 → 석상(270) → 레지스틸 배틀이 열리나
//   dex   마박사 연구소 — 신오 210을 다 보면 전국도감 · 포켓트레
//   legends 전설 열둘 — 조건을 세우고 곁에서 A → 제 종족·레벨의 배틀이 열리나(크레세리아·새는 배회 · 깃발)
//   ground 배틀그라운드 — 오늘의 넷이 서나(관장 겉모습) → 첫째에게 말을 걸어 재대결이 열리나
//   fight  파이트에리어 — 배에서 내리면 라이벌과 둘이서 전진·대엽과 태그 배틀이 열리나
//   charon 하드마운틴 셋째 방 — 플루토가 잡히고 214 · 방 상태가 서나
//   rematch 사천왕 — 214가 서면 충호가 재대결 팀으로 나오나
//   temple 선단신전 B5F — 얼음을 미끄러져 레지기가스 앞까지 가나
//   rotom  로토무의 방 — 맨 로토무 하나로 가전에 들어가나(파티 화면 없이) · 든 뒤에는 되돌리기가 뜨나
//   siwon cresselia shaymin manaphy arceus zones factory stark — 설계는 `_pg42.design.md`. 같은 케이스를 `--repeat=N`(기본 2)번 돈다
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
const printSummary = () => {
  if (globalThis.__pg42summary === undefined) return
  globalThis.__pg42summary()
}
const log = (what, v) => { console.log(`  ${what} — ${typeof v === 'string' ? v : JSON.stringify(v)}`) }
const tap = async (key, ms = 150, hold = 70) => {
  await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(ms)
}
/** 방향을 값으로 돌린다 — 이 게임은 사람이 이동을 안 막아서(actor/obstacles.ts) 방향키를 누르면 NPC 칸으로 걸어 들어간다 */
const faceByValue = async (key) => {
  const face = { ArrowUp: Math.PI, ArrowDown: 0, ArrowRight: Math.PI / 2, ArrowLeft: -Math.PI / 2 }[key]
  await page.evaluate(async (f) => { (await import('/src/state/worldState.ts')).worldState.player.facing = f }, face)
  await page.waitForTimeout(250)
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
  const wantMap = await page.evaluate(async ([b, m, tx, tz, f, e]) => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const save = await import('/src/state/saveStore.ts')
    const cp = CHECKPOINTS.find((c) => c.id === b)
    await warpTo({
      // `map`/`x`가 null이면 확인 지점 자기 자리 그대로 (열린 마을 · 문 앞에 서고 싶을 때)
      ...cp, id: `pg>${String(m ?? cp.map)}`, map: m ?? cp.map, spot: tx === null ? cp.spot : { kind: 'tile', x: tx, z: tz, facing: f },
      postGame: e.postGame ?? cp.postGame, story: [...(cp.story ?? []), ...(e.story ?? [])],
      items: [...(cp.items ?? []), ...(e.items ?? [])],
      ...(e.hour === undefined ? {} : { hour: e.hour }),
      // 지름길 — 파티를 확인 지점의 여섯으로 갈아 끼우지 않는다(이미 가진 알 · 선물을 들고 뛴다)
      ...(e.keepParty === true ? { party: undefined } : {}),
    })
    if (e.nationalDex) save.useSaveStore.getState().obtainNationalDex()
    return m ?? cp.map
  }, [base, map, x, z, facing, extra])
  await page.waitForFunction((m) => document.documentElement.dataset.map === String(m)
    && document.documentElement.dataset.restoring === undefined, wantMap, { timeout: 120_000 })
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

  if (await turn('r224')) {
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
    await faceByValue('ArrowUp')
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

  if (await turn('regi')) {
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
  if (await turn('ground')) {
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
  if (await turn('dex')) {
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
  if (await turn('legends')) {
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
      await faceByValue(L.face)
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

  if (await turn('fight')) {
    // 파이트에리어 — 배에서 내리면 라이벌이 기다리고, 라이벌 + 주인공 대 전진 + 대엽의 태그 배틀(fight_area.s · snowpoint_city.s:210)
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
    // 하드마운틴 셋째 방 — 먼저 들어선 플루토를 국제경찰이 잡는다(stark_mountain_room_3.s). 방 끝에서 16544=2 · 214 · 16542=1을 세우고 바깥(262)의
    // (751,233)으로 워프한다 — 바깥 OnFrame이 상태 2를 보고 루커의 작별을 돌린 뒤 3으로 올린다(stark_mountain_outside.s:143)
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
    const after = { ...(await vf([16542, 16544], [214])), at: await now() }
    log(`${after.flags[0][1] && after.vars[0][1] === 1 && after.vars[1][1] === 3 && after.at.map === 262 ? '✅' : '❌'} 플루토 뒤`, after)
    await page.screenshot({ path: `${OUT}/charon-after.png` })
  }
  if (await turn('rematch')) {
    // 사천왕 재대결 — 214가 서면 방마다 `_REMATCH` 트레이너(pokemon_league_*.s). 들어서면 두 칸 북쪽으로 걷는다
    await setFlags([214], [176])
    await warp('siwon', 177, 8, 11, 0, { postGame: true, nationalDex: true })
    await clear(20)
    log('들어선 뒤', await now())
    // 사람이 이동을 안 막아서 걸어 올라가면 충호를 지나친다 — 충호 한 칸 아래에 세우고 값으로 돌린다
    const aaron = await page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list.filter((a) => a.visible).map((a) => [Math.floor(a.x), Math.floor(a.z), a.gfx]))
    log('방 안 사람', aaron)
    // 충호는 그림 134 — 곁의 209는 석상이다(실측)
    const lead = aaron.find((a) => a[2] === 134) ?? [8, 5]
    await standAt(lead[0], lead[1] + 1)
    await faceByValue('ArrowUp')
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
    // 선단신전 B5F — 얼음을 미끄러져 레지기가스 앞까지(snowpoint_temple_b5f.s). 길은 격자로 찾았고 높이는 안 봤다 — 멈춘 자리를 적는다
    await setFlags([282], [579, 283, 142])
    await warp('siwon', 283, 8, 4, 0, { postGame: true, nationalDex: true })
    await clear(10)
    const PATH = [['ArrowLeft', 7, 4], ['ArrowDown', 7, 17], ['ArrowDown', 7, 18], ['ArrowRight', 16, 18], ['ArrowUp', 16, 10],
      ['ArrowLeft', 4, 10], ['ArrowDown', 4, 16], ['ArrowRight', 11, 16], ['ArrowUp', 11, 15], ['ArrowUp', 11, 14], ['ArrowUp', 11, 13]]
    let ok = true
    for (const [key, wx, wz] of PATH) {
      // 짧게 누르면 방향만 돈다 — 자리가 바뀔 때까지 누르고 뗀다(얼음 위면 뗀 뒤에도 미끄러진다)
      const from = await now()
      await page.keyboard.down(key)
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(40); const p = await now(); if (p.x !== from.x || p.z !== from.z) break }
      await page.keyboard.up(key)
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
      // 진단 — 얼음 뒤에 A가 안 먹으면 무엇이 남았는가: 자리(소수) · 얼굴 · 얼음 상태 · 도는 스크립트 · 앞 칸 사람
      const diag = () => page.evaluate(async () => {
        const st = (await import('/src/state/worldState.ts')).worldState
        const ice = await import('/src/engine/actor/ice.ts')
        const f = await import('/src/engine/script/field.ts')
        const n = await import('/src/engine/actor/npcs.ts')
        const p = st.player.position
        return {
          pos: [p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3)], facing: st.player.facing.toFixed(3),
          sliding: ice.isSliding(), slide: { ...ice.iceSlide }, script: f.fieldScripts.ctx !== null, front: f.frontTile(),
          near: n.npcActors.list.filter((a) => a.visible && Math.abs(a.x - p.x) < 3 && Math.abs(a.z - p.z) < 3)
            .map((a) => [a.x.toFixed(2), a.y.toFixed(2), a.z.toFixed(2), a.gfx]),
        }
      })
      log('얼음 끝 상태', await diag())
      await tap('ArrowUp', 300, 90)
      log('위를 누른 뒤', await diag())
      await tap('Space', 400)
      log('A 뒤', { ...(await diag()), at: await now() })
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
    // 원작 — 폼 1(히트) · 오버히트(315)를 안다. 네 기술을 다 알아서 「배우려 한다」 예/아니오 → 요약 화면(잊을 기술 · `OpenSummaryScreenTeachMove`)
    // → 「잊는다」 예/아니오를 탄다. 셋째 칸(되돌리기)이 붙은 메뉴와 파티 화면은 없어야 한다
    const onlyYesNo = first.every((s) => s === 'script:yesno/2' || s === 'summary')
    log(`${m1?.form === 1 && m1.moves.includes(315) && onlyYesNo ? '✅' : '❌'} 들어갔다`, m1)
    await page.screenshot({ path: `${OUT}/rotom-heat.png` })
    // 들어간 뒤 마박사가 들어오는 OnFrame(16667)이 돈다 — 끝날 때까지 넘긴다
    await clear(80)
    await standAt(4, 7)
    log('다시 선 자리', await now())
    // ⚠️ **들어간 가전은 숨고 그 자리는 `ApplianceSpot`이다** — 원작 메뉴는 「되돌리기」 한 칸이다(`scripts_rotoms_room.s:491`).
    // 예/아니오/되돌리기 세 칸(`RotomsRoom_EnterMotorMenu`)은 **다른** 가전 앞에서 뜬다. 되돌린 뒤 같은 자리에 다시 선 전자레인지에
    // A를 이어 누르면 다시 들어가므로(예/아니오) 첫 메뉴만 판정에 쓴다
    const second = await menus('히트 로토무로 같은 자리(가전 자리 · 되돌리기 한 칸이 떠야 한다)')
    const firstScript = second.find((s) => s.startsWith('script:')) ?? null
    log(`${firstScript === 'script:list/1' ? '✅' : '❌'} 가전 자리의 되돌리기 한 칸`, second)
    log('그 뒤', { mon: await mon(), ...(await vf([16667], [119])) })
  }
  if (await turn('wild')) {
    // 원작 밖에서 더한 야생 (PARITY §6.13) — 로스트타워 1F 밤. 걸어서 만나고, 무엇이 나왔는지 적고, 도망친다.
    // 기대: 스무 판 남짓이면 니로우(198)·무우마(200)가 한 번씩은 나온다(각 5%), 해골몽(355)은 10%
    const N = Number(flag('n', '40'))
    await warp('siwon', 357, 10, 12, 0, { postGame: true, nationalDex: true, hour: 22 })
    await clear(10)
    log('선 자리', await now())
    const panel = async () => (await page.locator('button').allInnerTexts())
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '' && !t.startsWith('FPS'))
    // ⚠️ **배틀이 끝나도 화면 판(view)은 남는다** — 새 배틀이 열린 그 순간에 읽으면 앞 판의 상대를 읽는다.
    // 첫 판에 여섯 번 내리 같은 고오스 Lv20이 적혔다. 그래서 도망친 뒤 판이 `off`로 내려간 것을 보고, 새 판이 `running`이 된 뒤에 읽는다
    const foe = () => page.evaluate(async () => {
      const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
      const m = bs.view?.active?.p2a ?? null
      return { kind: bs.kind, phase: bs.phase, key: m?.key ?? null, hp: m?.hp ?? null, species: m?.species ?? null, level: m?.level ?? null }
    })
    const seen = new Map()
    const rows = []
    for (let n = 0; n < N; n++) {
      // 동서로 오가며 걷는다 — 배틀이 열릴 때까지
      let opened = false
      for (let leg = 0; leg < 40 && !opened; leg++) {
        const key = leg % 2 === 0 ? 'ArrowRight' : 'ArrowLeft'
        await page.keyboard.down(key)
        for (let i = 0; i < 12 && !opened; i++) {
          await page.waitForTimeout(100)
          opened = await page.evaluate(() => document.documentElement.dataset.scene === 'battle')
        }
        await page.keyboard.up(key)
      }
      if (!opened) { log('배틀이 안 열렸다', await now()); break }
      // 상대가 읽힐 때까지
      let f = await foe()
      for (let i = 0; i < 60 && (f.phase !== 'running' || f.species === null); i++) { await page.waitForTimeout(200); f = await foe() }
      rows.push(f)
      seen.set(f.species, (seen.get(f.species) ?? 0) + 1)
      if (f.species === 198 || f.species === 200) await page.screenshot({ path: `${OUT}/wild-${String(f.species)}.png` })
      // 도망친다 — 싸운다·가방·포켓몬·도망친다 차례라 ↓ 셋에 결정. 못 도망치면(원작 확률) 첫 단이 다시 뜨고 또 한다.
      // 판이 `off`로 내려갈 때까지 — 안 내려갔으면 다음 판에서 앞 상대를 또 읽는다
      let down = false
      const till = Date.now() + 90_000
      while (!down && Date.now() < till) {
        if ((await foe()).phase === 'off' && (await now()).scene !== 'battle') { down = true; break }
        const list = await panel()
        if (list.some((t) => t.startsWith('싸운다'))) {
          for (let i = 0; i < 3; i++) await tap('ArrowDown', 80)
          await tap('Space', 300)
        } else await tap('Space', 200)
      }
      await clear(10)
      log(`${String(n + 1)}번째`, { ...f, down })
      if (!down) { log('도망이 안 끝났다', await now()); break }
    }
    log('나온 종', Object.fromEntries(seen))
    log(`${seen.has(198) && seen.has(200) ? '✅' : '❌'} 니로우 · 무우마`, `${String(rows.length)}판`)
  }
  // NEWCASES-START

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 새 케이스 (설계: `_pg42.design.md`) — 시원 사슬 · 전설 사슬 · 배틀존 · 팩토리
  // 공통: 같은 케이스를 `--repeat=N`(기본 2)번 연달아 돈다 · 기다림은 `until` 폴링 · 서면 `halt`가 한 줄을 남긴다
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const sleep = (ms) => page.waitForTimeout(ms)
  /** 조건이 설 때까지 폴링한다. 상한이 지나면 false */
  const until = async (fn, ms = 10_000, step = 150) => {
    const t0 = Date.now()
    for (;;) {
      const v = await fn().catch(() => false)
      if (v) return v
      if (Date.now() - t0 > ms) return false
      await sleep(step)
    }
  }
  const bodyText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ''))
  let cur = null
  const summary = []
  class Halt extends Error {}
  /** ok: true 통과 · false 실패 · null 관측 불가(접지 않고 따로 센다) */
  const check = (label, ok, detail) => {
    cur.checks.push({ label, ok, detail })
    const tag = ok === true ? '[통과]' : ok === null ? '[관측 불가]' : '[실패]'
    console.log(`  ${tag} ${label} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  /** 서다 — 어디서 왜 섰는지 한 줄 + 스크린샷 */
  const halt = async (why) => {
    const at = await now().catch(() => null)
    const shot = `${OUT}/halt-${cur.name}-${String(cur.rep)}.png`
    await page.screenshot({ path: shot }).catch(() => {})
    const line = `${why} · 맵 ${String(at?.map)} (${String(at?.x)},${String(at?.z)}) · 씬 ${String(at?.scene)} · 대사 ${at?.talk ? '있다' : '없다'} · 스크립트 ${String(at?.script)} · ${shot}`
    cur.stopped = line
    console.log(`  [서다] ${line}`)
    throw new Halt(line)
  }
  /** check 하고, 실패면 이 회차를 끝낸다 (뒤 단계가 앞 단계에 기대는 사슬용) */
  const must = async (label, ok, detail) => {
    check(label, ok, detail)
    if (ok !== true) await halt(`${label} 에서 막혔다`)
  }
  const runCase = async (name, body, reps = Number(flag('repeat', '2'))) => {
    if (!(await turn(name))) return
    const runs = []
    for (let rep = 1; rep <= reps; rep++) {
      if (rep > 1) await enterPlay()
      console.log(`\n  ── ${name} 회차 ${String(rep)}/${String(reps)}`)
      cur = { name, rep, checks: [], stopped: null }
      try { await body() } catch (e) {
        if (!(e instanceof Halt)) {
          cur.stopped = `터졌다 ${String(e?.stack ?? e).slice(0, 400)}`
          console.log(`  [서다] ${cur.stopped}`)
          await page.screenshot({ path: `${OUT}/crash-${name}-${String(rep)}.png` }).catch(() => {})
        }
      }
      const bad = cur.checks.filter((c) => c.ok === false)
      const blind = cur.checks.filter((c) => c.ok === null)
      runs.push({ pass: bad.length === 0 && cur.stopped === null, fail: bad.map((c) => c.label), blind: blind.map((c) => c.label), stopped: cur.stopped, n: cur.checks.length })
      console.log(`  ── ${name} 회차 ${String(rep)}: ${runs.at(-1).pass ? '통과' : '실패'} (검사 ${String(cur.checks.length)} · 실패 ${String(bad.length)} · 관측 불가 ${String(blind.length)})`)
    }
    summary.push({ name, runs })
  }

  /** 지금 읽을 값 한 벌 — 전부 제품이 내놓는 것 */
  const probe = (vars = [], flags = [], items = []) => page.evaluate(async ([vs, fs, its]) => {
    const f = await import('/src/engine/script/field.ts')
    const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
    const v = f.fieldScripts.vars
    const count = (id) => s.bag.flat().filter((x) => x.item === id).reduce((n, x) => n + x.count, 0)
    return {
      given: s.siwonGiven,
      vars: Object.fromEntries(vs.map((id) => [id, v.get(id)])),
      flags: Object.fromEntries(fs.map((id) => [id, v.checkFlag(id)])),
      items: Object.fromEntries(its.map((id) => [id, count(id)])),
      party: s.party.map((m) => `${String(m.species)}:${String(m.level)}${m.isEgg ? 'egg' : ''}${m.origin?.fateful ? 'F' : ''}`),
      friend: s.party.map((m) => m.friendship),
    }
  }, [vars, flags, items])
  const setVars = (pairs) => page.evaluate(async (ps) => {
    const f = await import('/src/engine/script/field.ts')
    for (const [id, val] of ps) f.forceVar(id, val)
  }, pairs)
  const giveItems = (pairs) => page.evaluate(async (ps) => {
    const save = await import('/src/state/saveStore.ts')
    const { addItem } = await import('/src/engine/bag/bag.ts')
    const items = await (await import('/src/data/gameData.ts')).loadItems()
    let bag = save.useSaveStore.getState().bag
    for (const [item, n] of ps) {
      const pocket = items.get(item).pocket
      bag = addItem(bag, pocket, item, n) ?? bag
    }
    save.useSaveStore.setState({ bag })
  }, pairs)
  /** 배틀 상대 — 보이는 상대와 씬을 같이 읽는다 */
  const foeNow = () => page.evaluate(async () => {
    const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
    const foe = bs.view?.active?.p2a ?? bs.truth?.active?.p2a ?? null
    return { scene: document.documentElement.dataset.scene, phase: bs.phase, kind: bs.kind, foe: foe ? [foe.species, foe.level] : null }
  })
  /** 대사가 있으면 넘기며 배틀 씬이 열릴 때까지. 열리면 상대가 읽힐 때까지 기다려 돌려준다 */
  const waitBattle = async (ms = 60_000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const at = await now()
      if (at.scene === 'battle') break
      if (at.talk) await tap('Space', 300)
      else await sleep(300)
    }
    if ((await now()).scene !== 'battle') return null
    await until(async () => (await foeNow()).foe !== null, 30_000, 250)
    return foeNow()
  }
  /** 키를 쥐고 그 칸에 들 때까지 */
  const runKeys = async (key, want, n) => {
    await page.keyboard.down(key)
    const till = Date.now() + 800 * n + 1500
    let d = null
    while (Date.now() < till) {
      d = await page.evaluate(() => ({ tile: document.documentElement.dataset.tile, map: document.documentElement.dataset.map, talk: document.documentElement.dataset.talk, scene: document.documentElement.dataset.scene }))
      if (d.tile === want || d.talk === '1' || d.scene !== 'overworld') break
      await sleep(15)
    }
    await page.keyboard.up(key)
    await sleep(120)
    return d
  }
  /** 격자 BFS로 길을 짜고(주인공 칸 → 목표 칸) 키로 걷는다. 사람 · 문은 피한다(목표가 문이면 들어간다) */
  const walkTo = async (tx, tz, { ms = 240_000, label = '', overworld = false } = {}) => {
    const t0 = Date.now()
    const shun = []
    let stuck = 0
    for (let guard = 0; guard < 2000 && Date.now() - t0 < ms; guard++) {
      const at = await now()
      if (at.x === tx && at.z === tz) return { ok: true, why: null }
      if (at.scene === 'battle' || at.talk || at.script === '1') return { ok: false, why: `중단(씬 ${String(at.scene)} 대사 ${String(at.talk)} 스크립트 ${String(at.script)}) ${String(at.x)},${String(at.z)}` }
      const plan = await page.evaluate(async ([goalX, goalZ, bad]) => {
        let gx = goalX; let gz = goalZ
        const W = await import('/src/engine/map/world.ts')
        const st = (await import('/src/state/worldState.ts')).worldState
        const n = await import('/src/engine/actor/npcs.ts')
        const g = W.world.grid
        if (!g) return { err: '격자 없음' }
        const sx = Math.floor(st.player.position.x); const sz = Math.floor(st.player.position.z)
        const key = (x, z) => `${String(x)},${String(z)}`
        const npc = new Set(n.npcActors.list.filter((a) => a.visible).map((a) => key(Math.floor(a.x), Math.floor(a.z))))
        const door = new Set(W.warpsOf(W.world.mapId).map((w) => key(w.x, w.z)))
        const banned = new Set(bad)
        const passable = (x, z) => {
          if (x === gx && z === gz) return true
          if (g.chunkIndexAt(x, z) < 0) return false
          if (g.isBlocked(x, z)) return false
          if (npc.has(key(x, z)) || door.has(key(x, z)) || banned.has(key(x, z))) return false
          return true
        }
        const R = 40
        const prev = new Map([[key(sx, sz), null]])
        const q = [[sx, sz]]
        const D = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]
        let found = false
        let best = [sx, sz]
        let bestD = Math.abs(sx - gx) + Math.abs(sz - gz)
        for (let i = 0; i < q.length && q.length < 100_000; i++) {
          const [x, z] = q[i]
          if (x === gx && z === gz) { found = true; break }
          const dd = Math.abs(x - gx) + Math.abs(z - gz)
          if (dd < bestD) { bestD = dd; best = [x, z] }
          for (const [k, dx, dz] of D) {
            const nx = x + dx; const nz = z + dz
            if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue
            if (prev.has(key(nx, nz)) || !passable(nx, nz)) continue
            prev.set(key(nx, nz), [x, z, k])
            q.push([nx, nz])
          }
        }
        // 목표가 창 밖이면 창 안에서 목표에 제일 가까운 칸까지 가고 다시 짠다
        if (!found) {
          if (best[0] === sx && best[1] === sz) return { err: `길 없음 (${String(sx)},${String(sz)} → ${String(gx)},${String(gz)} · 본 칸 ${String(q.length)})` }
          gx = best[0]; gz = best[1]
        }
        const steps = []
        let c = [gx, gz]
        while (prev.get(key(c[0], c[1])) !== null) {
          const p = prev.get(key(c[0], c[1]))
          steps.unshift({ key: p[2], x: c[0], z: c[1] })
          c = [p[0], p[1]]
        }
        return { steps }
      }, [tx, tz, shun])
      if (plan.err) return { ok: false, why: plan.err }
      // 같은 방향이 이어지는 만큼 한 번에 쥔다 (열 칸까지)
      const first = plan.steps[0]
      let n = 1
      while (n < 10 && plan.steps[n]?.key === first.key) n++
      const end = plan.steps[n - 1]
      const d = await runKeys(first.key, `${String(end.x)},${String(end.z)}`, n)
      const after = await now()
      if (after.map !== at.map && !overworld) return { ok: false, why: `맵이 바뀌었다 ${String(at.map)} → ${String(after.map)}`, mapChanged: after.map }
      if (after.x === at.x && after.z === at.z) {
        stuck++
        shun.push(`${String(first.x)},${String(first.z)}`)
        if (stuck > 6) return { ok: false, why: `${label} 막혔다 ${String(at.x)},${String(at.z)} → ${first.key} (${String(first.x)},${String(first.z)}) ${JSON.stringify(d)}` }
      } else stuck = 0
    }
    return { ok: false, why: `${label} 시간 초과` }
  }
  /** 그 칸에 서서 그 쪽을 바라본다 (뛴 자리 사이 칸은 안 밟은 것으로 친다) */
  const faceKey = async (key) => {
    const face = { ArrowUp: Math.PI, ArrowDown: 0, ArrowRight: Math.PI / 2, ArrowLeft: -Math.PI / 2 }[key]
    await page.evaluate(async (f) => { (await import('/src/state/worldState.ts')).worldState.player.facing = f }, face)
    await sleep(200)
  }
  const standFacing = async (x, z, key) => {
    await standAt(x, z)
    // ⚠️ 방향키를 누르지 않는다 — 이 제품에서는 NPC 칸으로 걸어 들어가진다(`solid` 케이스 실측). 방향은 값으로 돌린다
    const face = { ArrowUp: Math.PI, ArrowDown: 0, ArrowRight: Math.PI / 2, ArrowLeft: -Math.PI / 2 }[key]
    await page.evaluate(async (f) => { (await import('/src/state/worldState.ts')).worldState.player.facing = f }, face)
    await sleep(200)
  }
  /** 대사가 다 끝날 때까지 — 대사창이 떠 있을 때만 Space를 누른다. 지나간 화면 글을 모아 돌려준다 */
  const talkThrough = async (quietMs = 1500, cap = 90_000) => {
    const texts = []
    let quietSince = -1
    let lastPress = 0
    let lastText = ''
    const t0 = Date.now()
    while (Date.now() - t0 < cap) {
      const at = await now()
      const busy = at.talk || at.script === '1' || at.menu !== undefined || at.scene === 'battle'
      if (at.scene === 'battle') break
      if (busy) {
        quietSince = -1
        const txt = await bodyText()
        texts.push(txt)
        // ⚠️ 닫히는 중인 창에 한 번 더 누르면 그 A가 NPC에게 새 말을 건다(시원이 선물 둘을 한 번에 준 판이 있었다).
        // 그래서 글이 바뀌었을 때(쪽이 넘어갔을 때)나 마지막 누름에서 1.2초가 지났을 때만 누른다
        const changed = txt !== lastText
        lastText = txt
        const gap = Date.now() - lastPress
        const k = 'Space'
        if (at.talk && (changed || gap > 1200)) { await tap(k, 300); lastPress = Date.now() }
        else if (!at.talk && gap > 1500) { await tap(k, 200); lastPress = Date.now() } // 스크립트가 버튼을 기다리는 자리(WaitABPress 등)
        else await sleep(200)
      } else {
        if (quietSince < 0) quietSince = Date.now()
        if (Date.now() - quietSince > quietMs) break
        await sleep(150)
      }
    }
    return texts.join('|')
  }

  // ── 시원 ──────────────────────────────────────────────────────────────────────────────────────
  const SIWON_VARS = [16451, 16452, 16453, 16454, 16471, 16489]
  const SIWON_FLAGS = [2404, 344, 291]
  const SIWON_ITEMS = [454, 452, 455, 467]
  const classifyLines = (t) => page.evaluate(async (text) => {
    const { siwonLines } = await import('/src/engine/world/siwonText.ts')
    const L = siwonLines('ko')
    const norm = (x) => x.replace(/\s+/g, '')
    const first = (x) => norm(x.split('\r')[0] ?? '')
    const cands = [['locked', L.locked], ['done', L.done], ['partyFull', L.partyFull], ['bagFull', L.bagFull],
      ...Object.entries(L.gift).map(([k, x]) => [`gift${k}`, x]), ...Object.entries(L.wait).map(([k, x]) => [`wait${k}`, x])]
    return cands.filter(([, x]) => text.includes(first(x))).map(([k]) => k)
  }, t)
  /** 시원 대사 한 덩이의 쪽 수 — 제품의 글(`siwonLines`)을 `\r`로 센다 */
  const pagesOf = (key) => page.evaluate(async (k) => {
    const { siwonLines } = await import('/src/engine/world/siwonText.ts')
    const L = siwonLines('ko')
    const m = /^(gift|wait)(\d+)$/.exec(k)
    const text = m ? L[m[1]][Number(m[2])] : L[k]
    return text.split('\r').length
  }, key)
  const boxPrinted = () => page.evaluate(async () => (await import('/src/engine/script/field.ts')).fieldScripts.world?.printed === true)
  /**
   * 시원 (16,5) 앞 (16,6)에서 북쪽을 보고 A로 말을 건다.
   *
   * ⚠️ **마지막 쪽은 A로 안 닫는다 — `dropOurs()`로 닫는다.** 우리 글(`showOurText`)의 마지막 쪽을 A로 닫으면 같은 프레임에
   * `tryTalk`가 그 A를 또 읽어 시원이 곧바로 다시 말을 건다(제품 결함 — 아래 `siwon` 케이스가 따로 잰다). 아이템 선물은 닫힌 뒤
   * 롬 공용 스크립트(받았다)가 서서 안 되풀이되지만, 화강돌 · 알 · locked · wait · done · partyFull은 A만으로는 끝나지 않는다.
   * `dropOurs()`는 제품이 export하는 「누름 없이 거두기」다 — 기다리던 `after`(선물 주기)는 그대로 돈다
   */
  const faceSiwon = async () => {
    // 칸 (16,6)에 다시 세우고 북쪽(+π)으로 돌린다 — 방향키를 누르면 시원 칸이 비었을 때 걸어 들어간다
    await standAt(16, 6)
    await page.evaluate(async () => { (await import('/src/state/worldState.ts')).worldState.player.facing = Math.PI })
    await sleep(150)
  }
  const talkSiwon = async () => {
    await faceSiwon()
    await tap('Space', 300)
    let opened = await until(async () => (await now()).talk, 2500, 80)
    if (!opened) { await tap('Space', 300); opened = await until(async () => (await now()).talk, 2500, 80) }
    if (!opened) {
      log('talkSiwon — 대화가 안 열렸다', await page.evaluate(async () => {
        const f = await import('/src/engine/script/field.ts')
        const st = (await import('/src/state/worldState.ts')).worldState
        return { ...document.documentElement.dataset, ctx: f.fieldScripts.ctx !== null, boxOpen: f.fieldScripts.world?.boxOpen, interact: st.input.interact, pos: [st.player.position.x, st.player.position.z], facing: st.player.facing, npcs: (await import('/src/engine/actor/npcs.ts')).npcActors.list.map((a) => [a.x, a.z, a.gfx, a.visible]) }
      }))
      return { texts: '', lines: [] }
    }
    let lines = []
    for (let i = 0; i < 40 && lines.length === 0; i++) { lines = await classifyLines(await bodyText()); if (lines.length === 0) await sleep(150) }
    let texts = await bodyText()
    if (flag('trace', '') !== '') log('talkSiwon 열림', { lines, text: texts.slice(40, 140) })
    if (lines.length === 0) { log('talkSiwon — 대사를 못 가렸다', texts.slice(0, 200)); return { texts, lines } }
    const pages = await pagesOf(lines[0])
    for (let i = 0; i < pages - 1; i++) {
      await until(boxPrinted, 5000, 80)
      await tap('Space', 250)
      await until(boxPrinted, 5000, 80)
      texts += await bodyText()
    }
    await until(boxPrinted, 5000, 80)
    await page.evaluate(async () => { (await import('/src/engine/script/field.ts')).dropOurs() })
    // ⚠️ 문서의 `data-talk`는 창이 그려지는 순간에 갈린다 — 닫은 직후 몇 프레임은 아직 1이다. 그때 Space를 누르면 새 A라 시원이 또 말을 건다
    await until(async () => !(await now()).talk, 2500, 40)
    texts += await talkThrough(1800)
    return { texts, lines: await classifyLines(texts) }
  }

  await runCase('siwon', async () => {
    await warp('siwon', 25, 16, 6, Math.PI, { postGame: true, nationalDex: true })
    await clear(10)
    const sig = (p) => JSON.stringify({ g: p.given, party: p.party, items: p.items, vars: p.vars })
    const P = () => probe(SIWON_VARS, SIWON_FLAGS, SIWON_ITEMS)
    const sameAs = (a, b) => sig(a) === sig(b)
    log('선 사람', await page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list.filter((a) => a.visible).map((a) => [Math.floor(a.x), Math.floor(a.z), a.gfx])))
    let p0 = await P()
    check('출발 — 계측이 비어 있음을 읽는다 (given 0 · 도구 넷 0 · 배포 변수 0)', p0.given === 0 && Object.values(p0.items).every((n) => n === 0) && [16451, 16452, 16453, 16454].every((id) => p0.vars[id] === 0), p0)

    // ① 전당등록 전 — 플래그를 내린다(개발 모듈). locked만 말하고 아무것도 안 변한다
    await setFlags([], [2404])
    const unlocked = await P()
    check('전당등록 플래그를 내렸다(읽기 확인)', unlocked.flags[2404] === false, unlocked.flags)
    let r = await talkSiwon()
    let p1 = await P()
    check('전당등록 전 — locked만 말하고 아무것도 안 준다', r.lines.includes('locked') && sameAs(unlocked, p1), { lines: r.lines, before: sig(unlocked), after: sig(p1) })
    await setFlags([2404], [])

    // ② 파티가 가득(6) — partyFull, given 그대로
    const full = await P()
    check('파티 6마리로 시작(읽기)', full.party.length === 6, full.party)
    r = await talkSiwon()
    p1 = await P()
    check('파티가 가득이면 partyFull · given 0 · 파티 그대로', r.lines.includes('partyFull') && p1.given === 0 && p1.party.length === 6, { lines: r.lines, given: p1.given, party: p1.party })
    // 지름길 — 자리 확보: 파티를 한 마리만 남긴다
    await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const st = save.useSaveStore.getState()
      save.useSaveStore.setState({ party: st.party.slice(0, 1) })
    })

    // ③ 선물 하나씩
    const step = async (n, name, expect) => {
      const before = await P()
      const got = await talkSiwon()
      const after = await P()
      const ok = expect(before, after, got)
      check(`선물 #${String(n)} ${name}`, ok.pass, { lines: got.lines, ...ok.detail })
      return { before, after, got }
    }
    await step(1, '화강돌', (b, a, g) => ({ pass: g.lines.includes('gift0') && b.given === 0 && a.given === 1 && a.party.length === b.party.length + 1 && a.party.at(-1) === '442:25', detail: { given: [b.given, a.given], party: a.party } }))
    await step(2, '비밀의 열쇠', (b, a, g) => ({ pass: g.lines.includes('gift1') && a.given === 2 && b.items[467] === 0 && a.items[467] === 1 && b.vars[16454] === 0 && a.vars[16454] === 0x1103, detail: { given: [b.given, a.given], key: [b.items[467], a.items[467]], rotomVar: [b.vars[16454], a.vars[16454]] } }))
    // 음성: 로토무를 안 썼다 — wait1, 다음 것 안 줌
    {
      const b = await P(); const g = await talkSiwon(); const a = await P()
      check('음성 — 열쇠를 안 써 보면 wait1 · 아무것도 안 변한다(회원카드 0 · 다크라이 변수 0)', g.lines.includes('wait1') && sameAs(b, a) && a.items[454] === 0 && a.vars[16451] === 0, { lines: g.lines, same: sameAs(b, a), card: a.items[454], darkraiVar: a.vars[16451] })
    }
    // 지름길: 「썼다」 — 박스에 로토무 form 1 한 마리
    const boxed = await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const st = save.useSaveStore.getState()
      const boxes = st.boxes.map((b) => [...b])
      const at = boxes[0].findIndex((m) => m === null)
      if (at < 0) return { at }
      boxes[0][at] = { ...st.party[0], species: 479, form: 1, isEgg: false, nickname: null }
      save.useSaveStore.setState({ boxes })
      return { at, species: save.useSaveStore.getState().boxes[0][at].species }
    })
    log('지름길 — 로토무(폼1)를 박스에 넣었다', boxed)
    await step(3, '회원 카드', (b, a, g) => ({ pass: g.lines.includes('gift2') && a.given === 3 && b.items[454] === 0 && a.items[454] === 1 && b.vars[16451] === 0 && a.vars[16451] === 0x1209, detail: { given: [b.given, a.given], card: [b.items[454], a.items[454]], darkraiVar: [b.vars[16451], a.vars[16451]] } }))
    {
      const b = await P(); const g = await talkSiwon(); const a = await P()
      check('음성 — 다크라이를 안 잡았다 — wait2 · 편지 0 · 쉐이미 변수 0', g.lines.includes('wait2') && sameAs(b, a) && a.items[452] === 0 && a.vars[16452] === 0, { lines: g.lines, same: sameAs(b, a), letter: a.items[452], shayminVar: a.vars[16452] })
    }
    await setFlags([344], [])    // 지름길: 「썼다」 = FLAG_CAUGHT_DARKRAI
    await step(4, '오박사의 편지 (+ 쉐이미 사건 0→1)', (b, a, g) => ({ pass: g.lines.includes('gift3') && a.given === 4 && b.items[452] === 0 && a.items[452] === 1 && b.vars[16452] === 0 && a.vars[16452] === 0x1112 && b.vars[16471] === 0 && a.vars[16471] === 1, detail: { given: [b.given, a.given], letter: [b.items[452], a.items[452]], shayminVar: [b.vars[16452], a.vars[16452]], shayminState: [b.vars[16471], a.vars[16471]] } }))
    {
      const b = await P(); const g = await talkSiwon(); const a = await P()
      check('음성 — 쉐이미를 안 잡았다 — wait3 · 알 안 줌', g.lines.includes('wait3') && sameAs(b, a), { lines: g.lines, same: sameAs(b, a), party: a.party })
    }
    await setFlags([291], [])    // 지름길: FLAG_CAUGHT_SHAYMIN
    await step(5, '마나피 알', (b, a, g) => ({ pass: g.lines.includes('gift4') && a.given === 5 && a.party.length === b.party.length + 1 && a.party.at(-1)?.startsWith('490:') === true && a.party.at(-1)?.includes('egg') === true, detail: { given: [b.given, a.given], party: a.party, friendship: a.friend.at(-1) } }))
    await step(6, '레지기가스(운명적 만남)', (b, a, g) => ({ pass: g.lines.includes('gift5') && a.given === 6 && a.party.length === b.party.length + 1 && a.party.at(-1) === '486:1F', detail: { given: [b.given, a.given], party: a.party } }))
    {
      const b = await P(); const g = await talkSiwon(); const a = await P()
      check('음성 — 유적에서 레지를 안 잡았다 — wait5 · 피리 0 · 아르세우스 변수 0', g.lines.includes('wait5') && sameAs(b, a) && a.items[455] === 0 && a.vars[16453] === 0, { lines: g.lines, same: sameAs(b, a), flute: a.items[455], arceusVar: a.vars[16453] })
    }
    await setVars([[16489, 290]])   // 지름길: 레지락 유적 상태 290(잡았다)
    await step(7, '하늘빛 피리', (b, a, g) => ({ pass: g.lines.includes('gift6') && a.given === 7 && b.items[455] === 0 && a.items[455] === 1 && b.vars[16453] === 0 && a.vars[16453] === 0x1123, detail: { given: [b.given, a.given], flute: [b.items[455], a.items[455]], arceusVar: [b.vars[16453], a.vars[16453]] } }))
    {
      const b = await P(); const g = await talkSiwon(); const a = await P()
      check('일곱 뒤 — done · 아무것도 안 변한다', g.lines.includes('done') && sameAs(b, a), { lines: g.lines, same: sameAs(b, a) })
    }
    await page.screenshot({ path: `${OUT}/siwon-end.png` })
    {
      // 제품 거동 — 시원의 마지막 쪽을 **A로 닫으면** 같은 프레임에 말 걸기가 그 A를 또 읽어 대화가 다시 열리는가 (done은 2쪽이라 쪽 수만큼 누른다)
      await faceSiwon()
      await tap('Space', 300)
      const opened = await until(async () => (await now()).talk, 3000, 80)
      let ls = []
      for (let i = 0; i < 30 && ls.length === 0; i++) { ls = await classifyLines(await bodyText()); if (ls.length === 0) await sleep(150) }
      const pages = ls.length ? await pagesOf(ls[0]) : 1
      for (let i = 0; i < pages - 1; i++) { await until(boxPrinted, 5000, 80); await tap('Space', 250) }
      await until(boxPrinted, 5000, 80)
      await tap('Space', 300)       // 닫는 누름
      await sleep(900)
      const re = await now()
      const gv = await P()
      check('시원의 마지막 쪽을 A로 닫아도 대화가 다시 열리지 않는다 (제품 거동 — 닫는 A를 같은 프레임에 말 걸기가 또 읽으면 실패)', opened !== false && !re.talk && !re.script, { lines: ls, pages, talkAfterClose: re.talk, script: re.script, given: gv.given })
      await page.evaluate(async () => { (await import('/src/engine/script/field.ts')).dropOurs() })
    }
  })

  // ── 가방에서 도구를 쓴다 (drive.mjs의 `openBagAt` · `chooseUse`를 줄인 것 — 사람이 누르는 길 그대로) ──
  const closeMenusKeys = async () => { for (let i = 0; i < 8 && (await now()).menu !== undefined; i++) await tap('KeyX', 120) }
  const useKeyItem = async (item) => {
    await page.mouse.move(-5, -5).catch(() => {})
    const slot = await page.evaluate(async (it) => {
      const bag = (await import('/src/state/saveStore.ts')).useSaveStore.getState().bag
      for (let p = 0; p < bag.length; p++) { const row = bag[p].findIndex((x) => x.item === it); if (row >= 0) return { item: it, pocket: p, row } }
      return null
    }, item)
    if (!slot) return { ok: false, why: `가방에 도구 ${String(item)}이 없다` }
    const rowAt = () => page.evaluate(() => {
      const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
      return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true'), want: all.findIndex((e) => (e.textContent ?? '').includes('가방')) }
    })
    let menu = null
    for (let attempt = 0; attempt < 4 && !(menu && menu.n > 0); attempt++) {
      if (attempt > 0) await closeMenusKeys()
      await tap('KeyC', 300)
      menu = await until(async () => { const r = await rowAt(); return r.n > 0 ? r : false }, 5000, 80)
    }
    if (!menu || menu.n < 5) { await closeMenusKeys(); return { ok: false, why: `시작 메뉴가 안 열렸다 ${JSON.stringify(menu)}` } }
    const want = menu.want >= 0 ? menu.want : menu.n - 5
    for (let i = 0; i < menu.n + 3; i++) {
      const at = await rowAt()
      if (at.at === want) break
      await tap(at.at < want ? 'ArrowDown' : 'ArrowUp', 60)
    }
    await tap('Space', 250)
    if (!(await until(async () => (await now()).menu === 'bag', 6000, 50))) { await closeMenusKeys(); return { ok: false, why: '가방이 안 열렸다' } }
    const cursor = () => page.evaluate(async () => {
      const b = await import('/src/ui/menu/BagScreen.tsx')
      const bag = (await import('/src/state/saveStore.ts')).useSaveStore.getState().bag
      const pocket = b.bagMemory.pocket
      return { pocket, row: b.recallCursor(pocket, bag[pocket]?.length ?? 0), pockets: bag.length }
    })
    const from = await cursor()
    const right = (slot.pocket - from.pocket + from.pockets) % from.pockets
    const left = from.pockets - right
    if (right <= left) for (let i = 0; i < right; i++) await tap('ArrowRight', 90)
    else for (let i = 0; i < left; i++) await tap('ArrowLeft', 90)
    const mid = await cursor()
    const dy = slot.row - mid.row
    for (let i = 0; i < Math.abs(dy); i++) await tap(dy > 0 ? 'ArrowDown' : 'ArrowUp', 80)
    const stood = await cursor()
    if (stood.pocket !== slot.pocket || stood.row !== slot.row) { await closeMenusKeys(); return { ok: false, why: `그 칸에 못 섰다 ${JSON.stringify({ stood, slot })}` } }
    // 갈래 메뉴에서 「쓴다」 자리 — 화면과 같은 함수로 짜 본다
    const plan = await page.evaluate(async ({ item: it, pocket }) => {
      const b = await import('/src/ui/menu/BagScreen.tsx')
      const a = await import('/src/ui/menu/itemAction.ts')
      const g = await import('/src/data/gameData.ts')
      const m = await import('/src/state/saveStore.ts')
      const info = (await g.loadItems()).get(it)
      const ctx = a.fieldContextNow(undefined)
      const list = b.bagActions({ pocket, item: it, fieldUseFunc: info.fieldUseFunc ?? 0, evoItem: false, preventToss: info.preventToss === 1, canRegister: info.canRegister === 1, registered: m.useSaveStore.getState().registeredItem, cycling: ctx.onBike === true, berryPatchEmpty: ctx.berryAhead?.empty === true })
      return { list, at: list.findIndex((one) => ['use', 'walk', 'check', 'open', 'plant'].includes(one)) }
    }, slot)
    if (plan.at < 0) { await closeMenusKeys(); return { ok: false, why: `갈래 메뉴에 쓰는 자리가 없다 ${JSON.stringify(plan.list)}` } }
    await tap('Space', 300)
    for (let i = 0; i < plan.at; i++) await tap('ArrowDown', 90)
    await tap('Space', 400)
    return { ok: true, why: null, actions: plan.list }
  }

  // ── 전설 사슬 공통 ────────────────────────────────────────────────────────────────────────────
  const visibleNpcs = () => page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list
    .filter((a) => a.visible).map((a) => [Math.floor(a.x), Math.floor(a.z), a.gfx]))
  const hasNpcAt = async (x, z) => (await visibleNpcs()).some((n) => n[0] === x && n[1] === z)
  /** 사람 (nx,nz)에게 말을 건다 — 네 옆 칸 중 걸을 수 있고 비어 있는 칸에 서서 그쪽을 보고 A. 대사창(또는 스크립트)이 열리면 끝까지 넘긴다 */
  const talkNpcAt = async (nx, nz, quietMs = 1800) => {
    const sides = [['ArrowDown', 0, -1], ['ArrowUp', 0, 1], ['ArrowRight', -1, 0], ['ArrowLeft', 1, 0]]
    for (const [key, dx, dz] of sides) {
      const free = await page.evaluate(async ([x, z]) => {
        const W = await import('/src/engine/map/world.ts')
        const n = await import('/src/engine/actor/npcs.ts')
        const g = W.world.grid
        if (!g || g.chunkIndexAt(x, z) < 0 || g.isBlocked(x, z)) return false
        return !n.npcActors.list.some((a) => a.visible && Math.floor(a.x) === x && Math.floor(a.z) === z)
      }, [nx + dx, nz + dz])
      if (!free) continue
      await standFacing(nx + dx, nz + dz, key)
      await tap('Space', 300)
      const opened = await until(async () => { const a = await now(); return a.talk || a.script === '1' || a.scene === 'battle' }, 2500, 100)
      if (opened) return { side: key, from: [nx + dx, nz + dz], texts: await talkThrough(quietMs) }
    }
    return null
  }
  const mapIs = async (m) => (await now()).map === m
  const waitMap = (m, ms = 60_000) => until(async () => { const a = await now(); return a.map === m && a.scene === 'overworld' ? a : false }, ms, 250)
  /** 문 앞 칸(`front`)에서 `key`를 쥐어 문으로 들어간다. 맵이 바뀌면 그 맵의 `now()`를 돌려준다 */
  const enterDoor = async (front, key, wantMap) => {
    await standAt(front[0], front[1])
    await page.keyboard.down(key)
    const t0 = Date.now()
    let at = null
    while (Date.now() - t0 < 8000) {
      at = await now()
      if (at.map === wantMap) break
      await sleep(60)
    }
    await page.keyboard.up(key)
    return at?.map === wantMap ? await waitMap(wantMap, 60_000) : null
  }

  // ── cresselia: 선원의 집 소년 → 보름달섬 크레세리아 → 달의날개 → 소년 → 항구 여관 → 신월섬 → 다크라이 ──
  await runCase('cresselia', async () => {
    const V = [16646, 16632, 16472, 16451]
    const F = [300, 307, 287, 344, 576, 577, 591, 1106, 316]
    const I = [453, 454]
    const P = () => probe(V, F, I)
    // 계측 확인 — 시작은 이 값들이 전부 비어 있다
    const p00 = await P()
    check('출발 — 소년 상태 0 · 달의날개 0 · 300 꺼짐 (읽기)', p00.vars[16646] === 0 && p00.items[453] === 0 && p00.flags[300] === false, p00)

    // ⓪ 음성 — 회원 카드 · 배포 표식이 없으면 신월섬 숲의 다크라이는 숨는다
    await warp('siwon', 321, 16, 20, Math.PI, { postGame: true, nationalDex: true })
    await clear(10)
    const hiddenDarkrai = !(await hasNpcAt(16, 13))
    const pNeg = await P()
    check('⓪ 음성 — 회원카드 · 표식 없이 신월섬 숲 → 다크라이 숨김(576 켜짐 · (16,13)에 사람 없음)', hiddenDarkrai && pNeg.flags[576] === true, { npc13: !hiddenDarkrai, hide576: pNeg.flags[576] })

    // ① 선원의 집 — 들어서면 16646 0→1, 소년은 침대(8,6)
    await warp('siwon', 44, 4, 7, Math.PI, { postGame: true, nationalDex: true })
    await clear(10)
    const p1 = await P()
    check('① 선원의 집 들어서면 소년 상태 0→1 (OnTransition)', p00.vars[16646] === 0 && p1.vars[16646] === 1, { before: p00.vars[16646], after: p1.vars[16646] })
    check('① 소년이 침대 (8,6)에 서 있다', await hasNpcAt(8, 6), await visibleNpcs())
    // 음성: 크레세리아를 만나기 전에 말을 걸면 「잠꼬대」만 — 300 안 선다
    let talk = await talkNpcAt(8, 6)
    check('① 소년에게 처음 말 걸기 — 대사가 열린다 · 307 켜짐 · 상태 2', talk !== null && (await P()).flags[307] === true && (await P()).vars[16646] === 2, { talk: talk?.side, state: (await P()).vars[16646], f307: (await P()).flags[307] })
    talk = await talkNpcAt(8, 6)
    const pAgain = await P()
    check('① 음성 — 달의날개 없이 다시 말 걸기 → 300 안 섬 · 상태 2 그대로', pAgain.flags[300] === false && pAgain.vars[16646] === 2, { f300: pAgain.flags[300], state: pAgain.vars[16646] })

    // ② 보름달섬 숲 — 크레세리아 (16,15) 곁에서 동쪽을 보고 A (지름길: 숨김 해제 · 로밍 상태 0 · MET 꺼짐)
    await setFlags([], [591, 287, 1106])
    await warp('siwon', 261, 15, 15, 0, { postGame: true, nationalDex: true, story: [[16472, 0]] })
    await clear(10)
    check('② 크레세리아가 (16,15)에 서 있다', await hasNpcAt(16, 15), await visibleNpcs())
    await standFacing(15, 15, 'ArrowRight')
    await tap('Space', 300)
    const t2 = await talkThrough(2500)
    const p2 = await P()
    check('② 크레세리아와 마주친 뒤 — 287 켜짐 · 591(숨김) 켜짐 · 로밍 상태 0 (배회 시작)', p2.flags[287] === true && p2.flags[591] === true, { f287: p2.flags[287], f591: p2.flags[591], roamState: p2.vars[16472], textLen: t2.length })
    const wing = await visibleNpcs()
    check('② 달의날개(공)가 (16,15)나 (16,14)에 나타난다', wing.some((n) => (n[0] === 16 && (n[1] === 15 || n[1] === 14))), wing)
    // 공 앞에 서서 A
    const ball = wing.find((n) => n[0] === 16 && (n[1] === 15 || n[1] === 14))
    if (ball) {
      const got = await talkNpcAt(ball[0], ball[1])
      const p2b = await P()
      check('② 달의날개를 줍는다 — 도구 453 0→1 · 1106 켜짐', got !== null && p2.items[453] === 0 && p2b.items[453] === 1 && p2b.flags[1106] === true, { before: p2.items[453], after: p2b.items[453], f1106: p2b.flags[1106] })
    }
    await must('② 달의날개를 들고 있다', (await P()).items[453] === 1, (await P()).items)

    // ③ 다시 소년 — 달의날개를 건네면 300이 서고 상태 3, 달의날개는 사라진다
    await warp('siwon', 44, 4, 7, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
    await clear(10)
    const p3a = await P()
    const boyAtBed = await until(() => hasNpcAt(8, 6), 8000, 200)
    talk = await talkNpcAt(8, 6, 3500)
    const p3 = await P()
    check('③ 소년을 깨운다 — 300 켜짐 · 상태 2→3 · 달의날개 1→0', talk !== null && p3.flags[300] === true && p3a.vars[16646] === 2 && p3.vars[16646] === 3 && p3a.items[453] === 1 && p3.items[453] === 0, { boyAtBed: boyAtBed !== false, npcs: await visibleNpcs(), talked: talk && { side: talk.side, len: talk.texts.length }, f300: [p3a.flags[300], p3.flags[300]], state: [p3a.vars[16646], p3.vars[16646]], wing: [p3a.items[453], p3.items[453]] })
    await must('③ 300이 섰다', p3.flags[300] === true, p3.flags)

    // ④ 운하시티 항구 여관 문 — 음성(300 없이: 문이 굳게 닫혀 있다) → 양성
    await setFlags([], [300])
    await warp('siwon', 33, 58, 715, Math.PI, { postGame: true, nationalDex: true, keepParty: true, items: [[454, 1]], story: [[16451, 0x1209], [16504, 6]] })
    await clear(10)
    const door = [58, 714]
    await tap('ArrowUp', 250, 90)
    await page.keyboard.down('ArrowUp'); await sleep(1500); await page.keyboard.up('ArrowUp')
    await sleep(1500)
    const atNeg = await now()
    check('④ 음성 — 300 없이는 여관 문이 안 열린다 (맵 33 그대로)', atNeg.map === 33, { map: atNeg.map, x: atNeg.x, z: atNeg.z, talk: atNeg.talk })
    await tap('Space', 300); await talkThrough(800)
    // 양성 — 300을 켜고 맵을 다시 읽힌다(운하시티를 떠났다 돌아온다)
    await setFlags([300], [])
    await warp('siwon', 25, 16, 6, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
    await warp('siwon', 33, 58, 716, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
    await clear(10)
    const inn = await enterDoor([58, 714], 'ArrowUp', 43)
    check('④ 300 · 회원카드 · 표식이 서면 여관 문이 열린다 (맵 43)', inn !== null, inn ?? (await now()))
    if (inn === null) await halt('여관 문이 안 열렸다')
    // 여관 장면 — 침대에 눕고 페이드가 이어진 뒤 신월섬(320)으로 워프한다
    const pInn = await P()
    check('④ 여관 들어서면 다크라이 사건 상태 1 (OnTransition)', pInn.vars[16632] === 1 || pInn.vars[16632] === 2, { state: pInn.vars[16632], f577: pInn.flags[577] })
    const sceneT = await talkThrough(500, 120_000)
    const islandAt = await waitMap(320, 90_000)
    if (!islandAt) await halt('신월섬(320)에 안 갔다')
    const pIsl = await P()
    check('④ 신월섬 도착 — 맵 320 · 사건 상태 2 · 316(신월섬 갔다) 켜짐', islandAt.map === 320 && pIsl.vars[16632] === 2 && pIsl.flags[316] === true, { at: [islandAt.x, islandAt.z], state: pIsl.vars[16632], f316: pIsl.flags[316], textLen: sceneT.length })

    // ⑤ 신월섬 — 숲 입구 (137,268)까지 걷는다
    const toForest = await walkTo(137, 268, { label: '신월섬→숲', ms: 120_000 })
    const atForest = await waitMap(321, 60_000)
    check('⑤ 신월섬을 걸어 숲 입구로 든다 (맵 321)', atForest !== null, toForest)
    if (!atForest) await halt(`숲에 못 들었다 ${JSON.stringify(toForest)}`)
    await clear(10)
    check('⑤ 다크라이가 (16,13)에 서 있다 (576 꺼짐)', await hasNpcAt(16, 13), { npcs: await visibleNpcs(), f576: (await P()).flags[576] })
    const toDarkrai = await walkTo(16, 14, { label: '숲→다크라이 앞', ms: 90_000 })
    log('다크라이 앞까지', toDarkrai)
    await faceKey('ArrowUp')
    await tap('Space', 300)
    const foe = await waitBattle(60_000)
    await page.screenshot({ path: `${OUT}/cresselia-darkrai-${String(cur.rep)}.png` })
    check('⑤ 다크라이 배틀이 열린다 — 상대 491 Lv50', foe !== null && foe.foe?.[0] === 491 && foe.foe?.[1] === 50, foe)
  }, Math.max(3, Number(flag('repeat', '2'))))

  // ── shaymin: 오박사 → 석판 → 파도의길 → 꽃의 낙원 → 쉐이미 ───────────────────────────────────
  await runCase('shaymin', async () => {
    const V = [16471, 16452, 16517]
    const F = [301, 291, 593, 594]
    const I = [452]
    const P = () => probe(V, F, I)
    // ⓪ 음성 — 편지 · 표식 없이 꽃의 낙원 → 쉐이미가 숨는다
    await setFlags([], [291])
    await warp('siwon', 274, 911, 205, Math.PI, { postGame: true, nationalDex: true })
    await clear(10)
    const hid = !(await hasNpcAt(911, 203))
    await faceKey('ArrowUp'); await tap('Space', 300); await sleep(1500)
    const pn = await P()
    check('⓪ 음성 — 편지 없이 꽃의 낙원 → 쉐이미 숨김(593) · A로도 배틀 안 열림', hid && pn.flags[593] === true && (await now()).scene !== 'battle', { hidden: hid, f593: pn.flags[593], scene: (await now()).scene })

    // ① 224번도로 오박사 (편지 + 표식 + 쉐이미 사건 1 = 시원이 편지를 건넨 직후와 같다)
    await setFlags([], [301, 594])
    await warp('siwon', 399, 909, 494, Math.PI, { postGame: true, nationalDex: true, items: [[452, 1]], story: [[16452, 0x1112], [16471, 1]] })
    await clear(10)
    const p1 = await P()
    check('① 224번도로 들어서면 쉐이미 사건 1→2 · 경로 상태 1 (OnTransition)', p1.vars[16471] === 2 && p1.vars[16517] === 1, { shayminState: p1.vars[16471], routeState: p1.vars[16517] })
    check('① 오박사가 (909,492)에 서 있다', await hasNpcAt(909, 492), await visibleNpcs())
    await standFacing(909, 493, 'ArrowUp')
    await tap('Space', 300)
    let named = false
    for (let i = 0; i < 80 && !named; i++) {
      const at = await now()
      if (at.menu === 'naming') {
        await page.fill('input', 'SHAYMIN')
        await tap('Enter', 800)
        named = true
      } else if (at.talk || at.script === '1') await tap('Space', 400)
      else await sleep(300)
    }
    check('① 석판 이름 짓기 화면이 열려 적었다', named, named)
    await talkThrough(3000, 120_000)
    const p1b = await P()
    check('① 석판 뒤 — 301(석판에 썼다) 켜짐 · 오박사 숨김(594)', p1b.flags[301] === true, { f301: p1b.flags[301], f594: p1b.flags[594], state: p1b.vars[16471] })
    await must('① 석판 이벤트가 끝났다', p1b.flags[301] === true, p1b.flags)

    // ② 파도의길 — 걸어서 북쪽 꽃의 낙원(911,204)까지
    log('석판 뒤 선 자리', await now())
    const walk = await walkTo(911, 204, { overworld: true, ms: 600_000, label: '파도의길→꽃의 낙원' })
    const here = await now()
    check('② 파도의길을 걸어 꽃의 낙원 앞(911,204)에 닿는다', walk.ok === true, { walk, at: [here.map, here.x, here.z] })
    if (walk.ok !== true) {
      log('걸어서 못 닿았다 — 워프로 꽃의 낙원에 가서 쉐이미 쪽만 잰다', walk)
      await warp('siwon', 274, 911, 205, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
      await clear(10)
    }
    // ③ 꽃의 낙원 — 쉐이미 (911,203)
    const pf = await P()
    check('③ 꽃의 낙원 — 쉐이미가 (911,203)에 서 있다 (593 꺼짐)', await hasNpcAt(911, 203), { npcs: await visibleNpcs(), f593: pf.flags[593] })
    await standFacing(911, 204, 'ArrowUp')
    await tap('Space', 300)
    const foe = await waitBattle(60_000)
    await page.screenshot({ path: `${OUT}/shaymin-battle-${String(cur.rep)}.png` })
    check('③ 쉐이미 배틀이 열린다 — 상대 492 Lv30', foe !== null && foe.foe?.[0] === 492 && foe.foe?.[1] === 30, foe)
    check('④ 그라시데아(신수마을) — 쉐이미를 잡아야 받는 일이라 배틀을 끝내야 한다', null, '미실행 — 범위 밖')
  })

  // ── manaphy: 시원에게 알을 받고 → 걸어서 부화 ─────────────────────────────────────────────────
  await runCase('manaphy', async () => {
    const P = () => probe([], [291], [])
    // 시원의 방 — 알은 시원에게서 키로 받는다. 앞 선물 넷은 이미 준 것으로 둔다(지름길: siwonGiven=4 · 쉐이미 잡음 · 파티 비움)
    await warp('siwon', 25, 16, 6, Math.PI, { postGame: true, nationalDex: true })
    await clear(10)
    await setFlags([291], [])
    await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const st = save.useSaveStore.getState()
      save.useSaveStore.setState({ siwonGiven: 4, party: st.party.slice(0, 1) })
    })
    const b = await P()
    const got = await talkSiwon()
    const a = await P()
    const egg = a.party.at(-1)
    check('알을 받는다 — 시원 대사 gift4 · 파티 +1 · 마나피(490) 알', got.lines.includes('gift4') && a.party.length === b.party.length + 1 && egg?.startsWith('490:') === true && egg.includes('egg'), { lines: got.lines, party: a.party, friendship: a.friend.at(-1) })
    await must('알이 파티에 있다', egg?.includes('egg') === true, a.party)
    const natural = a.friend.at(-1)
    // 지름길 — 남은 부화 주기를 1로 낮춘다(원래 값은 위에 적었다)
    await page.evaluate(async () => {
      const save = await import('/src/state/saveStore.ts')
      const st = save.useSaveStore.getState()
      const party = st.party.map((m, i) => (i === st.party.length - 1 ? { ...m, friendship: 1 } : m))
      save.useSaveStore.setState({ party })
    })
    const low = await P()
    check('(지름길) 알의 남은 주기를 원래 값에서 1로 낮췄다 (읽기로 확인)', natural > 1 && low.friend.at(-1) === 1, { natural, now: low.friend.at(-1) })

    // 열린 마을(축복시티 확인 지점)로 파티를 들고 뛴다 — 걸어서 센다
    await warp('jubilife', null, null, null, 0, { postGame: true, nationalDex: true, keepParty: true })
    await clear(10)
    const start = await now()
    log('걷기 시작', start)
    const eggState = () => page.evaluate(async () => { const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState(); return { daycareCycle: s.daycare.cycle, eggs: s.party.filter((m) => m.isEgg).map((m) => m.friendship), mates: s.party.filter((m) => !m.isEgg).map((m) => m.friendship) } })
    /** 동서로 오가며 걷는다 — 부화 장면이 열리거나 걸음이 cap에 닿을 때까지. 걸음은 칸 바뀜으로 센다 */
    const walkUntilHatch = async (cap, label) => {
      let steps = 0; let lastTile = ''; let dir = 'ArrowRight'; let nextLog = 100
      const t0 = Date.now()
      const hatchedNow = () => page.evaluate(async () => (await import('/src/state/hatchStore.ts')).useHatchStore.getState().slot >= 0)
      while (steps < cap && Date.now() - t0 < 300_000) {
        await page.keyboard.down(dir)
        let still = 0
        for (let i = 0; i < 400 && still < 8 && steps < cap; i++) {
          await sleep(40)
          const d = await page.evaluate(() => ({ tile: document.documentElement.dataset.tile, scene: document.documentElement.dataset.scene }))
          if (await hatchedNow()) { await page.keyboard.up(dir); return { hatched: true, steps } }
          if (d.scene === 'battle') { await page.keyboard.up(dir); await halt('걷다가 야생 배틀이 열렸다 (열린 마을이 아니다)') }
          if (d.tile !== lastTile) { steps++; still = 0; lastTile = d.tile } else still++
          if (steps >= nextLog) { nextLog += 100; log(`${label} 걸음 ${String(steps)}`, await eggState()) }
        }
        await page.keyboard.up(dir)
        dir = dir === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'
      }
      return { hatched: await hatchedNow(), steps }
    }
    // 가-0. 결정적 계측 — 제품이 export하는 걸음 함수(`step`)에 알과 일반 마리를 넣고, 동전을 항상 「오른다」로 고정해 친밀도 걸음 경계(127→0)를 한 번 밟는다.
    // 원작은 알(SPECIES_EGG)을 걷기 친밀도에서 뺀다(`Pokemon_UpdateFriendship` 첫머리). 일반 마리는 +1이 되어야 읽기가 살아 있음을 보인다
    const stepProbe = await page.evaluate(async () => {
      const { step } = await import('/src/engine/actor/steps.ts')
      const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
      const egg = { ...s.party.find((m) => m.isEgg), friendship: 1 }
      const mate = { ...s.party.find((m) => !m.isEgg), friendship: 70 }
      const r = step({ party: [egg, mate], label: 0, poisonSteps: 0, repelSteps: 0, friendshipSteps: 127, soothing: () => false, coin: () => false })
      return { egg: [egg.friendship, r.party[0].friendship], mate: [mate.friendship, r.party[1].friendship] }
    })
    check('가-0. 걷기 친밀도(128걸음마다) — 일반 마리는 오르고(읽기 확인) 알의 남은 주기는 안 오른다', stepProbe.mate[1] > stepProbe.mate[0] && stepProbe.egg[1] === stepProbe.egg[0], stepProbe)
    // 가. 자연 그대로 — 남은 주기 1이면 두 주기(510걸음) 안에 깨야 한다 (원작은 알의 친밀도 칸을 걸음 친밀도가 안 건드린다)
    const natural1 = await walkUntilHatch(520, '자연')
    const afterNatural = await eggState()
    // 자연 걷기는 동전(50%)이 섞여 판마다 갈린다 — 기록만 하고 판정은 위의 결정적 검사가 한다
    log('가. 자연 걷기 결과 (판정 아님 · 동전이 섞여 갈린다)', { hatched: natural1.hatched, steps: natural1.steps, state: afterNatural })
    let hatched = natural1.hatched
    if (!hatched) {
      // 나. 지름길 — 주기 카운터를 문턱 직전(254)으로 올리고 남은 주기를 다시 1로 둔다 → 한 걸음이 곧 부화 판정이다
      await page.evaluate(async () => {
        const save = await import('/src/state/saveStore.ts')
        const st = save.useSaveStore.getState()
        save.useSaveStore.setState({
          daycare: { ...st.daycare, cycle: 254 },
          party: st.party.map((m) => (m.isEgg ? { ...m, friendship: 1 } : m)),
        })
      })
      log('(지름길) 주기 카운터 254 · 알 1로 되돌렸다', await eggState())
      const forced = await walkUntilHatch(40, '지름길')
      check('나. (지름길 뒤) 부화 장면이 열린다', forced.hatched, { steps: forced.steps, state: await eggState() })
      hatched = forced.hatched
    }
    if (!hatched) await halt('알이 안 깼다')
    // 부화 장면을 민다 — 별명 물음은 「아니오」
    for (let i = 0; i < 200; i++) {
      const open = await page.evaluate(async () => (await import('/src/state/hatchStore.ts')).useHatchStore.getState().slot >= 0)
      if (!open) break
      if ((await page.locator('[role="radiogroup"]').count()) > 0) { await tap('ArrowDown', 120); await tap('Space', 400) } else await tap('Space', 350)
    }
    await sleep(1500)
    const done = await P()
    const mon = done.party.at(-1)
    await page.screenshot({ path: `${OUT}/manaphy-hatched-${String(cur.rep)}.png` })
    check('부화 뒤 — 마나피(490) · 알 아님', mon?.startsWith('490:') === true && !mon.includes('egg'), { party: done.party, friendship: done.friend.at(-1) })
  })

  // ── arceus: 하늘빛 피리 → 창기둥 → 시작의 방 → 아르세우스 ─────────────────────────────────────
  await runCase('arceus', async () => {
    const V = [16664, 16453, 16470]
    const F = [286, 2404]
    const I = [455]
    const P = () => probe(V, F, I)
    const p00 = await P()
    check('출발 — 시작의 방 변수 0 · 피리 0 (읽기)', p00.vars[16664] === 0 && p00.items[455] === 0, p00)
    // ⓪ 음성 — 피리 없이(배포 표식은 있다) 창기둥에 들어선다 → 16664=0
    await setFlags([], [286])
    await warp('siwon', 220, 31, 51, Math.PI, { postGame: true, nationalDex: true, story: [[16453, 0x1123]] })
    await clear(10)
    const p0 = await P()
    check('⓪ 피리 없이 창기둥 입장 → 시작의 방 변수 0', p0.vars[16664] === 0, p0.vars)
    // 서 있는 채로 피리를 손에 넣는다 (지름길: 시원이 건네는 것과 같은 가방 넣기)
    await giveItems([[455, 1]])
    const p0b = await P()
    check('(지름길) 서 있는 채로 피리를 가방에 넣었다 (읽기: 0→1) · 변수는 그대로 0', p00.items[455] === 0 && p0b.items[455] === 1 && p0b.vars[16664] === 0, { flute: [p00.items[455], p0b.items[455]], var: p0b.vars[16664] })
    // (31,51)에서 ↓ 한 걸음 → (31,52) 좌표 사건: 변수가 0이면 아무 일도 없다
    await standFacing(31, 51, 'ArrowDown')
    await runKeys('ArrowDown', '31,52', 1)      // 딱 한 칸 — 더 가면 (31,53) 문으로 나간다
    await sleep(2500)
    const neg = await now()
    const pn = await P()
    check('⓪ 음성 — 피리를 든 채 서 있다가 (31,52)를 밟아도 아무 일 없다 (맵 220 · 대사 없음 · 변수 0)', neg.map === 220 && !neg.talk && neg.script !== '1' && pn.vars[16664] === 0, { map: neg.map, at: [neg.x, neg.z], talk: neg.talk, var: pn.vars[16664] })

    // ① 양성 — 다른 맵으로 나갔다가 피리를 든 채 다시 들어선다 → 16664=1
    await warp('siwon', 25, 16, 6, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
    await warp('siwon', 220, 31, 51, Math.PI, { postGame: true, nationalDex: true, keepParty: true })
    await clear(10)
    const p1 = await P()
    check('① 피리를 든 채 다시 들어서면 시작의 방 변수 0→1', p0.vars[16664] === 0 && p1.vars[16664] === 1, { before: p0.vars[16664], after: p1.vars[16664] })
    await must('① 변수 1', p1.vars[16664] === 1, p1.vars)
    // (31,52)에 서서 가방에서 피리를 쓴다
    await standAt(31, 52)
    const used = await useKeyItem(455)
    check('① 가방에서 피리를 쓴다 — 쓰는 길이 열렸다', used.ok, used)
    const talked = await talkThrough(2500, 150_000)
    const hall = await waitMap(510, 90_000)
    check('① 피리 → 시작의 방 (맵 510)', hall !== null, hall ?? await now())
    if (!hall) await halt('시작의 방에 안 갔다')
    log('시작의 방 도착', hall)
    await clear(10)
    // 좌표 사건 (30..32,35) — 북쪽(아르세우스 쪽)으로 걸어 올라가 닿게 한다
    const walk = await walkTo(31, 34, { label: '시작의 방→좌표 사건', ms: 120_000 })
    log('걸은 결과', walk)
    const foe = await waitBattle(90_000)
    await page.screenshot({ path: `${OUT}/arceus-battle-${String(cur.rep)}.png` })
    const pe = await P()
    check('① 아르세우스 배틀이 열린다 — 상대 493 Lv80', foe !== null && foe.foe?.[0] === 493 && foe.foe?.[1] === 80, foe)
    check('① 좌표 사건이 변수를 0으로 내려놓았다', pe.vars[16664] === 0, pe.vars)
  })

  const nearNpc = async (x, z, r = 3, gfx = null) => (await visibleNpcs()).find((n) => Math.abs(n[0] - x) <= r && Math.abs(n[1] - z) <= r && (gfx === null || n[2] === gfx)) ?? null
  // ── zones: 서바이벌에리어 · 리조트에리어 ─────────────────────────────────────────────────────
  await runCase('zones', async () => {
    // 서바이벌에리어 (450) — 확인 지점 자기 자리에 선다 (원작 NPC: 폐허광 (659,350) · 배틀걸 (652,341) · 꼬마 (667,338) · 카메라맨 (651,348))
    await warp('survival', null, null, null, 0, { postGame: true, nationalDex: true })
    await clear(10)
    const at0 = await now()
    check('서바이벌 — 맵 450에 선다', at0.map === 450, at0)
    const npcs = await visibleNpcs()
    const want = { 폐허광: [659, 350, 50], 배틀걸: [652, 341, 7], 꼬마: [667, 338, 4], 카메라맨: [651, 348, 23] }
    // 떠도는 사람은 원래 자리에서 여덟 칸 안에 같은 그림(gfx)으로 있으면 선 것으로 친다 (배치표의 이동 유형이 배회). gfx는 첫 실측에서 읽은 값을 못박은 것이다
    const found = {}
    for (const [name, [x, z, gfx]] of Object.entries(want)) { found[name] = await nearNpc(x, z, 8, gfx); check(`서바이벌 — ${name}이(가) (${String(x)},${String(z)}) 근처에 서 있다`, found[name] !== null, found[name] ?? npcs) }
    const pv = await probe([], [555, 473, 214], [])
    log('서바이벌 — 벅 · 라이벌의 숨김 플래그(555 · 473)와 플루토 체포(214) — 이야기 쪽 조건이라 판정하지 않고 적기만 한다', pv.flags)
    // 말 걸기 — 걷는 사람이라 한 명이 안 열리면 다음 사람으로 (배틀걸 · 꼬마 · 폐허광 · 카메라맨)
    let girl = null; let whoS = null
    for (const name of ['배틀걸', '꼬마', '폐허광', '카메라맨']) {
      const c0 = await nearNpc(found[name]?.[0] ?? 0, found[name]?.[1] ?? 0, 2, want[name][2])
      if (!c0) continue
      girl = await talkNpcAt(c0[0], c0[1])
      if (girl) { whoS = name; break }
    }
    check('서바이벌 — 누군가에게 말을 걸면 대사가 열린다', girl !== null && girl.texts.length > 0, girl && { who: whoS, side: girl.side, len: girl.texts.length })
    // 포켓몬센터 문 (659,338) — 한 칸 아래에서 북쪽으로
    const pc = await enterDoor([659, 339], 'ArrowUp', 452)
    check('서바이벌 — 포켓몬센터 문으로 들어간다 (맵 452)', pc !== null, pc ?? (await now()))
    await page.screenshot({ path: `${OUT}/zones-survival-${String(cur.rep)}.png` })

    // 리조트에리어 (457)
    await warp('resort', null, null, null, 0, { postGame: true, nationalDex: true })
    await clear(10)
    const r0 = await now()
    check('리조트 — 맵 457에 선다', r0.map === 457, r0)
    const rn = await visibleNpcs()
    const wantR = { 미녀1: [806, 458, 13], 미녀2: [822, 459, 13], 검은띠: [809, 477, 51], 에이스트레이너: [806, 471, 14], 수영맨: [816, 455, 93] }
    const foundR = {}
    for (const [name, [x, z, gfx]] of Object.entries(wantR)) { foundR[name] = await nearNpc(x, z, 8, gfx); check(`리조트 — ${name}이(가) (${String(x)},${String(z)}) 근처에 서 있다`, foundR[name] !== null, foundR[name] ?? rn) }
    // 말 걸기 — 한 명이 안 열리면(걷는 중이거나 옆 칸이 막혔으면) 다음 사람으로
    let beauty = null; let who = null
    for (const name of ['미녀1', '미녀2', '에이스트레이너', '수영맨', '검은띠']) {
      const cur0 = await nearNpc(foundR[name]?.[0] ?? 0, foundR[name]?.[1] ?? 0, 2)
      if (!cur0) continue
      beauty = await talkNpcAt(cur0[0], cur0[1])
      if (beauty) { who = name; break }
    }
    check('리조트 — 누군가에게 말을 걸면 대사가 열린다', beauty !== null && beauty.texts.length > 0, beauty && { who, side: beauty.side, len: beauty.texts.length })
    // 별장 문 (822,469) — 한 칸 아래에서 북쪽으로. 맵 464
    const villa = await enterDoor([822, 470], 'ArrowUp', 464)
    check('리조트 — 별장 문으로 들어간다 (맵 464)', villa !== null, villa ?? (await now()))
    await page.screenshot({ path: `${OUT}/zones-resort-${String(cur.rep)}.png` })
  })

  // ── factory: 프런티어의 막힌 문 · 팩토리 입장 → 접수 → 빌리기 → 첫 배틀 ─────────────────────────
  await runCase('factory', async () => {
    const readGate = () => page.evaluate(() => ({ map: Number(document.documentElement.dataset.map), talk: document.documentElement.dataset.talk === '1', text: /(배틀\S+?)[은는] 아직 준비 중/.exec(document.body.innerText)?.[1] ?? null }))
    // 배틀타워 문 (48,17) — 아래 칸 (48,18)에서 북쪽으로. 막히고 안내가 뜬다
    await warp('frontier', 559, 48, 18, Math.PI, { postGame: true, nationalDex: true })
    await clear(5)
    await page.keyboard.down('ArrowUp'); await sleep(900); await page.keyboard.up('ArrowUp')
    const gate = await until(async () => { const g = await readGate(); return g.talk && g.text !== null ? g : false }, 5000, 150)
    const gateNow = await readGate()
    check('배틀타워 문 — 안 열리고(맵 559) 「아직 준비 중」 안내가 뜬다', gateNow.map === 559 && gate !== false && gateNow.text === '배틀타워', gateNow)
    await talkThrough(800)
    // 팩토리 문 (77,34) — 서쪽 칸 (76,34)에서 동쪽으로
    await warp('frontier', 559, 76, 34, Math.PI / 2, { postGame: true, nationalDex: true })
    await clear(5)
    await page.keyboard.down('ArrowRight')
    const inside = await until(async () => (await now()).map === 562, 8000, 80)
    await page.keyboard.up('ArrowRight')
    check('팩토리 문 — 들어가진다 (맵 562)', inside !== false, await now())
    if (inside === false) await halt('팩토리에 못 들었다')
    await waitMap(562, 60_000)
    await clear(5)
    // 접수원 (21,6) — 한 칸 아래 (21,7)에서 북쪽을 보고
    await standFacing(21, 7, 'ArrowUp')
    const FS = () => page.evaluate(async () => {
      const fs = await import('/src/state/factoryStore.ts')
      const d = document.documentElement.dataset
      const st = fs.useFactoryStore.getState()
      return { phase: st.phase, scene: d.scene ?? null, talk: d.talk === '1', stage: d.frontierStage === '1', battle: st.round?.battle ?? null, map: Number(d.map) }
    })
    check('팩토리 안 — 시작 때 상태는 대여 전(phase !== rental)', (await FS()).phase !== 'rental', await FS())
    // 접수원 대화 — 「싱글 · 레벨50」은 첫 칸이라 Z/Space로 밀면 된다 (`_factory.mjs`와 같은 길). 빌리는 화면(phase rental)까지
    let reached = false
    for (let i = 0; i < 400 && !reached; i++) {
      const s = await FS()
      if (s.phase === 'rental') { reached = true; break }
      await tap('KeyZ', 150, 90)
    }
    const s1 = await FS()
    check('접수 → 싱글 → 빌리는 화면이 뜬다 (phase rental)', reached, s1)
    if (!reached) await halt('빌리는 화면까지 못 갔다')
    await page.screenshot({ path: `${OUT}/factory-rental-${String(cur.rep)}.png` })
    // 위에서 셋을 빌린다 → 「예」
    for (let i = 0; i < 3; i++) {
      await tap('KeyZ', 150, 90); await sleep(150)
      await tap('KeyZ', 150, 90); await sleep(150)
      if (i < 2) await tap('ArrowDown', 120)
    }
    await tap('KeyZ', 200, 90)
    const toScene = await until(async () => (await FS()).phase === 'scene', 15_000, 200)
    check('셋을 빌리면 장면으로 간다 (phase scene)', toScene !== false, await FS())
    // 장면 → 첫 배틀이 열린다
    let battle = false
    for (let i = 0; i < 600 && !battle; i++) {
      const s = await FS()
      if (s.scene === 'battle') { battle = true; break }
      await tap('KeyZ', 150, 90)
    }
    const foe = battle ? await until(async () => (await foeNow()).foe !== null, 30_000, 250).then(() => foeNow()) : null
    await page.screenshot({ path: `${OUT}/factory-battle-${String(cur.rep)}.png` })
    check('첫 배틀이 열린다 (scene battle · 상대가 읽힌다)', battle && foe?.foe !== null, { battle, foe })
  })

  // ── stark: 배틀그라운드 벅 → 하드마운틴 방3 → 히드런 ─────────────────────────────────────────
  await runCase('stark', async () => {
    const V = [16542]
    const F = [293, 231, 470, 214, 477, 288]
    const P = () => probe(V, F, [])
    // 방3 입장 조건 중 이야기 쪽은 플루토 체포 장면이 세운다 (`charon` 케이스가 그 장면을 잰다): 214 · 상태 1 · 벅 숨김 해제(470)
    await setFlags([214, 475, 476, 478, 560, 561, 562, 563], [293, 231, 470, 288, 477])
    // ⓪ 음성 — 벅과 말하기 전(293 꺼짐)에는 히드런이 안 선다
    await warp('siwon', 265, 7, 16, Math.PI, { postGame: true, nationalDex: true, story: [[16542, 1]] })
    await clear(10)
    const pn = await P()
    check('⓪ 음성 — 벅과 말 안 했다 → 히드런 숨김(477 켜짐 · (7,6)에 사람 없음)', pn.flags[293] === false && pn.flags[477] === true && !(await hasNpcAt(7, 6)), { talked293: pn.flags[293], hide477: pn.flags[477], npc: await hasNpcAt(7, 6) })

    // ① 배틀그라운드 — 벅 (11,8)에게 말을 건다
    await setFlags([214, 475, 476, 478, 560, 561, 562, 563], [470, 231])
    await warp('siwon', 454, 7, 10, 0, { postGame: true, nationalDex: true, keepParty: true, story: [[16542, 1]] })
    await clear(10)
    const npcs = await visibleNpcs()
    log('배틀그라운드 사람', npcs)
    const buckHere = npcs.some((n) => n[0] === 11 && n[1] === 8)
    check('① 벅이 (11,8)에 서 있다 (470 꺼짐 — 오늘의 넷째로 뽑혔을 때만 선다)', buckHere, { npcs, f470: (await P()).flags[470] })
    if (!buckHere) {
      check('① 벅이 오늘의 넷째가 아니라 안 섰다 — 뽑기는 날마다 임의(GetRandomBattlegroundTrainers)라 이 회차는 관측 불가', null, npcs)
      await halt('벅이 안 섰다 (임의 뽑기)')
    }
    const talk = await talkNpcAt(11, 8, 3000)
    const p1 = await P()
    check('① 벅에게 말 걸기 — 293(말했다) 켜짐 · 231(퇴장) 켜짐 · 벅이 사라진다', talk !== null && p1.flags[293] === true && p1.flags[231] === true && !(await hasNpcAt(11, 8)), { f293: [pn.flags[293], p1.flags[293]], f231: p1.flags[231], gone: !(await hasNpcAt(11, 8)) })
    await must('① 293이 섰다', p1.flags[293] === true, p1.flags)

    // ② 하드마운틴 방3 — 이제 히드런 (7,6)이 선다. 입구 (7,16)에서 걸어 올라가 A
    await warp('siwon', 265, 7, 16, Math.PI, { postGame: true, nationalDex: true, keepParty: true, story: [[16542, 1]] })
    await clear(10)
    const p2 = await P()
    check('② 방3 — 히드런이 (7,6)에 서 있다 (477 꺼짐)', (await hasNpcAt(7, 6)) && p2.flags[477] === false, { npc: await hasNpcAt(7, 6), hide477: p2.flags[477] })
    const walk = await walkTo(7, 7, { label: '방3 입구→히드런 앞', ms: 90_000 })
    log('걸은 결과', walk)
    await faceKey('ArrowUp')
    await tap('Space', 300)
    const foe = await waitBattle(60_000)
    await page.screenshot({ path: `${OUT}/stark-heatran-${String(cur.rep)}.png` })
    const p3 = await P()
    check('② 히드런 배틀이 열린다 — 상대 485 Lv50 · 상태 1→2', foe !== null && foe.foe?.[0] === 485 && foe.foe?.[1] === 50 && p3.vars[16542] === 2, { foe, state: [p2.vars[16542], p3.vars[16542]] })
  })
  globalThis.__pg42summary = () => {
    if (summary.length === 0) return
    console.log('\n  ══ 요약 (같은 케이스를 연달아 통과해야 PASS)')
    for (const c of summary) {
      const passes = c.runs.filter((r) => r.pass).length
      const verdictText = passes === c.runs.length ? 'PASS' : passes === 0 ? 'FAIL' : 'FLAKY'
      console.log(`  ${c.name}: ${verdictText} (${String(passes)}/${String(c.runs.length)}회)`)
      c.runs.forEach((r, i) => console.log(`     회차 ${String(i + 1)}: ${r.pass ? '통과' : '실패'} · 검사 ${String(r.n)}${r.fail.length ? ` · 실패 ${r.fail.join(' / ')}` : ''}${r.blind.length ? ` · 관측 불가 ${r.blind.join(' / ')}` : ''}${r.stopped ? ` · 섰다 ${r.stopped}` : ''}`))
    }
  }

  // NEWCASES-END
} catch (e) {
  console.error(`  터졌다 — ${String(e?.stack ?? e).slice(0, 700)}`)
  await page.screenshot({ path: `${OUT}/crash.png` }).catch(() => {})
  console.error(`  그때 — ${page.url()} ${JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset })).catch(() => null))}`)
} finally {
  // PG42-SUMMARY
  try { printSummary() } catch {}
  await browser.close()
  vite.child.kill()
}
