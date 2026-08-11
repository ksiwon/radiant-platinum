// 진짜 설치본으로 이야기를 **길을 알고** 몬다 — 배틀과 상점까지 (DEPLOY.md §5의 ㉖)
//
// ⚠️ **손잡이를 안 쓴다.** `window.pt`도 개발 화면도 안 만진다. 여기서 하는
// 것은 사람이 하는 것과 같다 — 방향키와 A뿐이고, 보는 것은 `<html>`의 읽기
// 전용 표식이다 (`src/app/sceneMark.ts`).
//
// ⚠️ **길은 `route.mjs`가 자료에서 계산한다.** 무작위로 걷는 탐침을 열 번
// 몰아 봤는데 침실 21칸을 맴돌다 끝났다 — 계단이 (8,4) 한 칸이었다.
//
// ⚠️ **운에 안 걸리게 짠다.** 풀밭을 지나가다 야생을 만나기를 기다리면 어떤
// 실행은 세 번 만나고 어떤 실행은 한 번도 안 만난다(실측 3회 · 0회). 그래서
// **일부러 풀밭 위를 왕복하고**, 트레이너와 점원은 **말을 걸어서** 연다 —
// 눈이 마주치기를 기다리지 않는다.
import {
  encounterTiles, gridOf, mapRoute, matrixOf, pathTo, trainersOn, warpsOf,
} from './route.mjs'

/** 방향키 하나가 옮기는 칸 */
const STEPV = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

/**
 * 이야기를 끝까지 몬다.
 *
 * @param page playwright 페이지. 이미 `/play`에 들어와 있어야 한다
 * @returns 무엇에 닿았는지. 판정은 부르는 쪽이 한다
 */
export async function driveStory(page, { log = () => {}, totalMs = 900_000 } = {}) {
  const started = Date.now()
  const left = () => totalMs - (Date.now() - started)
  const maps = new Set()
  const battles = { wild: 0, trainer: 0 }
  let shops = 0
  const trouble = []

  /**
   * 버튼 한 번.
   *
   * ⚠️ **`press`로는 안 눌린다.** 화면이 `keydown`/`keyup`으로 "누르고 있는가"를
   * 들고 매 프레임 그것을 보는데, playwright의 `press`는 두 사건 사이가 1ms도
   * 안 돼서 **프레임 사이로 빠져나간다.** 오프닝에서 스페이스를 900번 눌러도
   * 한 줄도 안 넘어갔다 — 화면은 멀쩡했고 로그에는 아무것도 안 남았다
   */
  const tap = async (key, hold = 70) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(hold)
    await page.keyboard.up(key)
    await page.waitForTimeout(60)
  }

  const now = async () => {
    const m = await page.evaluate(() => ({ ...document.documentElement.dataset }))
    const [x, z] = (m.tile ?? '').split(',').map(Number)
    return {
      scene: m.scene, map: Number(m.map), talk: m.talk === '1', script: m.script === '1',
      battle: m.battle ?? null, menu: m.menu ?? null, x, z,
      ok: Number.isFinite(x) && Number.isFinite(Number(m.map)),
    }
  }

  /** 고르는 줄의 칸 수. 롬 글을 못 읽으니 **생김새**로 센다 */
  const choiceCount = () => page.evaluate(() => {
    for (const d of document.querySelectorAll('div')) {
      const kids = [...d.children]
      if (kids.length < 2) continue
      if (kids.every((c) => c.tagName === 'SPAN' && (c.textContent ?? '').trim() !== '')) {
        return kids.length
      }
    }
    return 0
  })

  /**
   * 대사·메뉴를 넘긴다.
   *
   * ⚠️ 선택지가 셋 이상이면 **마지막 칸**이 나가는 길이다. 첫 칸은 대개
   * "더 듣는다"라 그 물음으로 되돌아온다 — ㉕가 오프닝에서 600걸음을 그렇게 돌았다
   */
  const clearTalk = async (rounds = 80) => {
    for (let i = 0; i < rounds; i++) {
      const s = await now()
      if (!s.talk && s.scene !== 'menu') return true
      // ⚠️ **별명 화면은 A로 안 닫힌다.** 글 칸과 버튼이고, 스크립트는 답이
      // 나올 때까지 선다(`naming.named()`). 여기서 안 다루면 연구소에서
      // 영영 멈춘다 — 실측으로 240초를 그 화면 앞에서 스페이스만 눌렀다
      if (s.menu === 'naming') {
        const skip = page.getByRole('button', { name: '그대로 두기' })
        if (await skip.count() > 0) await skip.click()
        else {
          await page.getByLabel('별명').fill('NICK')
          await page.getByRole('button', { name: '결정' }).click()
        }
        await page.waitForTimeout(250)
        continue
      }
      const n = await choiceCount()
      if (n >= 3) for (let d = 0; d < n - 1; d++) await tap('ArrowDown', 40)
      await tap('Space')
    }
    return false
  }

  /** 배틀 하나를 끝까지 민다 */
  const fightThrough = async () => {
    const kind = (await now()).battle ?? 'wild'
    battles[kind] = (battles[kind] ?? 0) + 1
    log(`  ${kind === 'wild' ? '야생' : '트레이너'} 배틀 — `
      + `야생 ${String(battles.wild)} · 트레이너 ${String(battles.trainer)}`)
    for (let i = 0; i < 800; i++) {
      if ((await now()).scene !== 'battle') return true
      await tap('Space')
    }
    trouble.push('배틀이 800번 눌러도 안 끝났다')
    return false
  }

  /** 방향키를 잡고 그 줄 끝 칸에 닿을 때까지 기다린다 */
  const runKeys = async (key, count, want) => {
    await page.keyboard.down(key)
    const until = Date.now() + 400 + count * 420
    let at = null
    while (Date.now() < until) {
      at = await now()
      if (at.talk || at.scene !== 'overworld') break
      if (at.x === want.x && at.z === want.z) break
      await page.waitForTimeout(25)
    }
    await page.keyboard.up(key)
    await page.waitForTimeout(70)
    return at
  }

  /** 방향키 목록을 같은 방향끼리 묶는다 — 한 칸씩 떼면 네 배 느리다 */
  const runs = (keys, from) => {
    const out = []
    let at = { ...from }
    for (const key of keys) {
      const [dx, dz] = STEPV[key]
      at = { x: at.x + dx, z: at.z + dz }
      const last = out[out.length - 1]
      if (last && last.key === key) { last.count++; last.want = { ...at } } else {
        out.push({ key, count: 1, want: { ...at } })
      }
    }
    return out
  }

  /** 계획한 길을 밟는다. 중간에 무슨 일이 나면 거기서 멈추고 알린다 */
  const walk = async (keys, from, mapId) => {
    for (const leg of runs(keys, from)) {
      const at = await runKeys(leg.key, leg.count, leg.want)
      if (at === null) return 'unknown'
      if (at.scene === 'battle') return 'battle'
      if (at.talk || at.scene === 'menu') return 'talk'
      if (at.scene !== 'overworld') return 'scene'
      if (at.map !== mapId) return 'warped'
      if (at.x !== leg.want.x || at.z !== leg.want.z) {
        // ⚠️ **막은 것이 벽이 아니라 사람일 수 있다.** 이야기의 길목마다 누가
        // 서서 "아직 못 간다"고 한다 — 말을 걸어야 비켜 준다
        await tap('Space')
        await clearTalk()
        return 'blocked'
      }
    }
    return 'done'
  }

  /**
   * 그 맵으로 간다. 못 가면 왜 못 갔는지를 돌려준다.
   *
   * 한 번에 다 못 가는 것이 정상이다 — 문을 지나면 맵이 바뀌고, 이야기가
   * 주인공을 데려가기도 한다. 그래서 **매번 다시 계획한다**
   */
  const goTo = async (target, budgetMs) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    let lost = 0
    while (Date.now() < till) {
      const s = await now()
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      // 스크립트가 도는 동안은 발이 묶인다 — 밀어 봐야 안 움직인다. 넘겨 준다
      if (s.script) { await tap('Space'); continue }
      if (!s.ok) { await page.waitForTimeout(200); continue }
      maps.add(s.map)
      if (s.map === target) return 'arrived'

      const here = matrixOf(s.map)
      const grid = gridOf(here)
      // 오버월드는 칸이 어느 맵인지도 표에 있다. 표식과 안 맞으면 아직 자리를
      // 안 잡은 것이라 기다린다 — 새 게임 첫 프레임의 (0,0)이 그 자리다
      if (here === 0 && grid.zoneAt(s.x, s.z) !== s.map) {
        await page.waitForTimeout(300); continue
      }

      let goal
      if (here === matrixOf(target)) goal = (x, z) => grid.zoneAt(x, z) === target
      else {
        const route = mapRoute(s.map, target)
        if (!route || route.length < 2) return `길이 없다 (${String(s.map)} → ${String(target)})`
        const hop = route[1]
        if (matrixOf(hop) === here) goal = (x, z) => grid.zoneAt(x, z) === hop
        else {
          const doors = warpsOf(s.map).filter((w) => w.to === hop)
          if (doors.length === 0) return `${String(s.map)}에서 ${String(hop)}으로 나가는 문이 없다`
          goal = (x, z) => doors.some((w) => w.x === x && w.z === z)
        }
      }

      // 이 맵의 **다른 문은 밟지 않는다** — 모래시티는 한 줄에 문이 셋이라,
      // 상점으로 가는 길이 포켓몬센터 문을 지난다 (실측: 419로 가다 422에 들어갔다)
      const others = warpsOf(s.map)
      const keys = pathTo(here, { x: s.x, z: s.z }, goal, {
        avoid: (x, z) => others.some((w) => w.x === x && w.z === z),
      })
      if (keys === null) {
        lost++
        if (lost > 15) return `${String(s.map)}의 (${String(s.x)},${String(s.z)})에서 길을 못 찾았다`
        await page.waitForTimeout(400); continue
      }
      lost = 0
      if (keys.length === 0) { await page.waitForTimeout(150); continue }
      await walk(keys, { x: s.x, z: s.z }, s.map)
    }
    return '시간이 다 됐다'
  }

  /** 그 칸 옆에 서서 사방으로 A를 눌러 본다 — 사람은 말을 걸어야 답한다 */
  const talkTo = async (mapId, spot) => {
    const here = matrixOf(mapId)
    const s = await now()
    if (s.map !== mapId || !s.ok) return false
    const doors = warpsOf(mapId)
    const keys = pathTo(here, { x: s.x, z: s.z }, (x, z) => x === spot.x && z === spot.z,
      { avoid: (x, z) => doors.some((w) => w.x === x && w.z === z) })
    if (keys !== null) await walk(keys, { x: s.x, z: s.z }, mapId)
    for (const dir of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) {
      await tap(dir, 40)
      await tap('Space')
      const after = await now()
      if (after.scene === 'battle') { await fightThrough(); return true }
      if (after.talk || after.scene === 'menu') {
        if (after.menu === 'shop') shops++
        await clearTalk()
        return true
      }
    }
    return false
  }

  /**
   * 풀밭 위를 왕복해서 야생을 만난다.
   *
   * ⚠️ **지나가다 만나기를 기다리면 안 된다.** 같은 길을 세 번 몰았는데 야생이
   * 3회·0회·0회였다 — 길이 풀밭을 스치는지가 그때그때 달라서다. 여기서는
   * **풀 칸만 골라 밟는다**
   */
  const grindForWild = async (mapId, budgetMs) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const here = matrixOf(mapId)
    const grass = encounterTiles(mapId)
    if (grass.length === 0) return `맵 ${String(mapId)}에 풀이 없다`
    const doors = warpsOf(mapId)
    let i = 0
    while (Date.now() < till) {
      const s = await now()
      if (s.scene === 'battle') { await fightThrough(); return 'battle' }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      if (s.script) { await tap('Space'); continue }
      if (!s.ok || s.map !== mapId) return `풀밭을 벗어났다 (맵 ${String(s.map)})`
      // 지금 자리에서 가장 가까운 풀 칸부터. 밟을 때마다 다른 칸을 고른다
      const want = grass[(i++ * 7) % grass.length]
      const keys = pathTo(here, { x: s.x, z: s.z }, (x, z) => x === want.x && z === want.z,
        { avoid: (x, z) => doors.some((w) => w.x === x && w.z === z) })
      if (keys === null || keys.length === 0) continue
      const how = await walk(keys, { x: s.x, z: s.z }, mapId)
      if (how === 'battle') { await fightThrough(); return 'battle' }
    }
    return '시간이 다 됐다'
  }

  // ── 차례 ───────────────────────────────────────────────────────────────────
  //
  // 이야기가 지나가는 자리 그대로다. 중간을 건너뛰면 다음 문이 안 열린다 —
  // 라이벌 집 2층을 안 지나면 201번도로가 막혀 있다
  const STOPS = [
    { map: 414, what: '집 1층', budget: 120_000 },
    { map: 411, what: '떡잎마을', budget: 120_000 },
    { map: 413, what: '라이벌 집 2층', budget: 120_000 },
    { map: 411, what: '떡잎마을(다시)', budget: 120_000 },
    { map: 342, what: '201번도로', budget: 180_000 },
    { map: 334, what: '예진호수', budget: 240_000 },
    { map: 418, what: '모래시티', budget: 240_000 },
    { map: 422, what: '연구소', budget: 240_000 },
    { map: 419, what: '프렌들리숍', budget: 240_000 },
  ]

  const reached = []
  for (const stop of STOPS) {
    if (left() <= 0) { trouble.push(`시간이 다 돼서 ${stop.what}에 못 갔다`); break }
    const verdict = await goTo(stop.map, stop.budget)
    const s = await now()
    log(`${stop.what}(${String(stop.map)}) → ${verdict} · 지금 맵 ${String(s.map)} `
      + `칸 ${String(s.x)},${String(s.z)} · ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (verdict !== 'arrived') { trouble.push(`${stop.what}(${String(stop.map)}): ${verdict}`); break }
    reached.push(stop.map)
  }

  // ── 상점 ──
  if (reached.includes(419) && left() > 0) {
    // 점원은 (4,7)에 선다 (`events.json`의 사람 3 · 스크립트 10201)
    for (const spot of [{ x: 4, z: 7 }, { x: 4, z: 8 }, { x: 5, z: 7 }]) {
      if (shops > 0) break
      await talkTo(419, spot)
    }
    log(`상점 ${String(shops)}회 · ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (shops === 0) trouble.push('상점 점원에게 말을 걸어도 상점이 안 열렸다')
  }

  // ── 야생 배틀 ──
  if (battles.wild === 0 && left() > 0) {
    const back = await goTo(342, 180_000)
    if (back === 'arrived') {
      const how = await grindForWild(342, Math.min(240_000, left()))
      log(`풀밭 → ${how} · 야생 ${String(battles.wild)}회`)
    } else trouble.push(`야생을 만나러 201번도로로 못 돌아갔다: ${back}`)
  }
  if (battles.wild === 0) trouble.push('야생 배틀에 못 닿았다')

  // ── 트레이너 배틀 ──
  if (battles.trainer === 0 && left() > 0) {
    const to202 = await goTo(343, Math.min(240_000, left()))
    if (to202 === 'arrived') {
      maps.add(343)
      for (const t of trainersOn(343)) {
        if (battles.trainer > 0 || left() <= 0) break
        await talkTo(343, { x: t.x, z: t.z })
      }
      log(`202번도로 트레이너 → ${String(battles.trainer)}회 · `
        + `${((Date.now() - started) / 1000).toFixed(0)}초`)
    } else trouble.push(`202번도로에 못 갔다: ${to202}`)
  }
  if (battles.trainer === 0) trouble.push('트레이너 배틀에 못 닿았다')

  return {
    maps: [...maps].sort((a, b) => a - b),
    reached, wild: battles.wild, trainer: battles.trainer, shops, trouble,
    seconds: Math.round((Date.now() - started) / 1000),
  }
}

/**
 * 오프닝을 끝까지 넘긴다 (`/intro` → `/play`).
 *
 * 글이 사용자 롬에서 오므로 **모양을 보고 대응한다**: 이름 칸이 뜨면 적고,
 * 몬스터볼이 뜨면 누르고, 고르는 줄이 셋 이상이면 마지막 칸을 고른다
 */
export async function playOpening(page, name) {
  for (let i = 0; i < 900 && new URL(page.url()).pathname === '/intro'; i++) {
    const input = page.getByLabel('이름')
    if (await input.count() > 0) {
      await input.fill(name)
      await page.getByRole('button', { name: '결정' }).click()
      await page.waitForTimeout(200); continue
    }
    const ball = page.getByLabel('몬스터볼')
    if (await ball.count() > 0) { await ball.click(); await page.waitForTimeout(200); continue }
    const n = await page.evaluate(() => {
      for (const d of document.querySelectorAll('div')) {
        const kids = [...d.children]
        if (kids.length < 2) continue
        if (kids.every((c) => c.tagName === 'SPAN' && (c.textContent ?? '').trim() !== '')) {
          return kids.length
        }
      }
      return 0
    })
    if (n >= 3) {
      for (let d = 0; d < n - 1; d++) {
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(40)
        await page.keyboard.up('ArrowDown')
        await page.waitForTimeout(60)
      }
    }
    await page.keyboard.down('Space')
    await page.waitForTimeout(70)
    await page.keyboard.up('Space')
    await page.waitForTimeout(60)
  }
  return new URL(page.url()).pathname
}
