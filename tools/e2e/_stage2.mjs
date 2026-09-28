// 진단 — **2단계에서 붙인 것을 게임 안에서 한 번에 걸어 잰다** (COMPLETION_20260928 2단계 · 판정이 아니라 진단이다)
//
//     node tools/e2e/_stage2.mjs [--case=scent,teleport,dig,milk,rope,elevator,cycle,shelf,daycare] [--headed]
//
//   scent     201번도로 풀숲 — 파티 화면 → 달콤한향기 → 컷인 → 분홍이 차고 → 야생이 열리나
//   teleport  201번도로 — 순간이동 → 빙글 돌며 검게 덮이고 → 부활 자리의 공중날기 칸에 남쪽을 보고 서나
//   dig       무쇠 관문 — 구멍파기 → 하얗게 덮이고 굴 입구에 서나
//   milk      우유마시기 — 최대 체력 ÷ 5가 한 마리에서 다른 마리로 옮겨 가나 · 글이 뜨나
//   rope      동굴탈출로프 — 가방이 쓰는 그 함수로 건다. 빙글 워프로 굴 입구에 서나
//   elevator  무쇠 백화점 승강기 — 층을 고르면 불빛이 네 바퀴(124프레임) 돌고 「띵동」 뒤 문이 열리나
//   cycle     자전거로드 — 북문에서 들어서면 곡이 1189가 되고, 손을 떼면 남쪽으로 저절로 내려가나
//   shelf     주인공 집 — 책장 · 벽 지도에 A를 누르면 원작 글과 타운맵이 뜨나
//   daycare   키우미집 — 할머니가 파티 화면을 키우미집 갈래로 열고, 고른 자리를 맡기나
//
// ⚠️ **조건은 개발 모듈로 세운다** — 파티의 기술 · 부활 자리 · 굴 입구 · 자전거. 고르는 것은 화면과 키다.
// 읽는 것은 제품이 내보내는 값뿐이다(`screenTint` · `cameraDolly` · `screenFade` · 세이브 · 곡 가로채기)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const CASES = flag('case', 'scent,teleport,dig,milk,rope,elevator,cycle,shelf,daycare').split(',')
const OUT = resolve(ROOT, 'shots/stage2')
mkdirSync(OUT, { recursive: true })

const vite = await startVite(await freePort(), 'node_modules/.vite-pg')
const browser = await chromium.launch({ args: gpuArgs('gl'), headless: !args.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })
page.on('console', (m) => { if (m.type() === 'error') console.error(`  console ${m.text().slice(0, 200)}`) })
const results = []
const log = (what, v) => { console.log(`  ${what} — ${typeof v === 'string' ? v : JSON.stringify(v)}`) }
const verdict = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name} — ${JSON.stringify(detail)}`) }
const tap = async (key, ms = 150, hold = 70) => {
  await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(ms)
}
const now = () => page.evaluate(async () => {
  const w = (await import('/src/engine/map/world.ts')).world
  const st = (await import('/src/state/worldState.ts')).worldState
  const f = await import('/src/engine/script/field.ts')
  return {
    // 스크립트가 띄운 고르기 창 (`ShowMenu` · 예/아니오) — 화면 쌓기(`data-menu`)와 따로 산다
    choice: f.fieldScripts.world?.menu != null,
    map: Number(document.documentElement.dataset.map ?? -1), wm: w.mapId,
    x: Math.floor(st.player.position.x), z: Math.floor(st.player.position.z), facing: +st.player.facing.toFixed(3),
    menu: document.documentElement.dataset.menu, talk: document.documentElement.dataset.talk === '1',
    script: document.documentElement.dataset.script,
  }
})
const warp = async (base, map, x, z, facing, extra = {}) => {
  await page.evaluate(async ([b, m, tx, tz, f, e]) => {
    const { CHECKPOINTS } = await import('/src/engine/dev/checkpoints.ts')
    const { warpTo } = await import('/src/app/devWarp.ts')
    const cp = CHECKPOINTS.find((c) => c.id === b)
    await warpTo({
      ...cp, id: `s2>${String(m)}`, map: m, spot: tx !== null ? { kind: 'tile', x: tx, z: tz, facing: f } : cp.map === m ? cp.spot : { kind: 'atWarp', index: 0 },
      story: [...(cp.story ?? []), ...(e.story ?? [])], items: [...(cp.items ?? []), ...(e.items ?? [])],
      ...(e.hour === undefined ? {} : { hour: e.hour }),
    })
  }, [base, map, x, z, facing, extra])
  await page.waitForFunction((m) => document.documentElement.dataset.map === String(m)
    && document.documentElement.dataset.restoring === undefined, map, { timeout: 120_000 })
  await page.waitForTimeout(5000)
}
const enterPlay = async () => {
  await page.goto(vite.url, { waitUntil: 'load', timeout: 600_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 600_000 })
  await page.keyboard.press('Backquote')
  await page.getByText('확인 지점').first().waitFor({ timeout: 30_000 })
  const row = page.locator('[data-checkpoint="siwon"]').first()
  await row.hover(); await page.waitForTimeout(150); await row.click()
  const went = await page.waitForURL('**/play', { timeout: 20_000 }).then(() => true, () => false)
  if (!went) { await row.hover(); await page.waitForTimeout(300); await page.keyboard.press('KeyZ') }
  await page.waitForURL('**/play', { timeout: 400_000 })
  await page.waitForFunction(() => document.documentElement.dataset.map !== undefined
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  // ⚠️ **마우스를 치운다.** 카드·목록 줄은 마우스가 올라오면 커서를 옮긴다(`onPointerEnter`) — 확인 지점을 누른 자리에
  // 그대로 두면 파티 화면이 열리는 순간 그 밑의 카드로 커서가 간다
  await page.mouse.move(2, 2)
  await page.waitForTimeout(3000)
}
const clear = async (n = 40) => {
  for (let i = 0; i < n; i++) {
    const at = await now()
    if (!at.talk && at.menu === undefined && at.script !== '1') { await page.waitForTimeout(300); if (!(await now()).talk) return }
    await tap('Space', 350)
  }
}
/** 파티 첫 자리에 기술을 넣는다 — 기술 창 맨 위(요약 다음)에 그 기술이 뜬다 */
const teach = (move, slot = 0) => page.evaluate(async ([mv, s]) => {
  const save = (await import('/src/state/saveStore.ts')).useSaveStore
  const party = [...save.getState().party]
  const mon = party[s]
  party[s] = { ...mon, moves: [{ move: mv, pp: 10, ppUps: 0 }, ...mon.moves.filter((m) => m.move !== mv).slice(0, 3)] }
  save.setState({ party })
  return party.map((p) => p.species)
}, [move, slot])
/** 파티 화면을 연다 — 시작 메뉴를 거치는 길은 이 진단의 대상이 아니다 */
const openParty = async () => {
  await page.evaluate(async () => { (await import('/src/state/menuStore.ts')).useMenuStore.getState().open('party') })
  await page.waitForTimeout(1200)
}
/** 파티 첫 자리의 갈래 메뉴에서 둘째 줄(요약 다음 = 넣은 기술)을 고른다 */
const pickFirstMove = async () => {
  await tap('KeyZ', 500)
  await tap('ArrowDown', 300)
  await tap('KeyZ', 300)
}
/** 필드 과제가 끝날 때까지 값을 뜬다 */
const sample = (ms) => page.evaluate(async (limit) => {
  const fade = await import('/src/engine/script/fade.ts')
  const cam = await import('/src/engine/actor/camera.ts')
  const task = await import('/src/scene/fieldMoveTask.ts')
  const battle = (await import('/src/state/battleStore.ts')).useBattleStore
  const st = (await import('/src/state/worldState.ts')).worldState
  const out = { tintMax: 0, dollyMin: 1, fadeColors: [], busyMs: 0, battleAt: null, facings: new Set(), maps: new Set() }
  const t0 = performance.now()
  let busySeen = false
  while (performance.now() - t0 < limit) {
    await new Promise((r) => requestAnimationFrame(r))
    out.tintMax = Math.max(out.tintMax, fade.screenTint.alpha)
    out.dollyMin = Math.min(out.dollyMin, cam.cameraDolly.warp)
    const c = fade.screenFade.now?.color
    if (c && !out.fadeColors.includes(c)) out.fadeColors.push(c)
    out.facings.add(+st.player.facing.toFixed(2))
    out.maps.add(Number(document.documentElement.dataset.map ?? -1))
    if (task.fieldMoveTaskBusy()) { busySeen = true; out.busyMs = performance.now() - t0 }
    if (battle.getState().phase !== 'off' && out.battleAt === null) out.battleAt = Math.round(performance.now() - t0)
    // 과제가 끝났고 — 배틀이 열렸거나, 1.5초 더 기다려도 아무 일이 없다
    if (busySeen && !task.fieldMoveTaskBusy() && (out.battleAt !== null || performance.now() - t0 - out.busyMs > 1500)) break
  }
  return { ...out, busyMs: Math.round(out.busyMs), facings: [...out.facings].length, maps: [...out.maps] }
}, ms)
const flee = async () => {
  for (let i = 0; i < 90; i++) {
    const phase = await page.evaluate(async () => (await import('/src/state/battleStore.ts')).useBattleStore.getState().phase)
    if (phase === 'off') return true
    await page.evaluate(async () => {
      const b = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
      if (b.phase === 'running' && typeof b.flee === 'function') b.flee()
    }).catch(() => {})
    await tap('Space', 700)
  }
  return false
}

try {
  await enterPlay()

  if (CASES.includes('scent')) {
    await warp('grass', 342, null, null, 0)
    const party = await teach(230)
    log('파티', party)
    await openParty()
    await pickFirstMove()
    const got = await sample(20_000)
    log('달콤한향기', got)
    await page.screenshot({ path: resolve(OUT, 'scent.png') })
    verdict('달콤한향기 — 분홍 10/16 · 야생', Math.abs(got.tintMax - 10 / 16) < 1e-6 && got.battleAt !== null, got)
    await flee()
    await page.waitForTimeout(2000)
  }

  if (CASES.includes('teleport')) {
    await warp('grass', 342, null, null, 0)
    const spot = await page.evaluate(async () => {
      const save = (await import('/src/state/saveStore.ts')).useSaveStore
      save.getState().setHealSpot(0)
      const { spawnWarp } = await import('/src/engine/map/spawns.ts')
      return spawnWarp(0, 'fly')
    })
    log('부활 자리 0의 공중날기 칸', spot)
    await teach(100)
    await openParty()
    await pickFirstMove()
    const got = await sample(20_000)
    const at = await now()
    log('순간이동', { ...got, at })
    await page.screenshot({ path: resolve(OUT, 'teleport.png') })
    verdict('순간이동 — 검정 · 공중날기 칸 · 남쪽', got.fadeColors.includes('rgb(0, 0, 0)') && at.map === spot.to
      && Math.abs(at.facing) < 0.01 && got.dollyMin < 0.78, { at, spot: [spot.to, spot.x, spot.z], dollyMin: got.dollyMin })
  }

  if (CASES.includes('dig') || CASES.includes('rope')) {
    for (const kind of ['dig', 'rope'].filter((k) => CASES.includes(k))) {
      await warp('oreburgh-gate', 258, null, null, 0)
      // 굴 입구 — 무쇠 관문의 203번도로 쪽. 원작은 신오 본판에서 굴로 들어설 때 적는다(`Field_TrySetMapConnection`)
      const exit = await page.evaluate(async () => {
        const save = (await import('/src/state/saveStore.ts')).useSaveStore
        // 걸을 수 있는 자리가 보장된 칸 — 롬 공중날기 칸 하나를 입구로 쓴다 (`spawnWarp`)
        const { spawnWarp } = await import('/src/engine/map/spawns.ts')
        const w = spawnWarp(3, 'fly')
        const e = { map: w.to, matrix: w.matrix, x: w.x, z: w.z, facing: 0 }
        save.setState({ exit: e })
        return e
      })
      if (kind === 'dig') { await teach(91); await openParty(); await pickFirstMove() } else {
        await page.evaluate(async () => { (await import('/src/scene/fieldMoveTask.ts')).beginEscapeRope() })
      }
      const got = await sample(20_000)
      const at = await now()
      log(kind, { ...got, at })
      verdict(`${kind === 'dig' ? '구멍파기' : '탈출로프'} — 하양 · 굴 입구 · 남쪽`, got.fadeColors.includes('rgb(255, 255, 255)')
        && at.map === exit.map && at.x === Math.floor(exit.x) && Math.abs(at.facing) < 0.01, { at, exit: [exit.map, exit.x, exit.z] })
    }
  }

  if (CASES.includes('milk')) {
    await warp('grass', 342, null, null, 0)
    const before = await page.evaluate(async () => {
      const save = (await import('/src/state/saveStore.ts')).useSaveStore
      const party = [...save.getState().party]
      // 바탕 지점의 파티가 한 마리일 수 있다 — 둘째는 첫째를 베껴 세운다(성격값만 달리)
      party[1] = { ...(party[1] ?? { ...party[0], pid: (party[0].pid ^ 0x5a5a) >>> 0, nickname: null }), hp: 1 }
      save.setState({ party })
      return party.map((p) => p.hp)
    })
    await teach(208)
    await openParty()
    const cards = async () => page.evaluate(() => [...document.querySelectorAll('span')].map((s) => s.textContent ?? '')
      .filter((t) => /^\d+\/\d+$/.test(t)))
    const shown = await cards()
    await pickFirstMove()
    const foot1 = await page.evaluate(async () => {
      const { loadUiText, fillMenuText } = await import('/src/data/uiText.ts')
      const locale = (await import('/src/state/optionsStore.ts')).gameLocale()
      const line = fillMenuText((await loadUiText('partyMenu', locale))[36] ?? '', []).trim()
      return line !== '' && document.body.innerText.includes(line)
    })
    // 둘째 자리로 옮겨 고른다
    await tap('ArrowRight', 300)
    await tap('KeyZ', 300)
    await page.waitForTimeout(3000)
    const text = await page.evaluate(() => document.body.innerText)
    const after = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().party.map((p) => p.hp))
    const [full0] = shown[0].split('/').slice(1).map(Number)
    const given = before[0] - after[0]
    log('우유마시기', { before, after, shown, given, foot1, restored: /회복/.test(text) })
    await page.screenshot({ path: resolve(OUT, 'milk.png') })
    verdict('우유마시기 — 최대 체력 ÷ 5', given === Math.trunc(full0 / 5) && after[1] - before[1] === given && foot1,
      { given, fifth: Math.trunc(full0 / 5), gained: after[1] - before[1] })
    await tap('Space', 400)
    await page.evaluate(async () => { (await import('/src/state/menuStore.ts')).useMenuStore.getState().closeAll() })
  }

  if (CASES.includes('cycle')) {
    // 북문(80)에서 206번도로 (302,576)으로 — 앞 맵이 문이어야 `OnResume`이 자전거로드 곡을 건다
    await warp('cycle', 80, null, null, 0)
    await page.evaluate(async () => {
      const { mapById, world } = await import('/src/engine/map/world.ts')
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.cycling = true
      world.pending = { to: 350, matrix: mapById(350).matrix, x: 302.5, z: 576.5, viaDoor: false }
    })
    await page.waitForFunction(() => document.documentElement.dataset.map === '350', null, { timeout: 60_000 })
    await page.waitForTimeout(4000)
    log('도착', await page.evaluate(async () => {
      const f = await import('/src/engine/script/field.ts')
      const fs2 = await import('/src/scene/fieldServices.ts')
      const st = (await import('/src/state/worldState.ts')).worldState
      return { x: st.player.position.x, z: st.player.position.z, flag2452: f.fieldScripts.vars.checkFlag(2452), prev: fs2.previousMap(), cycling: st.player.cycling }
    }))
    const music = await page.evaluate(async () => {
      const s = await import('/src/engine/audio/songs.ts')
      const bike = await import('/src/engine/actor/bike.ts')
      const st = (await import('/src/state/worldState.ts')).worldState
      if (!st.player.cycling) st.player.cycling = true
      return { override: s.fieldBgm.override, road: bike.isOnCyclingRoad() }
    })
    log('자전거로드 곡', music)
    // 다리 어귀(0x71)를 찾아 그 한 칸 북쪽에 선 뒤, 어귀와 다리를 밟고 손을 뗀다 — 다리 **위**여야 내려간다
    const start = await page.evaluate(async () => {
      const { world } = await import('/src/engine/map/world.ts')
      const st = (await import('/src/state/worldState.ts')).worldState
      for (const x of [302, 301, 303, 300, 304, 299, 305, 306]) for (let z = 574; z < 690; z++) {
        if (world.grid.behavior(x, z) !== 0x71) continue
        st.player.position.set(x + 0.5, st.player.position.y, z - 0.5)
        st.player.prevPosition.copy(st.player.position)
        return { x, z, next: world.grid.behavior(x, z + 1).toString(16) }
      }
      return null
    })
    log('다리 어귀', start)
    await page.waitForTimeout(500)
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(350); await page.keyboard.up('ArrowDown')
    const a = await now()
    log('발밑', await page.evaluate(async () => {
      const { world } = await import('/src/engine/map/world.ts')
      const br = await import('/src/engine/actor/bridge.ts')
      const st = (await import('/src/state/worldState.ts')).worldState
      const x = Math.floor(st.player.position.x), z = Math.floor(st.player.position.z)
      return { elevated: br.onElevatedBridge(), here: world.grid.behavior(x, z).toString(16), col: [...Array(12).keys()].map((k) => world.grid.behavior(x, 574 + k).toString(16)).join(' '), cycling: st.player.cycling }
    }))
    await page.waitForTimeout(1000)
    const b = await now()
    log('내리막', { a, b })
    verdict('자전거로드 — 곡 1189 · 손 떼면 남쪽', music.override === 1189 && music.road && b.z - a.z >= 5,
      { music, travelled: b.z - a.z })
  }

  if (CASES.includes('elevator')) {
    await warp('veilstone', 142, null, null, 0)
    const people = await page.evaluate(async () => {
      const n = await import('/src/engine/actor/npcs.ts')
      return n.npcActors.list.filter((x) => x.visible).map((x) => [Math.round(x.x), Math.round(x.z), x.gfx, x.localID])
    })
    log('승강기 사람', people)
    const [ax, az] = people[0]
    await page.evaluate(async ([x, z]) => {
      const st = (await import('/src/state/worldState.ts')).worldState
      st.player.position.set(x + 0.5, st.player.position.y, z + 1.5)
      st.player.prevPosition.copy(st.player.position)
      st.player.facing = Math.PI
    }, [ax, az])
    await page.waitForTimeout(800)
    log('승강기 앞', await now())
    await tap('Space', 800)
    log('말 건 뒤', await now())
    await page.screenshot({ path: resolve(OUT, 'elevator-talk.png') })
    // 층 메뉴가 뜰 때까지 넘기고 한 칸 내려 고른다
    for (let i = 0; i < 20 && !(await now()).choice; i++) await tap('Space', 600)
    log('층 메뉴', await now())
    log('층 메뉴 항목', await page.evaluate(async () => JSON.stringify((await import('/src/engine/script/field.ts')).fieldScripts.world?.menu ?? null).slice(0, 400)))
    await page.screenshot({ path: resolve(OUT, 'elevator-menu.png') })
    // 지하 1층 — 맨 아래에서 둘째 줄. 지금 층을 고르면 「여기입니다」로 끝나 불빛이 안 돈다
    for (let k = 0; k < 5; k++) await tap('ArrowDown', 200)
    await tap('Space', 300)
    // 「내려갑니다」 같은 글은 넘기고, 불빛이 켜진 틀과 꺼진 틀을 잰다(바깥에서 100ms마다 본다)
    let started = null, ended = null
    for (let k = 0; k < 200 && ended === null; k++) {
      const st = await page.evaluate(async () => ({ slot: (await import('/src/scene/elevatorLight.ts')).elevatorLightSlot(), t: performance.now(), talk: document.documentElement.dataset.talk === '1' }))
      if (st.slot !== null && started === null) started = st.t
      if (st.slot === null && started !== null) ended = st.t
      if (st.slot === null && started === null && st.talk) await tap('Space', 250)
      else await page.waitForTimeout(100)
    }
    const t = { ms: started === null || ended === null ? null : Math.round(ended - started) }
    log('불빛', t)
    verdict('승강기 — 불빛 네 바퀴(≈2.05초)', t.ms !== null && Math.abs(t.ms - (4 * 31 - 1) * 1000 / 60) < 250, t)
    await clear()
  }

  if (CASES.includes('shelf')) {
    let spots = []
    // 벽 지도(0x85)가 있는 방을 자료에서 찾아 맨 앞에 둔다 — 실내 격자를 훑는다
    const mapRoom = await page.evaluate(async () => {
      const { world } = await import('/src/engine/map/world.ts')
      const { gridFor } = await import('/src/scene/worldData.ts')
      const seen = new Set()
      for (const h of world.maps) {
        if (h.mapType !== 4 || h.matrix === 0 || seen.has(h.matrix)) continue
        seen.add(h.matrix)
        const g = await gridFor(h.matrix).catch(() => null)
        if (!g) continue
        for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) if (g.behavior(x, z) === 0x85) return { map: h.id, x, z }
      }
      return null
    })
    log('벽 지도가 있는 방', mapRoom)
    for (const room of [...(mapRoom ? [mapRoom.map] : []), 422]) {
    // ⚠️ 엔딩 뒤 상태로 들어간다 — 첫머리 상태면 연구소에서 파트너 장면이 돈다
    await warp('siwon', room, null, null, 0)
    spots = await page.evaluate(async () => {
      const { world } = await import('/src/engine/map/world.ts')
      const g = world.grid
      const out = []
      for (let z = 0; z < 128; z++) for (let x = 0; x < 128; x++) {
        const b = g.behavior(x, z)
        if (b === 0xe0 || b === 0x85 || b === 0xe1 || b === 0xe2) out.push([x, z, b])
        if (b === 0x85) return [[x, z, b]]
      }
      return out
    })
    log(`책장·벽 지도 칸 (${room})`, spots)
    if (spots.length > 0) break
    }
    // 책장이 두 줄이면 **아랫줄 바로 앞**에 선다 — 칸마다 가장 남쪽 줄만 남긴다
    const front = [...new Map(spots.map((p) => [p[0], p])).values()].filter((p) => !spots.some((q) => q[0] === p[0] && q[1] > p[1]))
    for (const [x, z, b] of front.slice(0, 2)) {
      await page.evaluate(async ([tx, tz]) => {
        const st = (await import('/src/state/worldState.ts')).worldState
        st.player.position.set(tx + 0.5, st.player.position.y, tz + 1.5)
        st.player.prevPosition.copy(st.player.position)
        st.player.facing = Math.PI
      }, [x, z])
      await page.waitForTimeout(600)
      await tap('Space', 1200)
      const at = await now()
      const text = await page.evaluate(() => document.body.innerText.slice(0, 400))
      await page.screenshot({ path: resolve(OUT, `shelf-${x}-${z}.png`) })
      log('도는 스크립트', await page.evaluate(async () => { const c = (await import('/src/engine/script/field.ts')).fieldScripts.ctx; return c === null ? null : { file: c.file } }))
      log(`0x${b.toString(16)}`, { at, text: text.replace(/\s+/g, ' ').slice(0, 120) })
      verdict(`A → 0x${b.toString(16)}`, b === 0x85 ? at.menu !== undefined : at.talk, { menu: at.menu, talk: at.talk })
      if (b === 0x85) await tap('KeyX', 800)
      await clear()
    }
  }

  if (CASES.includes('daycare')) {
    await warp('solaceon', 437, null, null, 0)
    const people = await page.evaluate(async () => {
      const n = await import('/src/engine/actor/npcs.ts')
      return n.npcActors.list.filter((x) => x.visible).map((x) => [Math.round(x.x), Math.round(x.z), x.gfx, x.localID])
    })
    log('키우미집 사람', people)
    const beforeParty = await page.evaluate(async () => (await import('/src/state/saveStore.ts')).useSaveStore.getState().party.map((p) => p.pid))
    const before = beforeParty.length
    let opened = false
    for (const [x, z] of people) {
      await page.evaluate(async ([tx, tz]) => {
        const st = (await import('/src/state/worldState.ts')).worldState
        st.player.position.set(tx + 0.5, st.player.position.y, tz + 1.5)
        st.player.prevPosition.copy(st.player.position)
        st.player.facing = Math.PI
      }, [x, z])
      await page.waitForTimeout(600)
      await tap('Space', 900)
      for (let i = 0; i < 40; i++) {
        const at = await now()
        if (at.menu === 'party') { opened = true; break }
        if (i > 8 && !at.talk && at.script !== '1' && !at.choice) { log('키우미집 끊긴 자리', { i, at }); break }
        await tap('Space', 600)
      }
      if (opened) break
    }
    if (opened) {
      await page.waitForTimeout(1200)
      await page.screenshot({ path: resolve(OUT, 'daycare-1-open.png') })
      log('연 순간', await page.evaluate(async () => {
        const m = (await import('/src/state/menuStore.ts')).useMenuStore.getState()
        const f = await import('/src/engine/script/field.ts')
        return { chooseStart: m.chooseStart, daycare: m.chooseDaycare, result: f.fieldScripts.vars.get(0x800c), p8000: f.fieldScripts.vars.get(0x8000) }
      }))
      await tap('ArrowRight', 400)
      await page.screenshot({ path: resolve(OUT, 'daycare-2-right.png') })
      await tap('KeyZ', 600) // 키우미집 갈래 — 맡긴다
      await page.screenshot({ path: resolve(OUT, 'daycare-3-menu.png') })
      await tap('KeyZ', 600)
      log('첫 고르기', await page.evaluate(async () => (await import('/src/ui/menu/partyChoice.ts')).partyChoice))
      await clear(30)
    }
    const after = await page.evaluate(async () => {
      const s = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
      return { party: s.party.length, slots: (s.daycare?.slots ?? []).map((x) => x?.mon?.pid ?? null), beforeParty: null }
    })
    log('키우미집', { opened, before, after })
    // ⚠️ 원작이 「한 마리 더?」를 묻고 넘기기가 「예」를 누르므로 둘까지 맡을 수 있다 — 보는 것은 **첫째가 고른 자리**인가다
    log('맡기기 전 파티', beforeParty)
    verdict('키우미집 — 파티 화면 갈래 · 고른 둘째를 맡긴다', opened && after.slots[0] === beforeParty[1], { opened, before, after })
  }
} finally {
  console.log('\n── 합계 ──')
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`)
  await browser.close()
  vite.child.kill()
}
