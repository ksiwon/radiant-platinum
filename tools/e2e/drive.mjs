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
import { makeObserver } from './observe.mjs'
import {
  PLAN, encounterTiles, grassAt, gridOf, mapRoute, matrixOf, planPath, TILE_TABLE,
  trainersOn, warpsOf,
} from './route.mjs'

/** 방향키 하나가 옮기는 칸 */
const STEPV = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

/**
 * 이야기를 끝까지 몬다.
 *
 * @param page playwright 페이지. 이미 `/play`에 들어와 있어야 한다
 * @returns 무엇에 닿았는지. 판정은 부르는 쪽이 한다
 */
export async function driveStory(page, {
  log = () => {}, totalMs = 900_000, verbose = false, after = null, skipStory = false,
  upTo = null, observe = 'auto',
} = {}) {
  const started = Date.now()
  /**
   * **무엇을 읽을 수 있는지는 어디서 도느냐가 정한다** (후속 §3).
   *
   * ⚠️ **개발 전용 관측을 공유 드라이버에 섞지 않는다.** 예전에는 이 파일이
   * `/src/...`를 직접 열었고, 배포물에서는 그 요청이 404가 됐다 — 한 자리는
   * 삼켜서 **고르는 기술이 달라졌고**, 한 자리는 던져서 ㉖을 끊었다.
   * 이제 갈래를 먼저 정하고, 못 읽는 것은 **관측 불가**로 남긴다
   */
  const obs = await makeObserver(page, observe)
  /** 기술을 무엇으로 골랐나 — 읽어서 골랐나, 화면 글로 물러났나 */
  const movePicks = { read: 0, text: 0 }
  const left = () => totalMs - (Date.now() - started)
  const maps = new Set()
  const battles = { wild: 0, trainer: 0 }
  let shops = 0
  /** 상점을 이미 셌나. 한 번 연 것을 여러 번 세지 않는다 */
  let sawShop = false
  const trouble = []
  /** 배틀 하나하나의 자취 — 어디서 열려 어디서 끝났나 */
  const fights = []

  /**
   * **계획에 든 비용을 따로 잰다** (야간 실행서 N2).
   *
   * ⚠️ **계획 시간과 게임 무진행은 다른 일이다.** 계획이 도는 동안은 키를 하나도
   * 안 보내므로 밖에서는 「안 움직인다」로 보이고, 그것을 엔진 정지로 세면
   * 없는 결함을 쫓게 된다 — §42가 그 자리였다. 그래서 계획마다 든 시간·본
   * 칸 수·끝난 까닭을 남기고, 마지막으로 키를 보낸 시각을 따로 적는다.
   *
   * ⚠️ **계획 전에 눌린 키는 없다.** `runKeys`가 줄마다 `keyboard.up`으로
   * 놓고 오므로 여기 오는 시점에 눌린 방향키가 없다
   */
  const plans = []
  /** 마지막으로 키를 보낸 시각. 「계획 중」과 「눌렀는데 안 움직인다」를 가른다 */
  let lastKeyAt = Date.now()

  /**
   * **목적지 하나가 한 episode다** (후속 §4.1).
   *
   * ⚠️ **계획을 한데 세면 무엇이 실패했는지 못 안다.** 예전 요약은 계획
   * 하나하나의 `status`를 세었는데, 한 목적지가 **풀회피 → 일반 → 경유 구역**
   * 으로 여러 번 계획하므로 「풀회피 unreachable 뒤 일반 found」가 실패 둘로
   * 세어졌다. 46%라는 수가 그렇게 나온 값이다 — 그것으로 원인을 정하지 않는다.
   *
   * 그래서 **시작 자리·목표 종류·목표 spec·회피 정책·고른 길·실제 이동·끝난
   * 까닭**을 한 번호로 묶는다. 빠르게 실패한 계획도 남긴다
   */
  const episodes = []
  let epSeq = 0
  let curEp = null
  const openEpisode = (kind, spec, at) => {
    const ep = {
      id: ++epSeq, kind, spec,
      map: at.map ?? null, matrix: at.map === undefined ? null : matrixOf(at.map),
      from: { x: at.x ?? null, z: at.z ?? null },
      t0: Date.now(), plans: [], moves: [], end: null, ms: 0,
      // ⚠️ **안에서 부른 것을 잃지 않는다.** `stepOn`은 구역 밖으로 흘러나오면
      // `goTo`를 부르고, 그 안의 계획이 바깥 episode의 것으로 섞이면 안 된다
      parent: curEp?.id ?? null,
    }
    episodes.push(ep)
    curEp = ep
    return ep
  }
  const closeEpisode = (ep, end) => {
    ep.end = end
    ep.ms = Date.now() - ep.t0
    if (curEp === ep) curEp = episodes.find((e) => e.id === ep.parent) ?? null
    return end
  }
  /** 실제 이동 한 묶음의 결과를 지금 episode에 붙인다 */
  const noteMove = (how, at) => {
    curEp?.moves.push({ how, at: at === null ? null : { x: at.x, z: at.z, map: at.map } })
  }

  const planned = (matrix, from, isGoal, opts, why) => {
    const r = planPath(matrix, from, isGoal, opts)
    const row = {
      why, matrix, from: { ...from }, ...r.stats,
      // ⚠️ **어떤 정책으로 세운 계획인지가 없으면 비교가 안 된다** (§4.1)
      avoided: opts.avoid !== undefined && opts.avoid !== null,
      enterBlockedGoal: opts.enterBlockedGoal === true,
      sinceLastKeyMs: Date.now() - lastKeyAt,
      ep: curEp?.id ?? null,
    }
    plans.push(row)
    curEp?.plans.push({ why, status: r.status, ms: +r.stats.ms.toFixed(2),
      expanded: r.stats.expanded, steps: r.stats.steps, blockedGoal: r.stats.blockedGoal })
    return r
  }
  /**
   * **목적지 하나가 어떻게 끝났는가**를 갈래로 나눈다 (후속 §4.1).
   *
   * ⚠️ **계획의 `status`를 세는 것과 다르다.** 「풀회피 실패 뒤 일반 성공」은
   * 실패한 여행이 아니다 — 그것을 실패로 세면 46% 같은 수가 나오고, 그 수로
   * 원인을 정하면 엉뚱한 곳을 판다
   */
  const episodeSummary = () => {
    const kind = (e) => {
      const st = e.plans.map((p) => p.status)
      if (e.end === 'arrived' || e.end === 'talked') {
        return st.some((x) => x === PLAN.unreachable || x === PLAN.budget)
          ? '풀회피 실패 후 성공' : '곧바로 성공'
      }
      if (e.kind === 'npc' && e.reached === true) return '도착 후 대화 실패'
      if (st.includes(PLAN.invalid)) return 'invalid'
      if (st.includes(PLAN.found)) {
        return e.moves.some((m) => m.how !== 'done') ? '경로 found 후 이동 실패' : '경로는 있었다'
      }
      if (st.length > 0 && st.every((x) => x === PLAN.budget)) return 'budget'
      if (st.length > 0 && st.every((x) => x === PLAN.unreachable)) return '모든 후보 unreachable'
      return '기타'
    }
    const by = {}
    for (const e of episodes) {
      e.verdict = kind(e)
      by[e.verdict] = (by[e.verdict] ?? 0) + 1
    }
    return { count: episodes.length, byVerdict: by }
  }

  /**
   * **실패한 목적지만** 제한된 줄로 남긴다.
   *
   * ⚠️ **같은 요청을 계속 쌓지 않는다** (§4.1). 같은 목표를 되풀이한 것은
   * 횟수와 처음·마지막만 남긴다 — 빠르게 실패한 계획일수록 줄 수가 많다
   */
  /**
   * **막힌 걸음의 까닭을 묶어 센다** — 「벽이었다」와 「잠겨 있었다」를 가른다.
   *
   * ⚠️ **판정에 안 쓴다.** 이것은 증거지 통과·실패의 근거가 아니다
   */
  const blockSummary = () => {
    const byWhy = {}
    for (const b of blockNotes) {
      const why = b.grid === true ? '격자가 막았다'
        : b.lock.script ? '스크립트가 돌고 있었다'
          : b.lock.talk ? '대사창이 떠 있었다'
            : b.lock.scene !== 'overworld' ? `씬이 ${String(b.lock.scene)}였다`
              : '격자는 열렸는데 안 갔다'
      byWhy[why] = (byWhy[why] ?? 0) + 1
    }
    return { n: blockNotes.length, byWhy, first: blockNotes.slice(0, 12) }
  }

  const failedEpisodes = (cap = 200) => {
    const seen = new Map()
    for (const e of episodes) {
      if (e.end === 'arrived' || e.end === 'talked') continue
      const key = `${e.kind}:${JSON.stringify(e.spec)}:${String(e.verdict)}`
      const hit = seen.get(key)
      if (hit === undefined) {
        seen.set(key, {
          key, kind: e.kind, spec: e.spec, verdict: e.verdict, times: 1,
          first: { id: e.id, map: e.map, from: e.from, end: e.end, ms: e.ms,
            plans: e.plans.slice(0, 6), moves: e.moves.slice(0, 6) },
          last: null,
        })
      } else {
        hit.times++
        hit.last = { id: e.id, map: e.map, from: e.from, end: e.end, ms: e.ms,
          plans: e.plans.slice(0, 6), moves: e.moves.slice(0, 6) }
      }
    }
    return [...seen.values()].slice(0, cap)
  }

  /** 계획 비용 요약. 밀리초는 기계를 타므로 본 칸 수도 함께 남긴다 */
  const planSummary = () => {
    if (plans.length === 0) return { count: 0 }
    const all = plans.map((p) => p.ms).sort((a, b) => a - b)
    const by = {}
    for (const p of plans) by[p.status] = (by[p.status] ?? 0) + 1
    return {
      count: plans.length,
      totalMs: +all.reduce((a, b) => a + b, 0).toFixed(1),
      p50Ms: +all[Math.floor(all.length * 0.5)].toFixed(2),
      p95Ms: +all[Math.min(all.length - 1, Math.floor(all.length * 0.95))].toFixed(2),
      maxMs: +all.at(-1).toFixed(2),
      maxExpanded: Math.max(...plans.map((p) => p.expanded)),
      byStatus: by,
      /** 1초를 넘긴 계획들 — 있으면 그것만 따로 본다 */
      slow: plans.filter((p) => p.ms > 1000).map((p) => ({ why: p.why, ms: +p.ms.toFixed(1), expanded: p.expanded })),
    }
  }

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

  /**
   * **그 칸에 서 있는 것을 본** 마지막 시각 — `맵:x,z` → ms.
   *
   * ⚠️ **왜 필요한가.** 좌표 이벤트가 걸린 칸은 밟는 **순간** 장면이 열리고,
   * 장면이 주인공을 딴 데로 옮긴다. 그래서 "지금 그 칸에 서 있는가"만 물으면
   * **밟았는데도 영영 확인이 안 된다** — 실측(2026-09-09): 201번도로
   * (111,857)에서 가방 장면이 제대로 열려 파트너를 고르고 라이벌전까지
   * 치렀는데, `stepOn`은 그 180초를 다 쓰고 「시간이 다 됐다」로 적었다.
   *
   * ⚠️ **느슨하게 만드는 것이 아니다.** 좌표 이벤트는 칸에 **들어설 때**
   * 걸린다(`events.json`의 `triggers`) — 거기 **머무는** 것은 게임이 요구하지
   * 않는 더 센 조건이다. 그리고 짐작이 아니라 **관측한 칸만** 적는다
   */
  const trail = new Map()

  const now = async () => {
    const m = await page.evaluate(() => ({ ...document.documentElement.dataset }))
    const [x, z] = (m.tile ?? '').split(',').map(Number)
    if (Number.isFinite(x) && Number.isFinite(Number(m.map)) && m.restoring === undefined) {
      trail.set(`${String(Number(m.map))}:${String(x)},${String(z)}`, Date.now())
    }
    return {
      scene: m.scene, map: Number(m.map), talk: m.talk === '1', script: m.script === '1',
      battle: m.battle ?? null, menu: m.menu ?? null, x, z,
      // ⚠️ **아직 세계가 안 섰으면 「모른다」다** (`state/restoreStore`). 여기를
      // 안 보면 복원 중의 빈 표식이 「길을 잃었다」로 읽힌다 — 기다리면 되는
      // 것과 진짜 무진행은 다른 일이다
      restoring: m.restoring ?? null,
      ok: Number.isFinite(x) && Number.isFinite(Number(m.map)) && m.restoring === undefined,
    }
  }

  /** 고르는 줄의 칸 수와 지금 커서 자리 */
  const choiceCount = () => page.evaluate(() => {
    // ⚠️ **생김새로 어림짐작하지 않는다.** 예전에는 「자식이 전부 글 있는
    // span인 div」로 셌는데, 계기판(`ui/hud/PerfOverlay`)이 자라서 정확히 그
    // 모양(span 셋)이 되자 **그쪽을 고르는 줄로 셌다** — 오프닝이 조작 설명
    // 문답에서 영영 안 빠져나왔다. 고르는 줄은 대사창도 오프닝도
    // `role="radiogroup"`으로 칸과 커서를 내준다
    const g = document.querySelector('[role="radiogroup"]')
    if (g === null) return { n: 0, at: 0 }
    const items = [...g.querySelectorAll('[role="radio"]')]
    const at = items.findIndex((e) => e.getAttribute('aria-checked') === 'true')
    return { n: items.length, at: at < 0 ? 0 : at }
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
      const { n, at } = await choiceCount()
      // ⚠️ **둘짜리는 「예」를 못 박는다.** 예전에는 켜져 있는 칸에 그대로
      // 스페이스를 눌렀는데, 그것은 「기본값이 예다」에 기대는 것이라 화면이
      // 바뀌면 조용히 「아니오」가 된다 — 리포트를 안 쓰고, 축복시티 광대의
      // 문답을 틀린다(원작에서 셋 다 답이 「예」다: `scripts_jubilife_city.s`의
      // `Clown1/2/3CorrectAnswer`). 롬의 차례가 MENU_YES → MENU_NO다
      if (n === 2) for (let d = at; d > 0; d--) await tap('ArrowUp', 40)
      if (n >= 3) for (let d = at; d < n - 1; d++) await tap('ArrowDown', 40)
      await tap('Space')
    }
    return false
  }

  /**
   * 안 끝난 배틀을 몇 번까지 더 밀까.
   *
   * ⚠️ **같은 판에 다시 들어가면 예산이 통째로 사라진다.** `fightThrough`는
   * 120초 상한에 걸리면 **배틀을 세워 둔 채** 나가고, 부르는 쪽은 화면이
   * 아직 `battle`이니 곧바로 다시 부른다 — 실측(2026-09-08): 무쇠 체육관에서
   * 그 되풀이가 **일곱 번**(120·120·120·120·120·120·95초) 돌아 900초를 다
   * 먹었고, 그 판은 회복도 관장도 못 갔다.
   *
   * ⚠️ **덮는 것이 아니다.** 그만두는 자리를 `trouble`에 적으므로 「안 끝나는
   * 배틀이 있다」는 사실은 그대로 보고서에 남는다. 여기서 아끼는 것은 **그
   * 뒤의 독립 항목들이 쓸 시간**이다
   */
  const STUCK_FIGHTS = 2
  let stuckFights = 0

  /** 배틀 하나를 끝까지 민다 */
  const fightThrough = async () => {
    if (stuckFights >= STUCK_FIGHTS) return false
    const opened = await now()
    const kind = opened.battle ?? 'wild'
    battles[kind] = (battles[kind] ?? 0) + 1
    const t0 = Date.now()
    log(`  ${kind === 'wild' ? '야생' : '트레이너'} 배틀 — `
      + `야생 ${String(battles.wild)} · 트레이너 ${String(battles.trainer)}`)
    /**
     * **쓰러진 자리에서 다음 마리를 고른다.**
     *
     * ⚠️ **A만 눌러서는 못 넘어간다.** 앞의 마리가 쓰러지면 화면이 파티 목록을
     * 통째로 띄우는데(`ui/battle/SwitchScreen`), 커서는 **쓰러진 그 마리**에
     * 놓여 있다. 거기서 결정을 눌러도 내보낼 수 없으므로 아무 일도 안 난다 —
     * 사람은 화면의 「싸울 수 없다」를 보고 아래로 내리지만, 스페이스만 치는
     * 하네스는 거기서 영영 선다. 실측으로 무쇠 체육관에서 한 배틀이 안 끝났고,
     * 옛 `fightThrough`가 800번마다 나갔다 다시 들어오며 그 하나를 **열세 번**
     * 세고 있었다 (야간 실행서 N3).
     *
     * ⚠️ **글은 우리 것이다.** 「싸울 수 없다」·「이미 나와 있다」·「이 포켓몬을
     * 내보낸다」는 `SwitchScreen`이 쓰는 우리 안내문이고 롬에서 온 대사가
     * 아니다 (별명 화면을 글로 찾는 것과 같은 자리다)
     */
    const pickFighter = async () => {
      for (const [text, key] of [
        ['이 포켓몬을 내보낸다', 'Space'],
        ['싸울 수 없다', 'ArrowDown'],
        ['이미 나와 있다', 'ArrowDown'],
      ]) {
        if (await page.getByText(text, { exact: true }).count() > 0) {
          await tap(key, 40)
          return true
        }
      }
      return false
    }

    /**
     * **쓸 만한 기술을 고른다.**
     *
     * ⚠️ **첫 칸만 누르면 못 이긴다.** 나무지기의 첫 칸은 몸통박치기고 무쇠
     * 체육관은 전부 바위다 — 화면이 그 칸에 「효과가 별로」라고 적어 준다.
     * 실측(2026-09-08): 첫 칸만 누른 판에서 상대가 **발버둥**을 칠 때까지
     * 배틀이 이어졌고(PP를 다 썼다는 뜻이다) 우리 셋이 차례로 쓰러졌다.
     * 잎날가르기(4배)는 **25/25 그대로**였다.
     *
     * 고르는 규칙은 사람이 보는 것과 같다 — 「효과가 굉장함」이 있으면 그것,
     * 없으면 「효과가 별로」·「효과가 없다」가 **아닌** 첫 칸, 그것도 없으면
     * 첫 칸이다.
     *
     * ⚠️ **기술 칸은 PP로 알아본다.** 명령 칸(싸운다·가방…)에는 `12/25` 꼴이
     * 없다 — 이 화면에서 그 꼴을 오른쪽에 다는 것은 기술 칸뿐이다
     * (`ui/battle/BattleScreen`의 `MoveMenu`).
     *
     * ⚠️ **글도 클릭도 우리 것이다.** 상성 안내문은 `MatchLine`이 적는 우리
     * 글이고 롬 대사가 아니며, 누르는 것은 진짜 마우스 입력이다 — 제품에
     * 뒷문을 내지 않는다
     */
    const pickMove = async () => {
      const rows = page.locator('button').filter({ hasText: /\d+\s*\/\s*\d+/ })
      const n = await rows.count()
      if (n === 0) return false
      /**
       * **기술표를 읽어서 고른다.**
       *
       * ⚠️ **화면 글만으로는 변화 기술을 못 가른다.** 상성 줄은 위력이 있는
       * 기술에만 붙는다(`movePreview`의 `category === 'status'`면 null) — 그래서
       * 「별로임·없음이 아닌 첫 칸」 규칙은 **충전·울음소리 같은 변화 기술을
       * 최고로 친다.** 실측(2026-09-08): 꼬링크가 꼬마돌에게 충전만 되풀이했고,
       * 상대가 발버둥을 칠 때까지 판이 안 끝났다.
       *
       * 그래서 **위력과 상성**으로 고른다 — 사람이 보는 것과 같은 값이고,
       * 읽는 것은 `npcSpot`이 지금 자리를 읽는 것과 같은 자리다. 못 읽으면
       * 예전 규칙으로 물러난다
       */
      // ⚠️ **못 읽은 것과 「고를 것이 없다」는 다르다.** 배포물에는 기술표를
      // 열 길이 아예 없고(관측 불가), 개발 서버에서도 값이 null일 수 있다
      // (변화 기술만 남은 판이 그렇다) — 앞은 **다른 규칙으로 고른 판**이라
      // 증거에 그렇게 적어야 한다 (`movePicks`)
      const read = await obs.bestMove()
      let at = read.known ? read.value : null
      if (at !== null) movePicks.read++
      if (at === null) {
        movePicks.text++
        const texts = []
        for (let i = 0; i < n; i++) {
          texts.push((await rows.nth(i).innerText()).replace(/\s+/g, ' '))
        }
        at = texts.findIndex((t) => t.includes('효과가 굉장함'))
        if (at < 0) at = texts.findIndex((t) => !t.includes('효과가 별로') && !t.includes('효과가 없다'))
        if (at < 0) at = 0
      }
      await rows.nth(Math.min(at, n - 1)).click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(80)
      return true
    }

    // ⚠️ **벽시계 상한을 여기서도 본다.** 예전에는 800번을 세는 것뿐이라,
    // 안 끝나는 배틀 하나가 `settle`의 150바퀴와 겹쳐 **예산을 통째로 넘겼다** —
    // 실측으로 체육관에서 배틀 13회를 찍고 그 뒤로 로그가 멎었다. 세는 것과
    // 시간을 재는 것은 다른 일이다
    const till = Math.min(Date.now() + 120_000, started + totalMs)
    for (let i = 0; i < 800 && Date.now() < till; i++) {
      const at = await now()
      if (at.scene !== 'battle') {
        // ⚠️ **이겼는지 졌는지를 남긴다.** 「배틀 11회」만 적히면 같은 사람과
        // 열한 번 싸운 것인지 열한 명과 싸운 것인지, 지고 되돌아온 것인지
        // 밖에서 못 가른다 — 표식만으로 아는 것은 **맵이 바뀌었는가**다.
        // 전멸하면 원작이 회복 자리로 되돌려 보내므로 맵이 바뀐다
        const moved = Number.isFinite(at.map) && at.map !== opened.map
        fights.push({
          kind, from: opened.map, to: at.map, taps: i,
          ms: Date.now() - t0, movedAfter: moved,
        })
        if (moved) log(`    배틀 뒤 맵이 ${String(opened.map)}→${String(at.map)}로 바뀌었다`
          + ' — 전멸해서 되돌아왔을 수 있다')
        return true
      }
      // 파티 목록이 떠 있으면 **고를 수 있는 마리로 커서를 옮긴 뒤** 결정한다.
      // ⚠️ **기술 고르기보다 먼저다** — 그 화면의 오른쪽 판에도 상성 글이 뜬다
      if (await pickFighter()) continue
      if (await pickMove()) continue
      await tap('Space')
    }
    stuckFights++
    trouble.push(`배틀이 안 끝났다 — ${String(Math.round((Date.now() - t0) / 1000))}초`
      + (stuckFights >= STUCK_FIGHTS ? ' · 같은 판에 더 안 들어간다' : ''))
    fights.push({ kind, from: opened.map, to: null, taps: 800, ms: Date.now() - t0, movedAfter: null })
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
    // ⚠️ **바퀴 수만으로는 못 막는다.** 한 바퀴가 배틀 하나면 150바퀴가 몇
    // 시간이다 — 전체 예산과 이 자리의 상한을 **함께** 본다 (실행서 §4)
    const till = Math.min(Date.now() + 300_000, started + totalMs)
    for (let i = 0; i < rounds && Date.now() < till; i++) {
      const s = await now()
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      if (s.script) { await tap('Space'); continue }
      return s
    }
    return now()
  }

  /** 방향키를 잡고 그 줄 끝 칸에 닿을 때까지 기다린다 */
  /**
   * 방향키를 잡고 그 줄 끝 칸에 닿을 때까지 기다린다.
   *
   * ⚠️ **「칸당 420ms」로 끊으면 안 된다 — 그것은 60FPS 가정이다.**
   * 실측(2026-09-09 `_stairs42` · 개발 서버): 화면이 **4FPS**로 떨어지는
   * 순간이 있고(전체의 8.9%가 10FPS 미만, 최저 4 · 중앙값은 60), 그때 두 칸을
   * 부탁하고 1395ms를 기다리면 **0.18칸**만 간다. 그 판을 「막혔다」로 적으면
   *
   *   ① 멀쩡한 칸이 그 여행 내내 기피 목록에 들어가고
   *   ② 길이 있는데 「경로 found 후 이동 실패」가 난다
   *
   * 실제로 그것이 journey 실패 아홉 건의 원인이었다.
   *
   * 그래서 **시간이 아니라 나아가는가를 본다.** 나아가는 동안은 기다리고,
   * 멈춘 채로 `STALL`을 넘길 때만 포기한다. 왜 끝났는지는 `lastRun`에 남긴다 —
   * 「막혔다」와 「느렸다」를 부르는 쪽이 갈라 쓸 수 있어야 한다.
   *
   * ⚠️ **원시 좌표가 있으면 그것으로 본다.** 표식은 칸 단위 정수라 반 칸을
   * 못 보여 준다 — 4FPS에서 한 칸은 7초가 넘으므로 표식만 보면 「멈췄다」로
   * 읽힌다. 배포물에는 원시 좌표가 없으므로 그쪽은 칸으로 보되 기다림을 넉넉히
   * 준다 (한 칸에 7.7초가 실측값이다)
   */
  const runKeys = async (key, count, want) => {
    lastKeyAt = Date.now()
    /** 원시 좌표를 읽을 수 있나. 읽으면 훨씬 촘촘히 나아감을 본다 */
    const fine = obs.kind === 'dev'
    /** 멈춘 채로 이만큼 지나면 정말 안 가는 것이다 */
    const STALL = fine ? 1_500 : 9_000
    /** 아무리 느려도 여기서는 끊는다 — 무한정 잡고 있지 않는다 */
    const cap = Date.now() + Math.min(60_000, 2_000 + count * 10_000)
    const [dx, dz] = STEPV[key]
    await page.keyboard.down(key)
    let at = null
    let moved = Date.now()
    let seen = null
    let rawSeen = null
    let rawAt = 0
    let why = 'deadline'
    while (Date.now() < cap) {
      at = await now()
      if (at.talk || at.scene !== 'overworld') { why = 'scene'; break }
      // ⚠️ **정확히 같은 칸만 보면 지나친다.** 나아가는 동안 잡고 있으므로,
      // 폴링 사이에 목표 칸을 건너뛰면 영영 안 멈춘다 — 실측(고친 직후):
      // `ArrowLeft×3`을 부탁했는데 **열한 칸**을 갔다. 미는 축에서
      // **닿았거나 지나쳤으면** 손을 뗀다
      if (at.x === want.x && at.z === want.z) { why = 'arrived'; break }
      if (dx !== 0 && (dx > 0 ? at.x >= want.x : at.x <= want.x)) { why = 'passed'; break }
      if (dz !== 0 && (dz > 0 ? at.z >= want.z : at.z <= want.z)) { why = 'passed'; break }
      const tile = `${String(at.x)},${String(at.z)}`
      if (tile !== seen) { seen = tile; moved = Date.now() }
      // 원시 좌표는 매 바퀴 묻기엔 비싸다 — 200ms마다 본다
      if (fine && Date.now() - rawAt > 200) {
        rawAt = Date.now()
        const r = await obs.where()
        if (r.known) {
          const now2 = `${r.value.x.toFixed(2)},${r.value.z.toFixed(2)}`
          if (now2 !== rawSeen) { rawSeen = now2; moved = Date.now() }
        }
      }
      if (Date.now() - moved > STALL) { why = 'stalled'; break }
      await page.waitForTimeout(25)
    }
    await page.keyboard.up(key)
    await page.waitForTimeout(70)
    lastRun = { why, ms: Date.now() - lastKeyAt, key, count }
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
  /** 그 칸이 **우리 격자로** 막혔는가. 「벽이었나」와 「잠겼었나」를 가르는 값이다 */
  const grid0 = (mapId, x, z) => {
    try { return gridOf(matrixOf(mapId)).blocked(x, z) } catch { return null }
  }
  /** 막힌 걸음의 까닭 기록. 판정에는 안 쓰고 증거로만 남긴다 */
  const blockNotes = []
  /** 마지막 `runKeys`가 왜 끝났나 — `arrived`·`stalled`·`scene`·`deadline` */
  let lastRun = { why: null, ms: 0, key: null, count: 0 }

  const walk = async (keys, from, mapId, shun = null) => {
    for (const leg of runs(keys, from)) {
      const legT0 = Date.now()
      const at = await runKeys(leg.key, leg.count, leg.want)
      const legMs = Date.now() - legT0
      if (at === null) return 'unknown'
      if (at.scene === 'battle') return 'battle'
      if (at.talk || at.scene === 'menu') return 'talk'
      if (at.scene !== 'overworld') return 'scene'
      if (at.map !== mapId) return 'warped'
      if (at.x !== leg.want.x || at.z !== leg.want.z) {
        // ⚠️ **「막혔다」의 까닭이 하나가 아니다.** 벽일 수도, 사람일 수도,
        // **필드 스크립트가 발을 묶은 것**일 수도 있다 — `runKeys`는 대사창과
        // 씬 전환만 보고 멈추지 최신 `script` 표식은 안 본다. 실측
        // (2026-09-09 `_stairs42`): 떡잎마을 (115,886)에서 왼·아래·오른 **세
        // 방향이 다 「막혔다」**로 적혔는데 격자로는 셋 다 열려 있었다.
        // 무엇이었는지 **적어 두고** 가른다 — 적기 전에는 고치지 않는다
        blockNotes.push({
          key: leg.key, count: leg.count,
          want: { x: leg.want.x, z: leg.want.z },
          at: { x: at.x, z: at.z, map: at.map },
          lock: { script: at.script, talk: at.talk, scene: at.scene, restoring: at.restoring },
          grid: grid0(mapId, leg.want.x, leg.want.z),
          // ⚠️ **게임에게 직접 묻는다.** 우리 격자와 다르면 그것이 원인이다
          game: await (async () => {
            const r = await obs.blockedAt(leg.want.x, leg.want.z)
            return r.known ? r.value : { why: r.why }
          })(),
          // ⚠️ **「안 움직였다」와 「표식이 안 따라왔다」는 다른 일이다.**
          // 표식(`data-tile`)은 칸 단위 정수라 반 칸을 못 보여 준다 — 원시
          // 좌표를 함께 적어야 그 둘이 갈린다
          raw: await (async () => {
            const r = await obs.where()
            return r.known ? r.value : { why: r.why }
          })(),
          // ⚠️ **격자에 없는 것이 사람이다** — 게임이 쓰는 그 함수에 그대로 묻는다
          // ⚠️ **칸 중심을 물어야 한다.** 주인공의 원시 좌표가 `886.5`인 것에서
          // 보듯 칸 중심은 **정수 + 0.5**다. 정수를 넘기면 칸 모서리를 묻게 되어
          // 옆에 선 사람을 놓친다 — 처음에 그렇게 물어 「사람 null」이 나왔다
          solid: await (async () => {
            const r = await obs.solidAt(leg.want.x + 0.5, leg.want.z + 0.5)
            return r.known ? r.value : { why: r.why }
          })(),
          // ⚠️ **`runKeys`는 칸당 420ms를 가정한다.** 화면이 그보다 느리면
          // 「덜 걸은 것」이 「막힌 것」으로 적힌다 — 그 둘을 가르는 값이다
          legMs,
          why: lastRun.why,
          perf: await (async () => {
            const r = await obs.perf()
            return r.known ? r.value : { why: r.why }
          })(),
        })
        if (verbose) {
          log(`        ${leg.key}×${String(leg.count)} 막혔다 — ${String(at.x)},${String(at.z)} `
            + `(원한 곳 ${String(leg.want.x)},${String(leg.want.z)})`
            + ` · 스크립트 ${at.script ? '돈다' : '안 돈다'} · 대사 ${at.talk ? '있다' : '없다'}`
            + ` · 우리격자 ${grid0(mapId, leg.want.x, leg.want.z) ? '막힘' : '열림'}`
            + ` · 게임격자 ${JSON.stringify(blockNotes.at(-1)?.game)}`
            + ` · 원시 ${JSON.stringify(blockNotes.at(-1)?.raw)}`
            + ` · 사람 ${JSON.stringify(blockNotes.at(-1)?.solid)}`
            + ` · ${String(legMs)}ms · 끝난 까닭 ${String(lastRun.why)}`
            + ` · 계기판 ${JSON.stringify(blockNotes.at(-1)?.perf)}`)
        }
        // ⚠️ **막은 것이 벽이 아니라 사람일 수 있다.** 이야기의 길목마다 누가
        // 서서 "아직 못 간다"고 한다 — 말을 걸어야 비켜 준다
        await tap('Space')
        await clearTalk()
        // ⚠️ **「멈췄다」일 때만 기피 목록에 넣는다.** 나아가는 중이었는데
        // 상한에 걸린 것(`deadline`)을 기피로 적으면 **멀쩡한 칸을 그 여행
        // 내내 피한다** — 실측으로 그것이 journey 실패 아홉 건의 원인이었다.
        // 그때는 그냥 다시 계획해서 이어 간다
        if (lastRun.why !== 'stalled') return 'slow'
        // ⚠️ **정말 안 움직인 자리는 뺀다.** 격자는 지나갈 수 있다고 하는데
        // 실제로는 못 지나가는 자리가 있다(실측: 집 1층에서 155초를 같은 한
        // 걸음에 썼다). 무엇이 막았는지 몰라도 길만 있으면 돌아간다
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
    const ep = openEpisode('zone', { target }, await now())
    const done = (end) => closeEpisode(ep, end)
    let lost = 0
    /** 이번에 못 지나간 칸. 너무 많이 쌓이면 비우고 다시 본다 */
    const shun = new Set()
    /** 제자리에서 몇 바퀴를 돌았나. 문 앞에서 이게 는다 */
    let stuckAt = ''
    let stuckFor = 0
    /** 표식 둘이 아직 안 맞은 바퀴 수. 영영 기다리지는 않는다 */
    let offGrid = 0
    for (let t = 0; Date.now() < till; t++) {
      const s = await now()
      if (verbose && t % 5 === 0) log(`    →${String(target)} ${t}: ${JSON.stringify(s)}`)
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      // 스크립트가 도는 동안은 발이 묶인다 — 밀어 봐야 안 움직인다. 넘겨 준다
      if (s.script) { await tap('Space'); continue }
      if (!s.ok) { await page.waitForTimeout(200); continue }
      maps.add(s.map)
      if (s.map === target) return done('arrived')

      const here = matrixOf(s.map)
      const grid = gridOf(here)

      /**
       * ⚠️ **표식 둘은 같은 순간에 안 적힌다 — 어긋난 한 프레임을 오류로 읽지
       * 않는다.**
       *
       * `data-tile`은 엔진이 **프레임마다** 적고(`scene/EngineDriver`),
       * `data-map`은 React의 `useEffect`가 **커밋 뒤에** 적는다(`app/App.tsx`).
       * 그래서 문을 지난 바로 뒤에는 최소 한 프레임 동안 **맵은 옛것, 칸은
       * 새것**이다. 그때 좌표는 그 맵 격자의 밖이라 `planned`가 `invalid`를
       * 돌려주는데, 예전에는 그것을 「계획 입력이 잘못됐다」로 적고 그 자리에서
       * 접었다 — 실측(2026-09-09): 집 1층(414 · 행렬 128)에 실외 칸
       * (166,818)이 적혀 있었고, 그 한 줄 때문에 축복시티부터 첫 배지까지
       * 다섯 자리가 통째로 무너졌다.
       *
       * ⚠️ **제품 결함이 아니다.** 두 표식은 서로 다른 층이 적는 것이고, 그
       * 사이가 0인 판은 없다. 밖에서 할 일은 **맞을 때까지 기다리는 것**이다 —
       * 실외는 아래에서 이미 그렇게 하고 있었다(`zoneAt(s.x, s.z) !== s.map`).
       * 실내에만 그 대칭이 없었다.
       *
       * ⚠️ **영영 기다리지는 않는다.** 정말 좌표가 틀린 판과 구별해야 하므로
       * 바퀴를 세고, 넘으면 그때는 어긋남 그대로를 적고 접는다
       */
      if (s.x < 0 || s.z < 0 || s.x >= grid.w || s.z >= grid.h) {
        offGrid++
        if (offGrid <= 20) { await page.waitForTimeout(100); continue }
        return done(`표식이 안 맞는다 — 맵 ${String(s.map)}(행렬 ${String(here)}`
          + ` · ${String(grid.w)}×${String(grid.h)})에 칸 ${String(s.x)},${String(s.z)}`)
      }
      offGrid = 0

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

      // ⚠️ **그냥 지나갈 때는 풀숲을 밟지 않는다.** 사람도 그렇게 걷는다.
      // 실측(5판)으로 202번도로를 가로지르며 **야생 배틀 22회**가 붙어 480초
      // 예산을 통째로 먹었고, 그 바람에 축복시티의 포켓치 차례를 못 밟았다 —
      // 검사가 못 잰 것이 게임의 결함으로 보이는 자리다.
      // ⚠️ **풀숲을 못 지나게 막는 것이 아니다.** 풀 없는 길이 없으면 그대로
      // 지난다 — 아래에서 한 번 더 찾는다. 일부러 만나러 가는 쪽은
      // `grindForWild`고, 그쪽은 이 규칙을 안 쓴다
      // ⚠️ **상한 소진을 「길이 없다」로 안 읽는다.** 둘 다 keys가 null이지만
      // 앞은 「더 봐야 안다」고 뒤는 「정말 못 간다」다 — 상한에 걸린 것을
      // 길 없음으로 읽으면 부르는 쪽이 가까운 엉뚱한 구역으로 대신 간다
      /**
       * 한 목적지를 **두 번 시도한다** — 풀을 피해서, 그리고 그냥.
       *
       * ⚠️ **둘을 한데 세면 통계가 뜻을 잃는다** (후속 §4.1). 풀회피가
       * `unreachable`이고 일반이 `found`면 그 여행은 **성공한 여행**이다.
       * 그래서 시도마다 따로 세고, 끝난 까닭은 **마지막에 쓴 계획의 것**을
       * 부르는 쪽에 그대로 돌려준다 (§4.3)
       *
       * @param door 목표가 **문**인가. 문일 때만 통행 불가 칸으로 들어선다
       */
      const path = (isGoal, why, door = false) => {
        const opts = { enterBlockedGoal: door }
        const shy = planned(here, from, isGoal,
          { ...opts, avoid: (x, z) => avoid(x, z) || grassAt(here, x, z) }, `${why}/풀회피`)
        if (shy.keys !== null) {
          return { keys: shy.keys, status: shy.status, why, grassAvoided: true }
        }
        const plain = planned(here, from, isGoal, { ...opts, avoid }, why)
        if (plain.status === PLAN.budget && verbose) {
          log(`      계획 상한 소진 (${why}) — 「길이 없다」가 아니다`)
        }
        return { keys: plain.keys, status: plain.status, why, grassAvoided: false, shy: shy.status }
      }

      /** 마지막으로 시도한 계획의 결말. `null`을 다 같게 다루지 않는다 (§4.3) */
      let plan = { keys: null, status: null, why: '아직 안 세웠다' }
      const use = (r) => { plan = r; return r.keys }

      let keys = null
      if (here === matrixOf(target)) {
        keys = use(path((x, z) => grid.zoneAt(x, z) === target, `구역 ${String(target)}`))
      }
      // ⚠️ **같은 행렬에 있다고 걸어서 닿는다는 뜻이 아니다.** 축복시티와
      // 무쇠시티는 둘 다 행렬 0인데 사이가 절벽이라, 사람은 무쇠게이트(258)로
      // 들어갔다 나온다. 곧바로 노리는 길이 없으면 **없는 것이 아니라 문으로
      // 도는 것**이므로 맵 그래프에 다시 묻는다 — 실측(2026-09-07)으로 이
      // 자리가 없어서 「(177,804)에서 길을 못 찾았다」로 섰다
      if (keys === null) {
        const route = mapRoute(s.map, target)
        if (!route || route.length < 2) return done(`길이 없다 (${String(s.map)} → ${String(target)})`)
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
          if (doors.length === 0) return done(`${String(s.map)}에서 ${String(hop)}으로 나가는 문이 없다`)
          // ⚠️ **문만 통행 불가 칸으로 들어선다** (후속 §4.2)
          keys = use(path((x, z) => doors.some((w) => w.x === x && w.z === z),
            `문 →${String(hop)}`, true))
        } else {
          for (let i = far; i >= 1 && keys === null; i--) {
            keys = use(path((x, z) => grid.zoneAt(x, z) === route[i],
              `경유 구역 ${String(route[i])}`))
          }
        }
      }
      if (keys === null) {
        lost++
        // 피할 칸이 너무 쌓여 길이 막힌 것일 수 있다. 한 번 비우고 다시 본다
        if (shun.size > 0) { shun.clear(); continue }
        // ⚠️ **상한 소진·잘못된 입력을 「길이 없다」로 적지 않는다** (§4.3).
        // 상한은 더 보면 될 수도 있는 것이고, `invalid`는 좌표가 틀린 것이라
        // 같은 자리를 되풀이해 봐야 답이 안 바뀐다
        if (plan.status === PLAN.invalid) {
          return done(`계획 입력이 잘못됐다 (${plan.why} · ${String(s.x)},${String(s.z)})`)
        }
        if (lost > 15) {
          const kind = plan.status === PLAN.budget ? '계획 상한을 소진했다' : '길을 못 찾았다'
          return done(`${String(s.map)}의 (${String(s.x)},${String(s.z)})에서 ${kind}`
            + ` (${plan.why} · ${String(plan.status)})`)
        }
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
      noteMove(how, await now())
      if (verbose) log(`      ${String(keys.length)}걸음 → ${how}`)
    }
    return done('시간이 다 됐다')
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
    const ep = openEpisode('tile', { mapId, spot: { ...spot } }, await now())
    const done = (end) => closeEpisode(ep, end)
    /**
     * 이 부름이 시작한 시각. **이번에** 밟은 것만 센다 — 아까 지나간 칸을
     * 지금의 통과로 읽으면 밟기가 공짜가 된다
     */
    const since = Date.now()
    const key = `${String(mapId)}:${String(spot.x)},${String(spot.z)}`
    /** 걷는 도중에 그 칸을 밟고 장면이 데려갔는가 (`trail`이 왜인지를 적는다) */
    const passed = () => {
      const seen = trail.get(key)
      if (seen === undefined || seen < since) return false
      ep.via = 'passed'
      return true
    }
    /**
     * 옆 구역으로 흘러나간 횟수. 너무 잦으면 되돌아가는 것도 그만둔다 —
     * 목적지가 정말 못 밟는 자리일 수 있다
     */
    let drifted = 0
    /** 잇달아 길을 못 찾은 횟수. 한 번은 사람이 지나가는 중일 수 있다 */
    let blind = 0
    /** 표식 둘이 아직 안 맞은 바퀴 수 */
    let offGrid = 0
    while (Date.now() < till) {
      const s = await settle()
      if (!s.ok) { await page.waitForTimeout(200); continue }
      if (s.map !== mapId) {
        /**
         * ⚠️ **구역 경계를 넘은 것과 장면이 데려간 것은 다르다.**
         *
         * 오버월드는 구역이 서로 맞닿아 있어서, 목적지 칸으로 걸어가다 옆
         * 구역을 밟는 일이 흔하다. 예전에는 그것을 그대로 `warped`로 돌려주고
         * 끝냈는데, 실측(2026-09-08)으로 **호숫가(334)에 도착하는 자리가
         * (95,855)** 였고 그 칸이 201번도로(342)와 붙어 있어서 첫 바퀴에
         * 그대로 나갔다 — 그래서 (80,844)의 좌표 이벤트를 **한 번도 안 밟고**
         * 「호수를 지났다」로 적혔다.
         *
         * 장면이 데려가는 것은 **다른 행렬**로 간다(호수 안쪽 311은 행렬
         * 101이다). 같은 행렬이면 흘러나온 것이니 되돌아가서 이어 간다
         */
        // ⚠️ **장면이 데려간 것이 곧 「못 밟았다」는 아니다.** 밟아서 열린
        // 장면이 데려가는 일이 많다 — 밟은 것을 봤으면 그것이 답이다
        if (passed()) return done('arrived')
        if (matrixOf(s.map) !== here || drifted >= 4) return done('warped')
        drifted++
        if (verbose) log(`      ${String(s.map)}으로 흘러나왔다 — ${String(mapId)}로 되돌아간다`)
        const back = await goTo(mapId, Math.max(0, till - Date.now()))
        if (back !== 'arrived') return done(passed() ? 'arrived' : 'warped')
        continue
      }
      if (s.x === spot.x && s.z === spot.z) { ep.via = 'stood'; return done('arrived') }
      if (passed()) return done('arrived')
      // ⚠️ **여기도 표식이 맞기를 기다린다** (`goTo`가 왜인지를 적는다). 안
      // 기다리면 문을 지난 한 프레임이 「밟기 좌표가 격자 밖이다」로 적히는데,
      // 그 문장은 **엉뚱한 것을 가리킨다** — 틀린 것은 밟을 칸이 아니라 지금 칸이다
      const sg = gridOf(here)
      if (s.x < 0 || s.z < 0 || s.x >= sg.w || s.z >= sg.h) {
        offGrid++
        if (offGrid <= 20) { await page.waitForTimeout(100); continue }
        return done(`표식이 안 맞는다 — 맵 ${String(s.map)}(행렬 ${String(here)})에`
          + ` 칸 ${String(s.x)},${String(s.z)}`)
      }
      offGrid = 0
      // ⚠️ **밟을 칸은 문이 아니다** — 통행 불가 칸을 목표로 삼는 예외를 안 쓴다
      // (후속 §4.2). 쓰면 「계획은 `found`인데 마지막 한 걸음이 늘 막힌다」가
      // 예산이 다 될 때까지 되풀이된다
      const r = planned(here, { x: s.x, z: s.z }, (x, z) => x === spot.x && z === spot.z, {
        avoid: (x, z) => shun.has(`${String(x)},${String(z)}`)
          || doors.some((w) => w.x === x && w.z === z),
      }, `밟기 ${String(spot.x)},${String(spot.z)}`)
      if (r.keys === null) {
        if (shun.size > 0) { shun.clear(); continue }
        // ⚠️ **못 서는 칸을 예산이 다 되도록 노리지 않는다** (§4.3). 큐가 마른
        // 것은 「더 보면 된다」가 아니다 — 왜 못 서는지는 부르는 쪽이 적는다
        blind++
        if (r.status === PLAN.unreachable && blind >= 3) {
          return done(`(${String(spot.x)},${String(spot.z)})에 설 길이 없다`
            + ` — ${String(s.map)}의 (${String(s.x)},${String(s.z)})에서 큐가 말랐다`)
        }
        if (r.status === PLAN.invalid) {
          return done(`밟기 좌표가 격자 밖이다 (${String(spot.x)},${String(spot.z)})`)
        }
        await page.waitForTimeout(200)
        continue
      }
      blind = 0
      const keys = r.keys
      const how = await walk(keys, { x: s.x, z: s.z }, mapId, shun)
      noteMove(how, await now())
      if (how === 'done') { ep.via = 'stood'; return done('arrived') }
      if (passed()) return done('arrived')
      if (verbose) log(`      ${String(spot.x)},${String(spot.z)}까지 ${how}`)
    }
    return done(passed() ? 'arrived' : '시간이 다 됐다')
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
  const talkTo = async (mapId, spot, budgetMs = 120_000, where = null) => {
    const here = matrixOf(mapId)
    const doors = warpsOf(mapId)
    // 옆칸 넷. ⚠️ **계산대 너머도 넣는다** — 점원과 간호사는 계산대 뒤에 서고,
    // 게임은 앞 칸이 계산대면 한 칸 더 본다(`map/world.ts`의 `talkTile`).
    // 그걸 모르면 옆칸 넷이 전부 벽이라 "말을 걸 수 없는 사람"이 된다
    const grid = gridOf(here)
    const ep = openEpisode('npc', { mapId, spot: { ...spot }, followed: where !== null },
      await now())
    const done = (end) => { closeEpisode(ep, end); return end === 'talked' }
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
      return done('옆이 사방 벽이다')
    }

    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    /** 이번에 못 지나간 칸 */
    const shun = new Set()
    for (let i = 0; Date.now() < till; i++) {
      const side = open[i % open.length]
      const s = await settle()
      if (!s.ok || s.map !== mapId) {
        if (verbose) log(`      말 걸기 그만 — 맵 ${String(s.map)} (원한 맵 ${String(mapId)})`)
        return done(`다른 맵으로 나왔다 (${String(s.map)})`)
      }
      if (s.x !== side.at.x || s.z !== side.at.z) {
        const keys = planned(here, { x: s.x, z: s.z },
          (x, z) => x === side.at.x && z === side.at.z,
          {
            avoid: (x, z) => shun.has(`${String(x)},${String(z)}`)
              || doors.some((w) => w.x === x && w.z === z),
          }, '말 걸 자리').keys
        if (keys === null) {
          if (verbose) log(`      ${String(side.at.x)},${String(side.at.z)}로 가는 길이 없다`)
          if (shun.size > 0) shun.clear()
          else await page.waitForTimeout(200)
          continue
        }
        const how = await walk(keys, { x: s.x, z: s.z }, mapId, shun)
        noteMove(how, await now())
        // ⚠️ **가는 길에 이야기가 끼어든 것은 "말을 걸었다"가 아니다.** 한때
        // 여기서 `talk`를 성공으로 세었더니, 202번도로 입구에서 라이벌이 길을
        // 막는 장면이 트레이너 셋의 "반응"으로 세 번 적혔다 — 배틀은 0인데
        // 실패가 아무 데도 안 남았다. 끼어든 것은 `settle`이 치우고 **다시 간다**
        if (how !== 'done') {
          if (verbose) log(`      ${String(side.at.x)},${String(side.at.z)}까지 ${how}`)
          continue
        }
      }
      /**
       * **누르기 직전에 그 사람이 아직 거기 있는지 다시 본다.**
       *
       * ⚠️ **다가가는 동안 상대가 움직인다.** 실측(2026-09-08 `_jubi42`):
       * 축복시티 광대 ①의 자리를 (183,769)로 읽고 다가가는 사이에 그가
       * (183,768)로 한 칸 옮겨 갔다. 그대로 누르면 **빈 칸에 대고 A**이고,
       * 그때 열리는 것이 있으면 그것은 **다른 누군가**다.
       *
       * ⚠️ **사람을 세우지도 옮기지도 않는다.** 옆칸에 아직 있으면 그쪽으로
       * 돌아 누르고, 멀어졌으면 이 바퀴를 버리고 **다시 계획한다**(바깥
       * 고리가 상한을 들고 있으므로 무한하지 않다)
       */
      let key = side.key
      if (where !== null) {
        const nowAt = await where()
        if (nowAt === null) return done('다가가는 사이에 명부에서 사라졌다')
        const dx = nowAt.x - side.at.x
        const dz = nowAt.z - side.at.z
        const turn = dx === 0 && dz === -1 ? 'ArrowUp'
          : dx === 0 && dz === 1 ? 'ArrowDown'
            : dx === 1 && dz === 0 ? 'ArrowLeft'
              : dx === -1 && dz === 0 ? 'ArrowRight' : null
        if (turn === null) {
          // 옆칸이 아니다 — 계산대 너머였을 수도 있으니 원래 방향은 살려 둔다
          const far = Math.abs(dx) + Math.abs(dz)
          if (far > 2) {
            if (verbose) log(`      ${String(spot.x)},${String(spot.z)}에 없다 — ${String(nowAt.x)},${String(nowAt.z)}로 옮겼다`)
            return done(`다가가는 사이에 ${String(nowAt.x)},${String(nowAt.z)}로 옮겼다`)
          }
        } else key = turn
      }
      // 마주 본다. 짧게 누르면 그 자리에서 방향만 돈다
      await tap(key, 40)
      await tap('Space')
      const after = await now()
      if (verbose) {
        log(`      ${key}로 마주 보고 A → ${JSON.stringify({
          x: after.x, z: after.z, talk: after.talk, menu: after.menu, scene: after.scene,
        })}`)
      }
      // ⚠️ **닿은 것과 말이 열린 것을 따로 적는다** (후속 §4.4). 옆칸에 서서
      // 마주 보기까지는 됐는데 A에 아무 일도 안 나는 것과, 애초에 못 간 것은
      // 다른 실패다 — 앞은 대사 개시의 문제고 뒤는 이동의 문제다
      ep.reached = true
      if (after.scene === 'battle' || after.talk || after.scene === 'menu' || after.script) {
        await settle()
        return done('talked')
      }
    }
    return done(ep.reached === true ? '옆에 서서 A를 눌렀는데 아무 일도 안 났다' : '시간이 다 됐다')
  }

  /**
   * 파티가 지금 어떤 상태인가. **읽기만 한다.**
   *
   * ⚠️ **이것을 안 보고 몰면 전멸을 못 본다.** 원작은 전멸하면 마지막 회복
   * 자리로 되돌려 보내는데, 하네스는 그것을 「걷다 길을 잃었다」로 읽었다 —
   * 실측(2026-09-07)으로 축복시티에서 무쇠로 가랬더니 떡잎마을(411)에 서
   * 있었고, 세 자리를 8분씩 헤매다 「시간이 다 됐다」로 끝났다
   */
  // ⚠️ **HP 숫자만으로는 「나았다」를 못 잰다** — 만땅이 몇인지를 알아야 한다.
  // 어댑터가 종족표·기술표를 열어 읽는다(`observe.mjs`). **읽기만 한다.**
  //
  // ⚠️ **못 읽으면 빈 배열이 아니라 `null`이다.** `[]`는 「파티가 비었다」고
  // `null`은 「관측 불가」다 — 둘을 섞으면 배포물에서 「파티가 비었다」가 된다
  const partyState = async () => {
    const r = await obs.partyState()
    return r.known ? r.value : null
  }

  /**
   * 그 파티가 **회복 서비스의 계약대로** 나았는가.
   *
   * ⚠️ **「HP가 0보다 크다」로는 안 된다.** 전원이 HP 1이어도 통과하고,
   * **빈 파티도** `every()`를 통과한다. 제품의 계약은 `saveStore`의
   * `healParty`가 정확히 적어 둔다 — **HP 만땅 · `status: 'ok'` · 기술 PP 만땅**
   */
  const fullyHealed = (party) => {
    // ⚠️ **관측 불가는 「안 나았다」가 아니다.** 부르는 쪽이 그것을 보고
    // 회복 여정을 만들면, 잴 수 없는 것을 재려고 예산만 태운다
    if (party === null) return { ok: false, unknown: true, why: `파티를 못 읽었다 (${obs.kind})` }
    if (!Array.isArray(party) || party.length === 0) return { ok: false, why: '파티가 비어 있다' }
    for (const p of party) {
      if (p.max === null) return { ok: false, why: `종족표를 못 읽었다 (${String(p.species)})` }
      if (p.hp !== p.max) return { ok: false, why: `HP가 ${String(p.hp)}/${String(p.max)}다` }
      if (p.status !== 'ok') return { ok: false, why: `상태가 ${String(p.status)}다` }
      const low = p.moves.find((s) => s.pp !== s.max)
      if (low) return { ok: false, why: `PP가 ${String(low.pp)}/${String(low.max)}다` }
    }
    return { ok: true, why: null }
  }

  /**
   * 포켓몬센터에서 회복한다. **사람이 하는 길 그대로** — 걸어 들어가 간호사에게
   * 말을 걸고 「예」다.
   *
   * 간호사는 그 맵 스크립트의 **첫 항목**이다 (`*_Nurse`가 첫 `ScriptEntry`,
   * `raw/decomp/…/scripts_jubilife_city_pokecenter_1f.s`). 자리로 찾지 않는
   * 까닭은 다른 사람들과 같다 — 걸어 다니는 이가 섞여 있다
   */
  const healAt = async (centerMap, budgetMs) => {
    const t0 = Date.now()
    const came = await goTo(centerMap, Math.min(budgetMs, left()))
    if (came !== 'arrived') return { ok: false, why: `센터에 못 갔다 (${String(came)})` }
    const said = await talkToNpc(centerMap, 1, Math.min(120_000, left()))
    await settle()
    const party = await partyState()
    const healed = fullyHealed(party)
    // ⚠️ **관측 불가를 실패로도 성공으로도 안 적는다** (후속 §3)
    if (said === null || healed.unknown === true) {
      return {
        ok: false, unknown: true, said, party, ms: Date.now() - t0,
        why: `회복을 확인할 길이 없다 (${obs.kind}) — ${String(said === null ? '명부' : healed.why)}`,
      }
    }
    return {
      ok: said && healed.ok, said, party, ms: Date.now() - t0,
      why: said ? healed.why : '간호사에게 못 걸었다',
    }
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
      const keys = planned(here, { x: s.x, z: s.z }, (x, z) => x === want.x && z === want.z,
        { avoid: (x, z) => doors.some((w) => w.x === x && w.z === z) }, '풀 칸').keys
      if (keys === null || keys.length === 0) continue
      const how = await walk(keys, { x: s.x, z: s.z }, mapId)
      if (how === 'battle') { await fightThrough(); return 'battle' }
    }
    return '시간이 다 됐다'
  }


  /**
   * **지금 서 있는 칸**으로 그 사람을 찾는다. 배치표의 자리가 아니다.
   *
   * ⚠️ **배치표 자리는 「처음 선 곳」일 뿐이다.** 축복시티 광대 둘은
   * `MOVEMENT_TYPE_WANDER_AROUND`라 돌아다니고, 포켓치사 사장은 좌표 이벤트가
   * 주인공 쪽으로 **걸어오게** 만든다 — 실측으로 셋 중 둘에게 「말을 못 걸었다」가
   * 났고, 그것은 사람이 없어서가 아니라 **거기 없어서**였다.
   *
   * ⚠️ **읽기만 한다.** 개발 서버에서 모듈을 열어 지금 자리를 보는 것은
   * `story.mjs`가 확인 지점 표를 읽는 것과 같은 자리다 — 진행은 여전히
   * 방향키와 A로만 만든다 (파일 첫머리의 「읽는 것과 넣는 것은 다르다」)
   *
   * @param script 배치표의 스크립트 번호 (`events_*.json`의 `script`)
   * @returns `{x, z}` 또는 못 찾으면 null
   */
  //
  // ⚠️ **못 읽은 것과 「거기 없다」는 다르다.** 배포물에는 명부를 열 길이
  // 없으므로 `{ unknown: true }`를 돌려준다 — `null`(명부에 없다)과 섞으면
  // 「그 사람이 사라졌다」로 잘못 적힌다
  const npcSpot = async (mapId, script) => {
    const r = await obs.npcSpot(mapId, script)
    return r.known ? r.value : { unknown: true, why: r.why }
  }

  /**
   * 그 사람에게 말을 건다 — **돌아다녀도** 따라가서 건다.
   *
   * 한 번에 못 걸면 자리를 다시 읽고 다시 간다. 걸어 다니는 사람은 우리가
   * 옆칸에 서는 사이에 한 칸 옮겨 가 있다
   */
  const talkToNpc = async (mapId, script, budgetMs, tries = 4) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    for (let i = 0; i < tries && Date.now() < till; i++) {
      /**
       * ⚠️ **명부가 비었다고 그 사람이 없는 것이 아니다.**
       *
       * `npcSpot`은 `npcActors.mapId`가 그 맵일 때만 답한다. 그런데 말 걸러
       * 걸어가다 **문을 밟으면** 우리는 건물 안에 서 있고, 그때부터 그 맵의
       * 사람은 **전부** 「없다」로 나온다. 실측(2026-09-08 `_jubi42`):
       * 축복시티에서 광대 ②에게 가다 (179,766)의 문으로 들어가 맵 4의
       * (3.5,10.5)에 섰고, 그 뒤 광대 ②·③·사장 셋이 **한 바퀴도 못 돌고**
       * 「명부에서 사라졌다」로 적혔다.
       *
       * 그래서 **먼저 돌아간다.** 돌아가고도 없으면 그때가 진짜 없는 것이다
       */
      const s = await now()
      if (s.map !== mapId) {
        if (verbose) log(`      맵 ${String(s.map)}에 있다 — ${String(mapId)}로 되돌아간다`)
        const back = await goTo(mapId, Math.max(0, Math.min(120_000, till - Date.now())))
        if (back !== 'arrived') return false
      }
      const at = await npcSpot(mapId, script)
      // ⚠️ **명부를 못 읽는 판에서는 이 길 자체가 없다.** 배포물이 그렇다 —
      // 「사람이 없다」가 아니라 「이 방법으로는 못 찾는다」이므로 그렇게 적는다
      if (at !== null && at.unknown === true) {
        if (verbose) log(`      명부를 못 읽는다 (${String(at.why)}) — 자리 추적 없이 간다`)
        return null
      }
      if (at === null) return false
      const left = till - Date.now()
      if (left <= 0) return false
      const spotAgain = async () => {
        const again = await npcSpot(mapId, script)
        return again !== null && again.unknown === true ? null : again
      }
      const room = Math.min(left, Math.max(20_000, left / (tries - i)))
      if (await talkTo(mapId, at, room, spotAgain)) return true
    }
    return false
  }

  /**
   * 이야기 변수를 **읽는다**. 쓰지 않는다.
   *
   * ⚠️ **여기서 값을 넣으면 검사가 아니다.** 재려는 것은 「정상 입력으로 장면이
   * 끝나는가」고, 값을 넣는 순간 그 물음이 사라진다. 읽는 것은 `npcSpot`이 지금
   * 서 있는 칸을 읽는 것과 같은 자리다 — 진행은 방향키와 A로만 만든다
   */
  //
  // `rival` = `VAR_FOLLOWER_RIVAL_STATE` (3이면 따라오는 중, 4면 호수를 끝냈다) ·
  // `front` = `VAR_VERITY_LAKEFRONT_STATE` · `visited` =
  // `VAR_VISITED_LAKE_VERITY_WITH_RIVAL` (안쪽 장면이 끝나야 1).
  //
  // ⚠️ **배포물에서는 못 읽는다.** 그때 값을 지어내지 않는다 — `known: false`가
  // 그대로 나가고, `lakeVerity`가 **다른 근거로** 완료를 가른다
  const lakeVars = async () => {
    const r = await obs.lakeVars()
    return r.known ? r.value : { unknown: true, why: r.why, rival: null, front: null, visited: null }
  }

  /**
   * **막힌 자리를 그대로 남긴다** — 무엇이 도는지까지.
   *
   * ⚠️ **표식의 `script=1`은 「무언가 돈다」일 뿐이다.** 원본 스크립트 번호 1과
   * 혼동하면 안 된다(`app/sceneMark`). 어느 파일의 어느 자리인지는 여기서만 본다
   */
  const snapshot = async () => {
    const [where, script] = await Promise.all([obs.where(), obs.script()])
    const marks = await page.evaluate(() => ({ ...document.documentElement.dataset }))
    return {
      // ⚠️ **못 읽은 자리를 0으로 접지 않는다** (`docs`의 「진단 계측도 검증한다」)
      ...(where.known ? where.value : { map: null, x: null, z: null, facing: null }),
      whereWhy: where.known ? null : where.why,
      /** 도는 스크립트의 파일과 읽기 위치. `null`이면 아무것도 안 돈다 */
      running: script.known ? script.value.running : null,
      lastError: script.known ? script.value.lastError : null,
      scriptWhy: script.known ? null : script.why,
      marks,
    }
  }

  /**
   * 예진호수 장면을 **끝까지** 끝낸다 (후속 지시 §2).
   *
   * ⚠️ **호숫가에 들어서는 것은 완료가 아니다.** 예전에는 (80,844)를 밟고
   * `settle()` 한 번이면 「됐다」로 셌는데, 그 칸이 여는 것은 **안쪽 맵으로
   * 데려가는 워프**고(`VerityLakefront_CoordEvent_WereAtTheLake`의
   * `Warp MAP_HEADER_LAKE_VERITY_LOW_WATER`), 이야기를 넘기는 것은 그 안의
   * 장면이다. 안쪽 맵 311의 **매 프레임 표**가
   * `VAR_VISITED_LAKE_VERITY_WITH_RIVAL == 0`일 때 `OnFrame_Cyrus`를 걸고
   * (`scripts_init_lake_verity_low_water.s`), 그 장면 끝의
   * `LakeVerityLowWater_EndRivalFollower`가 `VAR_FOLLOWER_RIVAL_STATE`를
   * 3에서 4로 올린다.
   *
   * ⚠️ **3인 동안 동쪽은 잠겨 있다.** 201번도로 (115, 852~855)에 서면 라이벌이
   * "호수는 그쪽이 아니야"라며 되돌려 세운다 — `events.json` 328번 표의
   * `script 14 · var 16518 == 3`, 원본의
   * `Route201_CoordEvent_FollowingRivalStopPlayerEast`다.
   *
   * ⚠️ **`warped`는 전환이지 완료가 아니다.** 단계마다 따로 적고, 마지막 판정은
   * **읽은 변수**로 한다
   */
  const lakeVerity = async (budgetMs) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const room = () => Math.max(0, till - Date.now())
    const stages = []
    /**
     * @param ok `true`·`false`, 또는 **`null`이면 관측 불가**다 — 부르는 쪽이
     *   그것을 통과로도 실패로도 안 센다 (후속 §3)
     */
    const mark = async (name, ok, note = '', evidence = 'vars') => {
      const s = await now()
      const v = await lakeVars()
      stages.push({
        name, ok, note, evidence, observer: obs.kind,
        map: s.map, x: s.x, z: s.z,
        rival: v.rival, front: v.front, visited: v.visited,
        varsWhy: v.unknown === true ? v.why : null,
      })
      const said = ok === null ? '못 쟀다' : ok ? '됐다' : '안 됐다'
      log(`    호수 · ${name} → ${said}${note === '' ? '' : ` (${note})`}`
        + ` · 맵 ${String(s.map)} 칸 ${String(s.x)},${String(s.z)}`
        + (v.unknown === true ? ' · 변수 관측 불가'
          : ` · 라이벌 ${String(v.rival)} · 호숫가 ${String(v.front)} · 다녀옴 ${String(v.visited)}`))
      return ok === true
    }
    /** 변수를 못 읽는 판인가. 매 단계 다시 묻지 않고 한 번 정한다 */
    const varsKnown = (await lakeVars()).unknown !== true
    /**
     * 무엇으로 「끝났다」를 가르는가.
     *
     * `vars`       — 이야기 변수를 읽는다 (개발 서버)
     * `transition` — 순서 있는 전환으로 가른다 (배포물): 안쪽 진입 → 장면이
     *   돌고 끝남 → 정상 출구 → **동쪽 통행**. 마지막 하나가 실은 라이벌
     *   상태를 읽는 것과 같다 — 3인 동안 그 칸은 주인공을 되돌려 세운다
     */
    const contract = varsKnown ? 'vars' : 'transition'

    // ① 라이벌이 따라붙어 있어야 한다. 2면 아직이다 — 201번도로 (109~113, 857)이
    //    그것을 붙이는 칸이다 (`script 16 · var 16518 == 2` → `RivalStartFollowing`)
    let v = await lakeVars()
    if (varsKnown && v.rival >= 4) {
      await mark('이미 끝나 있다', true, `상태 ${String(v.rival)}`)
      return { ok: true, stages, already: true }
    }
    if ((!varsKnown || v.rival === 2) && room() > 0) {
      // ⚠️ **밟아 두는 것은 값을 못 읽어도 옳다.** (109~113, 857)이 라이벌을
      // 붙이는 칸이고(`script 16 · var 16518 == 2` → `RivalStartFollowing`),
      // 이미 붙어 있으면 그 좌표 이벤트는 조건이 안 맞아 아무 일도 안 한다
      await goTo(342, Math.min(120_000, room()))
      await stepOn(342, { x: 111, z: 857 }, Math.min(120_000, room()))
      await settle()
      v = await lakeVars()
    }
    if (varsKnown) {
      if (!await mark('동행 준비', v.rival === 3, `상태 ${String(v.rival)}`)) {
        return { ok: false, stages, at: await snapshot(), contract }
      }
    } else {
      // ⚠️ **못 읽는 것을 통과로 세지 않는다.** 여기서 정말 재는 것은 ⑥이다 —
      // 라이벌 상태가 3인 동안 동쪽이 잠기므로, 동쪽을 지나가면 그때 4다
      await mark('동행 준비', null, '변수를 못 읽는다 — ⑥ 동쪽 통행으로 대신 잰다', 'unobservable')
    }

    // ② 호숫가(334)에 선다
    const toFront = room() > 0 ? await goTo(334, Math.min(150_000, room())) : '시간이 다 됐다'
    if (!await mark('호숫가 도착', toFront === 'arrived', toFront)) {
      return { ok: false, stages, at: await snapshot(), contract }
    }

    // ③ 좌표 이벤트를 밟는다. `events.json` 320번 표: (80,844) 너비 2 ·
    //    `var 16514 == 0`. 장면이 주인공을 북으로 걷게 하고 안쪽으로 워프한다
    // ⚠️ **한 번에 못 밟는 것이 정상이다.** 이 칸은 구역 안쪽 깊숙이 있고
    // 가는 길에 사람도 지형도 있다 — 되돌아가서 다시 간다
    let stood = '안 해 봤다'
    let inside = await now()
    for (let t = 0; t < 3 && inside.map !== 311 && room() > 0; t++) {
      stood = await stepOn(334, { x: 80, z: 844 }, Math.min(120_000, room()))
      await settle()
      inside = await now()
      if (inside.map !== 311 && inside.map !== 334 && room() > 0) {
        await goTo(334, Math.min(90_000, room()))
        inside = await now()
      }
    }
    if (!await mark('안쪽으로 들어섰다', inside.map === 311, `밟기 ${stood}`)) {
      return { ok: false, stages, at: await snapshot(), contract }
    }

    // ④ 안쪽 장면을 정상 입력으로 넘긴다. 매 프레임 표가 건 것이라 우리가 부를
    //    것은 없다 — 대사를 넘기고 스크립트가 끝나기를 기다리는 것뿐이다
    //
    // ⚠️ **바퀴 수로 끊으면 안 된다.** 이 장면은 카메라가 호수를 훑고
    // (`AddFreeCamera`·`ApplyFreeCameraMovement`) `WaitTime`이 15·30·50프레임씩
    // 서고 대사가 아홉 창이다 — 실측(2026-09-08)으로 열두 바퀴에서 끊었더니
    // `다녀옴 0`으로 실패로 적혔는데, **그 뒤 30초 안에 4가 됐다.**
    // 끝났는지는 바퀴가 아니라 **값**이 말한다
    const sceneTill = Math.min(Date.now() + 240_000, till)
    /**
     * **장면이 돌았고 끝났는가** — 변수를 못 읽는 판의 근거다 (후속 §3).
     *
     * ⚠️ **안쪽에 들어선 것은 완료가 아니다.** 그래서 「돌았다」와 「끝났다」를
     * 각각 본다: 대사창·스크립트 표식이 한 번이라도 켜졌고(`ran`), 그 뒤
     * 조용한 관측이 잇달아 나왔는가(`quiet`). 둘 중 하나만 있으면 완료가
     * 아니다 — 켜진 적이 없으면 **아무 장면도 안 돈 것**이고, 안 꺼졌으면
     * **아직 도는 중**이다.
     *
     * ⚠️ **그 둘의 뜻이 다르다.** 「돌다가 안 끝났다」는 **제품 실패**고,
     * 「한 번도 안 돌았다」는 그 자체로는 실패가 아니라 **관측 불충분**이다 —
     * 우리가 보는 것은 `data-talk`·`data-script` 표식뿐이라, 장면이 그 표식을
     * 안 켜고 지나갔을 수도 있다. 그래서 뒤엣것은 `inconclusive`로 적고
     * 부르는 쪽이 BLOCKED로 센다.
     *
     * ⚠️ **`quiet`는 프레임 수가 아니다.** 한 바퀴가 `settle()` + `tap('Space')`
     * (누름 70ms + 뗌 60ms) + 200ms 대기라, 조용한 관측 4회는 **330ms 넘는
     * 간격의 관측 4회**이지 렌더 프레임 4장이 아니다. 프레임을 세는 자리가
     * 아니므로 그렇게 적지 않는다
     */
    let ran = false
    let quiet = 0
    while (Date.now() < sceneTill) {
      if (varsKnown && (await lakeVars()).visited === 1) break
      // ⚠️ **`settle()`로 보면 안 된다 — 그것이 이미 기다려 버린다.**
      //
      // `settle()`은 대사창·스크립트·배틀이 **끝날 때까지** 눌러 가며 도는
      // 함수라, 돌아올 때는 정의상 바쁘지 않다. 그 반환값으로 `busy`를 재면
      // **`ran`이 영영 참이 안 된다** — 실측(2026-09-09 배포본 ㉖): 안쪽 맵
      // 311까지 들어갔는데 「장면이 한 번도 안 돌았다」로 적혔다.
      // 그래서 여기서는 **날 표식**(`now()`)을 본다
      const s = await now()
      if (s.scene === 'battle') { ran = true; quiet = 0; await fightThrough(); continue }
      const busy = s.talk || s.script || s.scene !== 'overworld'
      if (busy) {
        ran = true; quiet = 0
        await tap('Space')
        await page.waitForTimeout(120)
        continue
      }
      if (s.map === 311) {
        quiet++
        // 표식이 조용해도 곧바로 안 믿는다 — 창과 창 사이가 그렇게 보인다
        if (!varsKnown && ran && quiet >= 4) break
      }
      await tap('Space')
      await page.waitForTimeout(200)
    }
    v = await lakeVars()
    if (varsKnown) {
      if (!await mark('장면이 끝났다', v.visited === 1 && v.rival === 4,
        `다녀옴 ${String(v.visited)} · 라이벌 ${String(v.rival)}`)) {
        return { ok: false, stages, at: await snapshot(), contract }
      }
    } else if (!ran) {
      // 장면 표식이 한 번도 안 켜졌다 — 「안 돌았다」와 「못 봤다」를 우리가
      // 못 가르는 자리다. 실패로 세지 않고 관측 불충분으로 남긴다
      await mark('장면이 돌고 끝났다', null,
        `표식이 한 번도 안 켜졌다 — 돌았는지 못 봤다 · 조용한 관측 ${String(quiet)}회`,
        'unobservable')
      return { ok: false, inconclusive: true, stages, at: await snapshot(), contract }
    } else if (!await mark('장면이 돌고 끝났다', quiet >= 4,
      `장면 돌았다 · 조용한 관측 ${String(quiet)}회 (한 회 ≥330ms)`,
      'transition')) {
      return { ok: false, stages, at: await snapshot(), contract }
    }

    // ⑤ 정상 출구로 나온다 — (46,54)·(47,54)가 호숫가로 되돌리는 문이다
    const out = room() > 0 ? await goTo(334, Math.min(120_000, room())) : '시간이 다 됐다'
    if (!await mark('정상 출구', out === 'arrived', out)) {
      return { ok: false, stages, at: await snapshot(), contract }
    }

    // ⑥ 동쪽이 열렸는가. 되돌려 세우던 그 칸에 **서 본다**
    //
    // ⚠️ **먼저 그 맵으로 가야 한다.** `stepOn`은 서 있는 맵이 다르면 첫 바퀴에
    // `warped`를 돌려준다 — 실측(2026-09-08)으로 호숫가에 선 채로 부르는 바람에
    // 「동쪽 통행 안 됐다」가 났고, 그건 문이 잠긴 것이 아니라 우리가 안 간 것이었다
    const backEast = room() > 0 ? await goTo(342, Math.min(120_000, room())) : '시간이 다 됐다'
    const east = backEast === 'arrived' && room() > 0
      ? await stepOn(342, { x: 115, z: 853 }, Math.min(150_000, room()))
      : `201번도로로 못 갔다 (${backEast})`
    await settle()
    const there = await now()
    const passed = east === 'arrived' && there.map === 342 && there.x === 115
    if (!await mark('동쪽 통행', passed, `밟기 ${east}`, varsKnown ? 'vars' : 'transition')) {
      return { ok: false, stages, at: await snapshot(), contract }
    }
    return { ok: true, stages, contract }
  }

  // ⚠️ **`skipStory`는 진단용이다** — 세이브를 읽어 이미 그 자리에 선 판에서
  // **한 구간만** 다시 몰아 보려고 둔다. 대표 구간의 판정에는 안 쓴다:
  // 여기를 건너뛰면 그 판은 「걸어서 이어졌다」를 증명하지 않는다 (기획서 §1.4)
  if (skipStory) {
    const only = after === null ? null : await after({
      goTo, stepOn, talkTo, talkToNpc, npcSpot, grindForWild, settle, now, tap, clearTalk,
      partyState, healAt, fullyHealed,
      fightThrough, getParcel, log, left, maps, trouble, battles,
      lakeVars, snapshot, lakeVerity,
    })
    return {
      maps: [...maps], ...battles, shops, missed: [], trouble,
      plan: planSummary(), episodes: episodeSummary(), failedEpisodes: failedEpisodes(),
      blocks: blockSummary(),
      fights, movePicks, observer: obs.kind, extra: only,
    }
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
    // ⚠️ **밟기 하나로는 안 끝난다** — `lakeVerity`가 단계마다 따로 잰다
    { map: 334, what: '예진호수', scene: lakeVerity, budget: 300_000 },
    { map: 418, what: '모래시티', budget: 300_000 },
  ]

  const reached = []
  const missed = []
  /** 길목마다의 단계 기록. 「들어섬다」와 「끝냈다」를 여기서 가른다 */
  const scenes = []
  // ⚠️ **`upTo`는 진단용이다** — 짧은 재현이 뒤엣것 때문에 예산을 다 쓰는 것을
  // 막는다. 대표 구간의 판정에는 안 쓴다(기본값이 전부다)
  for (const stop of (upTo === null ? STOPS : STOPS.slice(0, upTo))) {
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
    // ⚠️ **장면은 도착과 다른 물음이다.** 도착은 「그 구역에 섬는가」고
    // 장면은 「이야기가 넘어갔는가」다 — 앞엣것만 재면 잠긴 문 앞에서
    // 통과가 난다
    let scene = null
    if (verdict === 'arrived' && stop.scene) {
      scene = await stop.scene(Math.min(300_000, left()))
      scenes.push({ what: stop.what, map: stop.map, ...scene })
      await settle()
    }
    const s = await now()
    log(`${stop.what}(${String(stop.map)}) → ${verdict}`
      + (stood === null ? '' : ` · 밟기 ${stood}`)
      + (said === null ? '' : ` · 말 걸기 ${said ? '됐다' : '안 됐다'}`)
      + (scene === null ? '' : ` · 장면 ${scene.ok ? '끝냈다' : '못 끝냈다'}`)
      + ` · 지금 맵 ${String(s.map)} 칸 ${String(s.x)},${String(s.z)} `
      + `· ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (verdict === 'arrived' && said !== false && scene?.ok !== false) reached.push(stop.map)
    else {
      const why = verdict !== 'arrived' ? verdict
        : said === false ? '말을 못 걸었다'
          : `장면이 「${String(scene?.stages?.find((g) => !g.ok)?.name ?? '?')}」에서 멈췄다`
      missed.push(`${stop.what}(${String(stop.map)}): ${why}`)
    }
  }

  // ── 상점 ──
  //
  // ⚠️ **`upTo`로 자른 판은 여기까지 안 온다.** 짧은 재현이 상점·야생·트레이너에
  // 예산을 다 쓰면 재려던 자리의 뒷정리를 못 본다
  const toMart = upTo !== null ? '건너뛰었다'
    : left() > 0 ? await goTo(419, Math.min(300_000, left())) : '시간이 다 됐다'
  log(`프렌들리숍(419) → ${toMart} · ${((Date.now() - started) / 1000).toFixed(0)}초`)
  if (toMart === 'arrived') {
    reached.push(419)
    // ⚠️ **점원은 (4,7)이 아니다.** 그 사람은 배달부(스크립트 10201)고, 파는
    // 사람은 계산대 뒤 (3,5)다 (`events.json`의 사람 0). 처음에 배달부에게
    // 말을 걸고 "상점이 안 열린다"고 적을 뻔했다
    await talkTo(419, { x: 3, z: 5 })
    log(`상점 ${String(shops)}회 · ${((Date.now() - started) / 1000).toFixed(0)}초`)
    if (shops === 0) trouble.push('상점 점원에게 말을 걸어도 상점이 안 열렸다')
  } else if (upTo === null) trouble.push(`상점에 못 갔다: ${toMart}`)

  // ── 야생 배틀 ──
  if (upTo === null && battles.wild === 0 && left() > 0) {
    const back = await goTo(342, 180_000)
    if (back === 'arrived') {
      const how = await grindForWild(342, Math.min(240_000, left()))
      log(`풀밭 → ${how} · 야생 ${String(battles.wild)}회`)
    } else trouble.push(`야생을 만나러 201번도로로 못 돌아갔다: ${back}`)
  }
  if (upTo === null && battles.wild === 0) trouble.push('야생 배틀에 못 닿았다')

  // ── 트레이너 배틀 ──
  //
  // 여기까지 오는 길에 라이벌전을 이미 치렀으면 더 갈 것이 없다. 못 치렀으면
  // 202번도로에 서 있는 셋에게 말을 건다 — 다만 그 길이 소포로 잠겨 있다
  if (upTo === null && battles.trainer === 0 && left() > 0) await parcelThenRoute202()
  if (upTo === null && battles.trainer === 0) trouble.push('트레이너 배틀에 못 닿았다')

  // ── 더 갈 데가 있으면 이어서 몬다 ─────────────────────────────────────────
  //
  // ⚠️ **길잡이를 그대로 넘긴다** (PT-03의 Journey가 여기서 이어 간다). 베껴
  // 쓰면 「문 앞에서 한 발 물러난다」·「사람 칸으로 걸어가지 않는다」처럼 실측으로
  // 얻은 요령이 두 벌이 되고, 언젠가 한쪽만 고쳐진다
  const extra = after === null ? null : await after({
    goTo, stepOn, talkTo, talkToNpc, npcSpot, grindForWild, settle, now, tap, clearTalk,
    partyState, healAt, fullyHealed,
    fightThrough,
    // ⚠️ **소포를 받는 걸음도 같이 넘긴다.** 위에서는 트레이너전이 0일 때만
    // 부르는데(라이벌전이 이미 붙었으면 건너뛴다), 그 뒤로 더 가는 쪽은
    // **언제나** 소포가 있어야 한다 — 없으면 202번도로 서쪽이 막힌다
    getParcel,
    // 읽기만 하는 진단 손잡이. 짧은 재현이 막힌 자리를 그대로 적는 자리다
    lakeVars, snapshot, lakeVerity,
    log, left, maps, trouble, battles,
  })

  return {
    maps: [...maps].sort((a, b) => a - b),
    reached,
    /** 못 지난 길목. 실패가 아니라 **어느 길로 갔는지**를 적는 자리다 */
    missed,
    wild: battles.wild, trainer: battles.trainer, shops, trouble,
    seconds: Math.round((Date.now() - started) / 1000),
    /** 계획에 든 비용. 「하네스가 생각하는 중」과 「게임이 멎었다」를 가른다 */
    plan: planSummary(),
    /** 목적지 하나 단위의 결말. 계획 하나 단위의 `plan`과 **다른 것을 센다** */
    episodes: episodeSummary(),
    /** 실패한 목적지의 자취. 빠르게 실패한 것도 남는다 */
    failedEpisodes: failedEpisodes(),
    blocks: blockSummary(),
    /** 배틀 자취. 같은 사람과 여러 번인지, 지고 되돌아왔는지가 여기 있다 */
    fights,
    /** 이야기 장면의 단계 기록. 「들어섰다」로는 못 세는 것이 여기 있다 */
    scenes,
    /** 어느 관측 어댑터로 몰았나 — `dev`면 값을 읽었고 `dist`면 표식만 봤다 */
    observer: obs.kind,
    /** 기술을 무엇으로 골랐나. 배포물은 전부 `text`다 (관측 불가) */
    movePicks,
    extra,
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
 * 두 칸을 같은 글자로 채우고 있었다 (`.audit/probe/rivalScene.mjs`)
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
  /**
   * 지금 어느 화면인가 — **페이지에 직접 묻는다.**
   *
   * ⚠️ **`page.url()`은 늦는다.** playwright는 마지막 탐색 사건 뒤에 그 값을
   * 갱신하므로, 방금 부른 `navigate`를 못 따라온다. 실측(2026-09-08 · 5판):
   * 「시작」을 누른 뒤 주소가 `/intro`가 되기까지 24~50ms가 걸렸는데
   * `playOpening`은 그 전에 `page.url()`을 읽어 `/`를 보고 **한 번도 키를
   * 안 보낸 채 그냥 돌아왔다** — 5판 중 3판이 그랬다. 밖에서는 그것이
   * 「오프닝이 타이틀로 되돌아갔다」로 보였지만, 자취에는 `/`로 가는 탐색이
   * **한 건도 없다**. 되돌아간 것이 아니라 **출발을 안 한 것**이었다
   */
  const where = () => page.evaluate(() => location.pathname)

  // ⚠️ **먼저 `/intro`에 들어설 때까지 기다린다.** 「시작」은
  // `resetSave().then(() => navigate('/intro'))`라(`ui/screens/TitleScreen`)
  // 저장을 지우는 동안은 아직 타이틀이다 — 그 시간은 기계와 저장 크기를 탄다
  const till = Date.now() + 60_000
  while (Date.now() < till) {
    const at = await where()
    if (at !== '/') break
    await page.waitForTimeout(100)
  }

  let filled = 0
  for (let i = 0; i < 900; i++) {
    // ⚠️ **입력 직전마다 다시 본다.** `/intro`를 벗어난 뒤에 보낸 키는 다음
    // 화면이 받는다 — 오프닝을 끝낸 마지막 스페이스가 필드로 새는 자리다
    if (await where() !== '/intro') break
    const input = page.getByLabel('이름')
    if (await input.count() > 0) {
      await input.fill(list[Math.min(filled, list.length - 1)])
      filled += 1
      await page.getByRole('button', { name: '결정' }).click()
      await page.waitForTimeout(200); continue
    }
    const ball = page.getByLabel('몬스터볼')
    if (await ball.count() > 0) { await ball.click(); await page.waitForTimeout(200); continue }
    const { n, at } = await page.evaluate(() => {
    // ⚠️ **생김새로 어림짐작하지 않는다.** 예전에는 「자식이 전부 글 있는
    // span인 div」로 셌는데, 계기판(`ui/hud/PerfOverlay`)이 자라서 정확히 그
    // 모양(span 셋)이 되자 **그쪽을 고르는 줄로 셌다** — 오프닝이 조작 설명
    // 문답에서 영영 안 빠져나왔다. 고르는 줄은 대사창도 오프닝도
    // `role="radiogroup"`으로 칸과 커서를 내준다
    const g = document.querySelector('[role="radiogroup"]')
    if (g === null) return { n: 0, at: 0 }
    const items = [...g.querySelectorAll('[role="radio"]')]
    const at = items.findIndex((e) => e.getAttribute('aria-checked') === 'true')
    return { n: items.length, at: at < 0 ? 0 : at }
    })
    if (n >= 3) {
      for (let d = at; d < n - 1; d++) {
        if (await where() !== '/intro') break
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(40)
        await page.keyboard.up('ArrowDown')
        await page.waitForTimeout(60)
      }
    }
    if (await where() !== '/intro') break
    await page.keyboard.down('Space')
    await page.waitForTimeout(70)
    await page.keyboard.up('Space')
    await page.waitForTimeout(60)
  }
  return where()
}
