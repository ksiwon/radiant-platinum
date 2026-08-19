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
//
// ⚠️ **이야기를 건너뛸 수는 없다.** 여기서 제일 오래 헤맨 것이 이 지점이다.
// 지도상 갈 수 있다고 갈 수 있는 것이 아니라, 원작이 순서대로 문을 연다:
//
//   ① 201번도로 (110~113, 857)을 **밟아야** 마박사가 나와 가방을 놓는다
//      — 안 밟으면 가방이 숨은 채라 네 방향에서 A를 눌러도 아무 일이 없다
//   ② 그 가방에 말을 걸어야 첫 파트너를 고르고 **라이벌전**이 열린다
//      — 안 고르면 "포켓몬부터 고르라"며 가방 앞으로 도로 밀려난다
//   ③ 도감을 받고 집으로 돌아가 엄마에게 말을 걸어야 **소포**가 나온다
//      — 소포가 없으면 202번도로 입구가 주인공을 되돌려 세운다
//
// 셋 다 원작 그대로다(`raw/decomp`의 `scripts_route_201.s` ·
// `scripts_route_202.s` · `scripts_twinleaf_town_player_house_1f.s`). 한때
// 이것을 게임의 결함으로 의심했는데, 막고 있던 것은 전부 **이 하네스가 건너뛴
// 걸음**이었다.
import {
  encounterTiles, gridOf, mapRoute, matrixOf, pathTo, TILE_TABLE, trainersOn, warpsOf,
} from './route.mjs'

/** 방향키 하나가 옮기는 칸 */
const STEPV = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

/**
 * 이야기를 끝까지 몬다.
 *
 * @param page playwright 페이지. 이미 `/play`에 들어와 있어야 한다
 * @returns 무엇에 닿았는지. 판정은 부르는 쪽이 한다
 */
export async function driveStory(page, { log = () => {}, totalMs = 900_000, verbose = false } = {}) {
  const started = Date.now()
  const left = () => totalMs - (Date.now() - started)
  const maps = new Set()
  const battles = { wild: 0, trainer: 0 }
  let shops = 0
  /** 상점을 이미 셌나. 한 번 연 것을 여러 번 세지 않는다 */
  let sawShop = false
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
      // ⚠️ **상점은 A로 못 닫는다.** A는 사는 쪽이라 눌러 봐야 목록 안에서
      // 맴돈다 — 실측으로 여기 갇혀 그 뒤가 통째로 죽었다. 나가는 것은 B다.
      // 세는 것도 여기서 한다: 열린 것을 보는 자리가 여기뿐이다
      if (s.menu === 'shop') {
        if (!sawShop) { sawShop = true; shops++ }
        await tap('KeyX')
        continue
      }
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

  /**
   * 화면이 조용해질 때까지 기다린다 — 스크립트도 대사도 메뉴도 없을 때까지.
   *
   * ⚠️ **기다리지 않으면 아무 일도 안 한 것처럼 보인다.** 트레이너가 눈이
   * 마주쳐 다가오는 동안은 스크립트가 돌고 발이 묶이는데, 그 사이에 말 걸기를
   * 포기하면 "말을 못 걸었다"로 적히고 배틀은 그 뒤에 열린다 — 실측으로
   * 202번도로 트레이너 셋이 전부 이 자리에서 조용히 사라졌다
   */
  const settle = async (rounds = 150) => {
    for (let i = 0; i < rounds; i++) {
      const s = await now()
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      if (s.script) { await tap('Space'); continue }
      return s
    }
    return now()
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
  const walk = async (keys, from, mapId, shun = null) => {
    for (const leg of runs(keys, from)) {
      const at = await runKeys(leg.key, leg.count, leg.want)
      if (at === null) return 'unknown'
      if (at.scene === 'battle') return 'battle'
      if (at.talk || at.scene === 'menu') return 'talk'
      if (at.scene !== 'overworld') return 'scene'
      if (at.map !== mapId) return 'warped'
      if (at.x !== leg.want.x || at.z !== leg.want.z) {
        if (verbose) {
          log(`        ${leg.key}×${String(leg.count)} 막혔다 — ${String(at.x)},${String(at.z)} `
            + `(원한 곳 ${String(leg.want.x)},${String(leg.want.z)})`)
        }
        // ⚠️ **막은 것이 벽이 아니라 사람일 수 있다.** 이야기의 길목마다 누가
        // 서서 "아직 못 간다"고 한다 — 말을 걸어야 비켜 준다
        await tap('Space')
        await clearTalk()
        // ⚠️ **같은 칸을 다시 계획하면 영영 돈다.** 격자는 지나갈 수 있다고
        // 하는데 실제로는 못 지나가는 자리가 있다(실측: 집 1층에서 155초를
        // 같은 한 걸음에 썼다). 그 칸을 이번 계획에서 빼고 **돌아간다** —
        // 무엇이 막았는지 몰라도 길만 있으면 간다
        shun?.add(`${String(leg.want.x)},${String(leg.want.z)}`)
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
    /** 이번에 못 지나간 칸. 너무 많이 쌓이면 비우고 다시 본다 */
    const shun = new Set()
    /** 제자리에서 몇 바퀴를 돌았나. 문 앞에서 이게 는다 */
    let stuckAt = ''
    let stuckFor = 0
    for (let t = 0; Date.now() < till; t++) {
      const s = await now()
      if (verbose && t % 5 === 0) log(`    →${String(target)} ${t}: ${JSON.stringify(s)}`)
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      // 스크립트가 도는 동안은 발이 묶인다 — 밀어 봐야 안 움직인다. 넘겨 준다
      if (s.script) { await tap('Space'); continue }
      if (!s.ok) { await page.waitForTimeout(200); continue }
      maps.add(s.map)
      if (s.map === target) return 'arrived'

      const here = matrixOf(s.map)
      const grid = gridOf(here)

      // ⚠️ **문은 한 발 물러났다 다시 밀어야 열릴 때가 있다.** 문은 밟는 것이
      // 아니라 **마주 보고 미는 것**이고(`map/world.ts`의 `doorEntry`), 앞 칸이
      // 계속 문인 동안은 워프가 다시 걸리지 않는다(`world.armed`). 그래서 문
      // 앞에 붙어 선 채로 미는 것을 되풀이하면 영영 안 열린다 — 실측으로
      // 프렌들리숍 문 앞에서 300초를 그렇게 썼다. 사람이 하는 것을 한다
      const where = `${String(s.x)},${String(s.z)}`
      stuckFor = where === stuckAt ? stuckFor + 1 : 0
      stuckAt = where
      if (stuckFor >= 3) {
        stuckFor = 0
        const away = ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']
          .map((key) => ({ key, at: { x: s.x + STEPV[key][0], z: s.z + STEPV[key][1] } }))
          .find((n) => !grid.blocked(n.at.x, n.at.z)
            && !warpsOf(s.map).some((w) => w.x === n.at.x && w.z === n.at.z))
        if (away !== undefined) {
          if (verbose) log(`      제자리다 — ${away.key}로 한 발 물러난다`)
          await runKeys(away.key, 1, away.at)
          continue
        }
      }
      // 오버월드는 칸이 어느 맵인지도 표에 있다. 표식과 안 맞으면 아직 자리를
      // 안 잡은 것이라 기다린다 — 새 게임 첫 프레임의 (0,0)이 그 자리다
      if (here === 0 && grid.zoneAt(s.x, s.z) !== s.map) {
        await page.waitForTimeout(300); continue
      }

      // 이 맵의 **다른 문은 밟지 않는다** — 모래시티는 한 줄에 문이 셋이라,
      // 상점으로 가는 길이 포켓몬센터 문을 지난다 (실측: 419로 가다 422에 들어갔다)
      const others = warpsOf(s.map)
      const avoid = (x, z) => shun.has(`${String(x)},${String(z)}`)
        || others.some((w) => w.x === x && w.z === z)
      const from = { x: s.x, z: s.z }

      let keys = null
      if (here === matrixOf(target)) {
        keys = pathTo(here, from, (x, z) => grid.zoneAt(x, z) === target, { avoid })
      } else {
        const route = mapRoute(s.map, target)
        if (!route || route.length < 2) return `길이 없다 (${String(s.map)} → ${String(target)})`
        // ⚠️ **중간 구역을 하나씩 밟으면 안 된다.** 같은 행렬 안에서는 구역이
        // 맞닿아 있기만 하면 한 걸음으로 세므로, 맵 그래프가 202번도로에서
        // 집으로 가는 길을 `[343, 0, 411, 414]`로 냈다 — 그 "0"으로 가는
        // 51걸음이 하필 **서쪽 잡는 법 관문**을 지났고, 관문은 소포가 없는
        // 주인공을 되돌려 세운다. 그래서 되돌려 세우고 다시 가기를 되풀이하며
        // 400바퀴를 돌았다. 지나갈 구역이 아니라 **같은 행렬에 있는 마지막
        // 구역**을 곧바로 노린다. 멀어서 못 찾으면 한 칸씩 당겨 본다
        let far = 0
        while (far + 1 < route.length && matrixOf(route[far + 1]) === here) far++
        if (far === 0) {
          const hop = route[1]
          const doors = others.filter((w) => w.to === hop)
          if (doors.length === 0) return `${String(s.map)}에서 ${String(hop)}으로 나가는 문이 없다`
          keys = pathTo(here, from, (x, z) => doors.some((w) => w.x === x && w.z === z), { avoid })
        } else {
          for (let i = far; i >= 1 && keys === null; i--) {
            keys = pathTo(here, from, (x, z) => grid.zoneAt(x, z) === route[i], { avoid })
          }
        }
      }
      if (keys === null) {
        lost++
        // 피할 칸이 너무 쌓여 길이 막힌 것일 수 있다. 한 번 비우고 다시 본다
        if (shun.size > 0) { shun.clear(); continue }
        if (lost > 15) return `${String(s.map)}의 (${String(s.x)},${String(s.z)})에서 길을 못 찾았다`
        await page.waitForTimeout(400); continue
      }
      lost = 0
      if (keys.length === 0) {
        // ⚠️ **이미 그 칸에 서 있는데 아무 일도 안 난다.** 문은 **밟고 들어설
        // 때** 걸리므로, 그 위에 서 있으면 영영 안 열린다 — 계획이 빈 채로
        // 도는 것이 밖에서는 "얼었다"로 보인다. 한 칸 물러났다가 다시 밟는다
        const back = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']
          .map((key) => ({ key, at: { x: s.x + STEPV[key][0], z: s.z + STEPV[key][1] } }))
          .find((n) => !grid.blocked(n.at.x, n.at.z) && !others.some(
            (w) => w.x === n.at.x && w.z === n.at.z))
        if (back === undefined) { await page.waitForTimeout(200); continue }
        if (verbose) log(`      문 위에 서 있다 — ${back.key}로 물러난다`)
        await runKeys(back.key, 1, back.at)
        continue
      }
      const how = await walk(keys, { x: s.x, z: s.z }, s.map, shun)
      if (verbose) log(`      ${String(keys.length)}걸음 → ${how}`)
    }
    return '시간이 다 됐다'
  }

  /**
   * 그 칸을 **밟는다**.
   *
   * ⚠️ **구역에 들어서는 것과 장면을 여는 것은 다르다.** 이야기 장면의 절반은
   * 밟아야 걸리는 것이고(`events.json`의 `triggers`), 그 칸은 대개 구역 한복판에
   * 있다. 구역 경계에 발만 들여놓고 다음 목적지로 떠나면 장면이 안 열리고,
   * 그 뒤의 문이 조용히 잠긴다 — 실측으로 201번도로 첫 장면을 이렇게 지나쳐서
   * 가방이 끝까지 안 나타났고, 파트너를 못 고른 채로 이야기가 멎었다
   */
  const stepOn = async (mapId, spot, budgetMs) => {
    const here = matrixOf(mapId)
    const doors = warpsOf(mapId)
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const shun = new Set()
    while (Date.now() < till) {
      const s = await settle()
      if (!s.ok) { await page.waitForTimeout(200); continue }
      // 장면이 주인공을 다른 맵으로 데려갔으면 그것이 열린 것이다
      if (s.map !== mapId) return 'warped'
      if (s.x === spot.x && s.z === spot.z) return 'arrived'
      const keys = pathTo(here, { x: s.x, z: s.z }, (x, z) => x === spot.x && z === spot.z, {
        avoid: (x, z) => shun.has(`${String(x)},${String(z)}`)
          || doors.some((w) => w.x === x && w.z === z),
      })
      if (keys === null) {
        if (shun.size > 0) shun.clear()
        else await page.waitForTimeout(200)
        continue
      }
      const how = await walk(keys, { x: s.x, z: s.z }, mapId, shun)
      if (how === 'done') return 'arrived'
      if (verbose) log(`      ${String(spot.x)},${String(spot.z)}까지 ${how}`)
    }
    return '시간이 다 됐다'
  }

  /**
   * 그 사람 **옆에 서서 마주 보고** 말을 건다.
   *
   * ⚠️ **그 칸으로 걸어가면 안 된다.** 우리 게임은 사람이 이동을 안 막는다
   * (`actor/obstacles.ts` — 문 앞에 선 사람 하나가 건물을 통째로 잠그는 것을
   * 피하려고 그렇게 뒀다). 그래서 목적지를 그 사람 칸으로 잡으면 **그 위로
   * 올라서 버리고**, 거기서 A를 누르면 앞칸이 비어 아무 일도 안 난다 —
   * 실측으로 점원도 트레이너 셋도 전부 이 자리에서 조용히 실패했다.
   *
   * 네 옆칸을 차례로 시도한다. 어느 쪽에서 접근할 수 있는지는 지형이 정한다
   */
  const talkTo = async (mapId, spot, budgetMs = 120_000) => {
    const here = matrixOf(mapId)
    const doors = warpsOf(mapId)
    // 옆칸 넷. ⚠️ **계산대 너머도 넣는다** — 점원과 간호사는 계산대 뒤에 서고,
    // 게임은 앞 칸이 계산대면 한 칸 더 본다(`map/world.ts`의 `talkTile`).
    // 그걸 모르면 옆칸 넷이 전부 벽이라 "말을 걸 수 없는 사람"이 된다
    const grid = gridOf(here)
    const sides = []
    for (const [key, dx, dz] of [
      ['ArrowUp', 0, 1], ['ArrowDown', 0, -1], ['ArrowRight', -1, 0], ['ArrowLeft', 1, 0],
    ]) {
      const near = { x: spot.x + dx, z: spot.z + dz }
      sides.push({ key, at: near })
      if ((grid.at(near.x, near.z) & 0x7fff) === TILE_TABLE) {
        sides.push({ key, at: { x: near.x + dx, z: near.z + dz } })
      }
    }
    const open = sides.filter((s) => !grid.blocked(s.at.x, s.at.z))
    if (open.length === 0) {
      if (verbose) log(`      ${String(spot.x)},${String(spot.z)} 옆이 사방 벽이다`)
      return false
    }

    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    /** 이번에 못 지나간 칸 */
    const shun = new Set()
    for (let i = 0; Date.now() < till; i++) {
      const side = open[i % open.length]
      const s = await settle()
      if (!s.ok || s.map !== mapId) {
        if (verbose) log(`      말 걸기 그만 — 맵 ${String(s.map)} (원한 맵 ${String(mapId)})`)
        return false
      }
      if (s.x !== side.at.x || s.z !== side.at.z) {
        const keys = pathTo(here, { x: s.x, z: s.z },
          (x, z) => x === side.at.x && z === side.at.z,
          {
            avoid: (x, z) => shun.has(`${String(x)},${String(z)}`)
              || doors.some((w) => w.x === x && w.z === z),
          })
        if (keys === null) {
          if (verbose) log(`      ${String(side.at.x)},${String(side.at.z)}로 가는 길이 없다`)
          if (shun.size > 0) shun.clear()
          else await page.waitForTimeout(200)
          continue
        }
        const how = await walk(keys, { x: s.x, z: s.z }, mapId, shun)
        // ⚠️ **가는 길에 이야기가 끼어든 것은 "말을 걸었다"가 아니다.** 한때
        // 여기서 `talk`를 성공으로 세었더니, 202번도로 입구에서 라이벌이 길을
        // 막는 장면이 트레이너 셋의 "반응"으로 세 번 적혔다 — 배틀은 0인데
        // 실패가 아무 데도 안 남았다. 끼어든 것은 `settle`이 치우고 **다시 간다**
        if (how !== 'done') {
          if (verbose) log(`      ${String(side.at.x)},${String(side.at.z)}까지 ${how}`)
          continue
        }
      }
      // 마주 본다. 짧게 누르면 그 자리에서 방향만 돈다
      await tap(side.key, 40)
      await tap('Space')
      const after = await now()
      if (verbose) {
        log(`      ${side.key}로 마주 보고 A → ${JSON.stringify({
          x: after.x, z: after.z, talk: after.talk, menu: after.menu, scene: after.scene,
        })}`)
      }
      if (after.scene === 'battle' || after.talk || after.scene === 'menu' || after.script) {
        await settle()
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
  //
  // ⚠️ **길목은 목표가 아니다.** 여기 적힌 것 중 정말 재는 것은 마지막 셋
  // (상점 · 야생전 · 트레이너전)이고 나머지는 거기로 가는 길이다. 길목 하나를
  // 못 지났다고 멈추면 **이야기가 우리를 다른 길로 데려간 실행**까지 실패로
  // 센다 — 모래시티에 들어서면 이야기가 주인공을 연구소로 끌고 가는데, 그것이
  // 어떤 실행에서는 일어나고 어떤 실행에서는 안 일어난다. 그래서 길목은
  // **적어만 두고 계속 간다**
  const STOPS = [
    { map: 414, what: '집 1층', budget: 120_000 },
    { map: 411, what: '떡잎마을', budget: 120_000 },
    { map: 413, what: '라이벌 집 2층', budget: 120_000 },
    { map: 411, what: '떡잎마을(다시)', budget: 120_000 },
    // ⚠️ **구역에 들어서기만 해서는 안 된다.** 첫 장면은 (110~113, 857)을
    // 밟아야 열린다. 그 장면이 마박사와 광휘를 부르고 **가방을 내려놓는다**
    // (`scripts_route_201.s`의 `ChooseStarterScene` — `ClearFlag
    // FLAG_HIDE_ROUTE_201_BRIEFCASE` + `AddObject`). 새 게임은 그 가방을
    // 숨긴 채로 시작하므로(`scripts_init_new_game.s`), 이 칸을 안 밟으면
    // 가방이 **거기 없다** — 실측으로 네 방향에서 A를 눌러도 아무 일이 없었다
    { map: 342, what: '201번도로', at: { x: 111, z: 857 }, budget: 180_000 },
    // ⚠️ **여기를 건너뛰면 그 뒤가 통째로 막힌다.** 첫 파트너는 연구소가 아니라
    // 이 가방에서 고른다. 안 고르면 라이벌이 "포켓몬부터 고르라"며 가방 앞으로
    // 도로 밀어 놓는다 — 그것도 지나갈 때마다 다시
    // (`CoordEvent_PickAPokemon`, `VAR_FOLLOWER_RIVAL_STATE`가 1인 동안).
    // 고르고 나면 라이벌전을 치르고 이야기가 주인공을 집으로 데려간다
    { map: 342, what: '201번도로 가방', talk: { x: 112, z: 854 }, budget: 300_000 },
    { map: 334, what: '예진호수', at: { x: 80, z: 844 }, budget: 300_000 },
    { map: 418, what: '모래시티', budget: 300_000 },
  ]

  const reached = []
  const missed = []
  for (const stop of STOPS) {
    if (left() <= 0) break
    const verdict = await goTo(stop.map, Math.min(stop.budget, left()))
    let stood = null
    if (verdict === 'arrived' && stop.at) {
      stood = await stepOn(stop.map, stop.at, Math.min(180_000, left()))
      await settle()
    }
    let said = null
    if (verdict === 'arrived' && stop.talk) {
      said = await talkTo(stop.map, stop.talk, Math.min(180_000, left()))
      await settle()
    }
    const s = await now()
    log(`${stop.what}(${String(stop.map)}) → ${verdict}`
      + (stood === null ? '' : ` · 밟기 ${stood}`)
      + (said === null ? '' : ` · 말 걸기 ${said ? '됐다' : '안 됐다'}`)
      + ` · 지금 맵 ${String(s.map)} 칸 ${String(s.x)},${String(s.z)} `
      + `· ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (verdict === 'arrived' && said !== false) reached.push(stop.map)
    else missed.push(`${stop.what}(${String(stop.map)}): ${verdict}${said === false ? ' (말을 못 걸었다)' : ''}`)
  }

  // ── 상점 ──
  const toMart = left() > 0 ? await goTo(419, Math.min(300_000, left())) : '시간이 다 됐다'
  log(`프렌들리숍(419) → ${toMart} · ${((Date.now() - started) / 1000).toFixed(0)}초`)
  if (toMart === 'arrived') {
    reached.push(419)
    // ⚠️ **점원은 (4,7)이 아니다.** 그 사람은 배달부(스크립트 10201)고, 파는
    // 사람은 계산대 뒤 (3,5)다 (`events.json`의 사람 0). 처음에 배달부에게
    // 말을 걸고 "상점이 안 열린다"고 적을 뻔했다
    await talkTo(419, { x: 3, z: 5 })
    log(`상점 ${String(shops)}회 · ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (shops === 0) trouble.push('상점 점원에게 말을 걸어도 상점이 안 열렸다')
  } else trouble.push(`상점에 못 갔다: ${toMart}`)

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
  //
  // 여기까지 오는 길에 라이벌전을 이미 치렀으면 더 갈 것이 없다. 못 치렀으면
  // 202번도로에 서 있는 셋에게 말을 건다 — 다만 그 길이 소포로 잠겨 있다
  if (battles.trainer === 0 && left() > 0) await parcelThenRoute202()
  if (battles.trainer === 0) trouble.push('트레이너 배틀에 못 닿았다')

  return {
    maps: [...maps].sort((a, b) => a - b),
    reached,
    /** 못 지난 길목. 실패가 아니라 **어느 길로 갔는지**를 적는 자리다 */
    missed,
    wild: battles.wild, trainer: battles.trainer, shops, trouble,
    seconds: Math.round((Date.now() - started) / 1000),
  }

  /** 소포를 받고 202번도로 트레이너에게 간다 */
  async function parcelThenRoute202() {
    await getParcel()
    if (left() <= 0) return
    const to202 = await goTo(343, Math.min(240_000, left()))
    if (to202 !== 'arrived') { trouble.push(`202번도로에 못 갔다: ${to202}`); return }
    maps.add(343)
    for (const t of trainersOn(343)) {
      if (battles.trainer > 0 || left() <= 0) break
      const said = await talkTo(343, { x: t.x, z: t.z }, Math.min(120_000, left()))
      // ⚠️ **"반응했다"만으로는 아무것도 모른다.** 한 실행에서 셋 다 반응하고
      // 배틀은 0이었는데, 실은 입구 장면이 발을 묶은 채로 나머지 둘을
      // "반응했다"로 센 것이었다. 그래서 **뒤에 무엇이 남았는지**를 적는다
      const after = await settle()
      log(`  트레이너 ${String(t.x)},${String(t.z)} → ${said ? '반응했다' : '못 걸었다'} · `
        + `트레이너전 ${String(battles.trainer)} · 뒤 ${JSON.stringify({
          scene: after.scene, script: after.script, talk: after.talk,
          menu: after.menu, x: after.x, z: after.z,
        })}`)
      if (after.script) {
        trouble.push(`트레이너 ${String(t.x)},${String(t.z)}의 스크립트가 안 끝났다`)
        break
      }
    }
    log(`202번도로 트레이너 → ${String(battles.trainer)}회 · `
      + `${((Date.now() - started) / 1000).toFixed(0)}초`)
  }

  /**
   * 소포를 받는다.
   *
   * ⚠️ **이 한 걸음을 빼면 202번도로에 못 들어간다.** 원작이 입구에서 막는다:
   *
   *     Route202_CheckStartCatchingTutorial:
   *         GoToIfUnset FLAG_RECEIVED_PARCEL, Route202_TellYourFamily
   *
   * 소포가 없으면 라이벌이 "가족한테 말은 하고 왔니"라며 되돌려 세운다 —
   * 그것도 **들어설 때마다 다시**. 실측으로 트레이너 셋을 부르러 갈 때마다
   * 이 장면이 열려서, 트레이너전이 한 번도 안 열린 채로 "다 반응했다"로 적혔다.
   *
   * 소포를 주는 곳은 집 1층의 엄마다. 도감을 받은 뒤에 말을 걸면 리포트를
   * 주고, 그 자리에 라이벌 엄마가 들어와 소포를 맡긴다
   * (`scripts_twinleaf_town_player_house_1f.s`의 `MomGiveJournal` →
   * `RivalsMomEnters` → `TakeThisToRival` → `SetFlag FLAG_RECEIVED_PARCEL`).
   *
   * ⚠️ 엄마는 (7,8)이다. 라이벌전 뒤 장면에서 (2,4)로 옮겨 서지만, 그 장면의
   * 이동이 소파 앞 (7,8)로 되돌려 놓는다 — 어느 쪽으로 들어와도 여기다
   */
  async function getParcel() {
    const home = await goTo(414, Math.min(300_000, left()))
    log(`집 1층(414) → ${home} · ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (home !== 'arrived') { trouble.push(`소포를 받으러 집에 못 갔다: ${home}`); return }
    reached.push(414)
    const said = await talkTo(414, { x: 7, z: 8 }, Math.min(120_000, left()))
    await settle()
    log(`  엄마에게 → ${said ? '말을 걸었다' : '못 걸었다'} · `
      + `${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (!said) trouble.push('집 1층에서 엄마에게 말을 못 걸었다 — 소포를 못 받는다')
  }
}

/**
 * 오프닝이 묻는 이름칸의 차례. 첫 칸이 주인공이고 둘째 칸이 라이벌이다.
 *
 * ⚠️ **둘을 같은 이름으로 채우면 안 된다.** 대사의 이름 자리는 스크립트가
 * 채워 넣는 **칸 번호**로 갈린다 (`{STRVAR_1 3, 0, …}`은 라이벌,
 * `{STRVAR_1 3, 1, …}`은 주인공 — 주인공 방 장면이 그렇다). 두 이름이 같으면
 * 그 칸이 뒤바뀌어도 화면 글자가 똑같아서 **아무도 못 잡는다.** 실측으로
 * 라이벌의 첫 대사가 주인공 이름으로 뜬 것처럼 보였는데, 알고 보니 하네스가
 * 두 칸을 같은 글자로 채우고 있었다 (`.audit/rivalScene.mjs`)
 */
export const OPENING_NAMES = ['TESTER', 'RIVALIS']

/**
 * 오프닝을 끝까지 넘긴다 (`/intro` → `/play`).
 *
 * 글이 사용자 롬에서 오므로 **모양을 보고 대응한다**: 이름 칸이 뜨면 적고,
 * 몬스터볼이 뜨면 누르고, 고르는 줄이 셋 이상이면 마지막 칸을 고른다.
 *
 * @param names 이름칸을 채울 차례. 문자열 하나를 주면 그것만 쓰는 옛 방식이라
 *   **이름 자리가 뒤바뀌어도 못 잡는다** — 되도록 `OPENING_NAMES`를 그대로 준다
 */
export async function playOpening(page, names = OPENING_NAMES) {
  const list = typeof names === 'string' ? [names] : names
  let filled = 0
  for (let i = 0; i < 900 && new URL(page.url()).pathname === '/intro'; i++) {
    const input = page.getByLabel('이름')
    if (await input.count() > 0) {
      await input.fill(list[Math.min(filled, list.length - 1)])
      filled += 1
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
