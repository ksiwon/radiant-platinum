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
import { makeObserver, watchMapScene } from './observe.mjs'
import { makePen, makeStall, SLOW, STALLED } from './budget.mjs'
import {
  allMaps, PLAN, encounterTiles, grassAt, gridOf, mapRoute, matrixOf, npcsOf,
  planPath, slopeClimbBan, TILE_TABLE, trainersOn, waterAt, warpsOf,
} from './route.mjs'

/** 방향키 하나가 옮기는 칸 */
const STEPV = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
/** 자전거 (`items.ko.json` 450번 · 열쇠도구). `actor/bike.ts`의 `BIKE_ITEM`과 같은 값이다 */
const BIKE_ITEM = 450

/**
 * **진행 없는 한 바퀴는 이보다 짧게 안 센다** (지시서 H1).
 *
 * ⚠️ **바퀴만 세면 빠른 바퀴가 견딤을 갉아먹는다.** 스크립트가 도는 동안의 한
 * 바퀴는 「표식 읽기 + 스페이스 한 번」이라 130ms다 — 그것을 그대로 세면 견딤
 * 90회가 12초가 되어 **멀쩡한 컷신을 「멈췄다」로 적는다.** 진행이 없었던
 * 바퀴만 이 길이로 맞춘다. 나아가는 바퀴는 그대로 전속력이다.
 *
 * ⚠️ **이것은 상한이 아니다.** 기계가 느리면 한 바퀴가 저절로 이보다 길어지고,
 * 그만큼 견딤도 길어진다 — 부하가 상한을 스스로 늘린다. 그것이 이 바꿈의 요지다
 */
const ROUND_MS = 330
/**
 * 진행 없이 견디는 바퀴 수.
 *
 * ⚠️ **넉넉히 잡는다.** 여기서 아끼는 것은 실패한 판의 시간뿐인데, 짧게 잡아
 * 잃는 것은 **멀쩡한 판의 판정**이다. 90바퀴는 진행이 정말 0일 때 최소
 * 30초(90 × 330ms)이고, 실제로는 한 바퀴가 계획·걷기를 안으므로 훨씬 길다
 */
const GO_PATIENCE = 90
const STEP_PATIENCE = 90
/**
 * **가둠**으로 볼 자유 보행 바퀴 수와 칸 수 (`makePen`).
 *
 * 자유롭게 걷는 바퀴 120번을 칸 넷 안에서만 도는 것은 안 갇히고는 안 나온다 —
 * 실측의 두 자리 모두 칸이 **둘**이었다(206번도로 게이트 · 209번도로 비탈).
 *
 * ⚠️ **바퀴 수를 벽시계로 옮겨 짐작하지 않는다.** 처음에 300으로 뒀는데,
 * 오버월드 한 바퀴는 960×960 격자를 최대 세 번 훑으므로 한 바퀴가 **초 단위**다
 * — 209번도로에서 같은 칸에 **10분**을 서 있는 동안 300을 못 채웠다. 바퀴는
 * 기계 부하에 따라 길이가 변하는 자라서(그것이 `makeStall`의 요지다) 자리마다
 * 얼마가 걸리는지는 재 봐야 안다
 */
const PEN_ROUNDS = 120

/**
 * 이보다 느리면 **판이 도는 게 아니라 기는 것**이다 (프레임/초).
 *
 * ⚠️ **안 나아가는 것과 못 나아가는 것을 가르는 자리다.** 견딤 계수기(`makeStall`
 * ·`makePen`)는 **바퀴**를 세는데 바퀴는 벽시계로 돈다 — 화면이 4프레임/초로
 * 기면 한 바퀴(`ROUND_MS`)에 게임은 서너 프레임밖에 못 간다. 그러면 걸음이
 * 반 칸도 못 가고, 밖에서는 「120바퀴를 칸 4개 안에서만 걸었다」로 보인다.
 *
 * 실측(2026-09-23 대표 구간 · 축복시티 맵 3): 막혔다고 적힌 자리마다 계기판이
 * **4~8프레임/초**였고, 같은 판에서 60프레임/초인 바퀴는 **13칸을 한 번에**
 * 갔다. 게임 격자도 「안 막혔다」였고 사람도 없었다 — 막은 것은 지형이 아니라
 * 프레임이었다 (`shots/jubi42/2026-09-22T18-11-06-688Z`).
 *
 * 그래서 기는 바퀴는 **안 센다.** 판정이 아니라 세는 잣대를 고치는 것이고,
 * 총예산은 그대로라 정말 막힌 판은 여전히 예산에서 끝난다
 */
const CRAWL_FPS = 15
const PEN_TILES = 4

/**
 * 이야기를 끝까지 몬다.
 *
 * @param page playwright 페이지. 이미 `/play`에 들어와 있어야 한다
 * @returns 무엇에 닿았는지. 판정은 부르는 쪽이 한다
 */
export async function driveStory(page, {
  log = () => {}, totalMs = 900_000, verbose = false, after = null, skipStory = false,
  upTo = null, observe = 'auto', obstacles = null, closedMaps = null,
  /** 진단 스크린샷을 둘 곳 (약을 못 본 순간 등). null이면 안 찍는다 */
  shotDir = null,
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
  /** 「새 기술을 배우겠는가」에 몇 번 답했나 */
  let learnAsks = 0
  /** 규칙대로 갈아 낀 기술 — `잊은것→배운것` */
  const learnTaught = []
  /** 규칙이 「새것이 더 세지 않다」거나 못 읽어서 그대로 둔 횟수 */
  let learnKept = 0
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
   * **격자가 모르는 벽** — 그 맵에만 있는 장치가 지금 막고 있는 칸.
   *
   * `route.mjs`의 격자는 타일 통행만 안다. 그런데 장치가 있는 방은 같은 칸이
   * 때에 따라 막히고 열린다 — 영원 체육관의 꽃시계가 그렇다. 바늘 자리는
   * 13×13 표 다섯 장으로 구워져 있고(`engine/world/eternaGym.ts`), 제품도
   * 그것으로 막는다(`scene/mapFeatureCollision.ts`).
   *
   * ⚠️ **모르면 없는 결함이 생긴다.** 실측(표로 미리 셈): 시계 상태 0에서
   * 표가 막는 160칸 중 **140칸을 격자는 걸을 수 있다고 한다.** 그 칸으로
   * 계획을 세우면 걸음마다 벽에 부딪히고, 하네스는 그것을 「멈췄다」나
   * 「길이 없다」로 적는다 — 게임은 원작대로 움직이고 있는데도 그렇다.
   *
   * ⚠️ **표를 여기서 다시 세지 않는다.** 부르는 쪽이 제품에게 물어 만든
   * 것을 넘겨받기만 한다 — 두 벌이 되면 언젠가 한쪽만 고쳐진다.
   * 장치가 상태를 바꾸면(트레이너를 이기면) 부르는 쪽이 다시 읽어 갈아 끼운다
   */
  const blockedByFeature = (mapId, x, z) =>
    (obstacles !== null && obstacles(mapId, x, z) === true)
    // ⚠️ **맵이 아니라 행렬로 센다.** 실외는 구역이 **한 행렬을 나눠 쓰므로**,
    // 347에 서서 65로 가는 길을 세우면 그 길이 202를 가로지른다 — 서 있는 맵의
    // 번호로 장애물을 걸어 두면 **그때 그 나무들이 안 보인다**. 실측
    // (2026-09-17 `_leg42`): 202에서 347로 빠져나왔다가 같은 계획으로 202에
    // 도로 들어가기를 121걸음씩 되풀이했다
    || standingObstacles.has(`${String(matrixOf(mapId))}:${String(x)},${String(z)}`)

  /**
   * **벨 나무·깰 바위·밀 바위는 격자에 없다** — 지형이 아니라 객체라서다
   * (`engine/actor/obstacles.ts`의 `OBSTACLE_MOVE`: 84 괴력 · 85 바위깨기 ·
   * 86 베어가르기). 길 찾기는 칸 격자만 보므로 **그것들을 뚫고 가는 길**을 낸다.
   *
   * ⚠️ 실측(2026-09-17 `_leg42`): 영원의 숲(202) 216,566과 216,567에
   * **베어가르기 나무 둘**(스프라이트 86 · 스크립트 10000 · 플래그 34)이 나란히
   * 서서 동쪽 길을 막는데, 그쪽이 202에서 205번도로 북(349)으로 가는 **유일한**
   * 격자 길이다. 그래서 하네스는 같은 두 칸에 스무 번을 부딪혔다. 제대로 된 길은
   * 202가 아니라 **숲 안(203)의 북쪽 문**이고, 그 길은 이 두 칸을 막아야 보인다.
   *
   * ⚠️ **표를 쓰지 않고 게임에게 묻는다.** `events.json`은 **처음** 서 있던
   * 자리라, 우리가 이미 깬 바위(험한 샛길)도 그대로 서 있다고 한다 — 그러면
   * 우리가 낸 길을 우리가 막는다. 그래서 맵에 들어설 때마다 제품의
   * `obstacleAt`에게 **아직 서 있는지**를 묻는다. 물어볼 칸은 맵당 몇 개다
   */
  const standingObstacles = new Set()
  /** 장애물 표를 이미 깐 행렬과, 게임에게 이미 물어본 맵 */
  const obstaclesSeeded = new Set()
  const obstaclesAsked = new Set()
  const OBSTACLE_SPRITES = new Set([84, 85, 86])
  /**
   * 그 행렬의 장애물을 **표에서 통째로 깐다** — 아직 안 가 본 구역 것까지.
   *
   * ⚠️ **제품에게 물어서는 못 채운다.** `obstacleAt`은 **지금 떠 있는 맵**의
   * 실제 물체를 보므로, 옆 구역 칸을 물으면 「없다」가 온다 — 그것을 믿으면
   * 안 가 본 구역의 나무를 뚫고 가는 길을 낸다. 그래서 **모르는 것은 서 있는
   * 것으로 친다**: 잘못 막으면 돌아갈 뿐이고, 잘못 열면 그 앞에서 멎는다.
   *
   * 행렬 0 전체가 77개다 (실측 2026-09-17) — 깔아도 값이 싸다
   */
  const seedObstacles = (matrix) => {
    if (matrix < 0 || obstaclesSeeded.has(matrix)) return
    obstaclesSeeded.add(matrix)
    const maps = allMaps()
    for (let id = 0; id < maps.length; id++) {
      if (matrixOf(id) !== matrix) continue
      for (const npc of npcsOf(id)) {
        if (!OBSTACLE_SPRITES.has(npc.sprite)) continue
        standingObstacles.add(`${String(matrix)}:${String(npc.x)},${String(npc.z)}`)
      }
    }
  }
  /** 이 맵의 장애물 중 **이미 치운 것**을 지운다. 물을 수 있는 건 선 맵뿐이다 */
  const askObstacles = async (mapId) => {
    seedObstacles(matrixOf(mapId))
    if (obstaclesAsked.has(mapId)) return
    obstaclesAsked.add(mapId)
    for (const npc of npcsOf(mapId)) {
      if (!OBSTACLE_SPRITES.has(npc.sprite)) continue
      const r = await obs.obstacleAt(npc.x, npc.z)
      // 못 읽으면 **표를 믿는다** — 모르는 채로 뚫고 가는 길을 내느니 돌아간다
      if (r.known && r.value === null) obstacleGone(mapId, npc.x, npc.z)
    }
  }
  /** 그 칸의 장애물을 치웠다 — 다음 계획부터 지나갈 수 있다 */
  const obstacleGone = (mapId, x, z) => {
    standingObstacles.delete(`${String(matrixOf(mapId))}:${String(x)},${String(z)}`)
  }

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

  /**
   * **물을 길로 칠 것인가** (`setSurf`). 파도타기를 배운 뒤 물을 건너야 하는 다리만
   * 켠다 — 켜 두면 계획이 물을 지름길로 잡아 쓸데없이 물에 들었다 나왔다 한다
   */
  let surfMode = false
  /** 파도타기를 시작한 기록. 결과에 적는다 */
  const surfLog = []

  const planned = (matrix, from, isGoal, opts, why) => {
    const r = planPath(matrix, from, isGoal, { surf: surfMode, ...opts })
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
  /** 최근에 누른 키 — 약을 못 본 순간 **직전 입력**을 남기려고 둔다 */
  const recentKeys = []
  const tap = async (key, hold = 70) => {
    recentKeys.push({ key, at: Date.now() })
    if (recentKeys.length > 12) recentKeys.shift()
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

  /**
   * 관측 하나를 **진행 지문**으로 접는다 (지시서 H1).
   *
   * ⚠️ **여기 든 것이 곧 「진행」의 정의다.** 지시서가 못 박은 넷이다 — 칸,
   * 맵, 장면이 열리고 닫힘(대사·스크립트·배틀), 그리고 부르는 쪽이 넘기는
   * 남은 계획 길이. 이 밖의 것을 넣으면 안 된다: 예컨대 누른 횟수를 넣으면
   * **언제나 진행 중**이 되어 견딤이 영영 안 찬다
   *
   * @param extra 부르는 쪽의 진행 값 (남은 걸음 수 따위)
   */
  const beat = (s, extra = '') => [
    s.map, s.x, s.z, s.scene, s.talk ? 't' : '-', s.script ? 's' : '-',
    s.battle ?? '-', s.restoring ?? '-', extra,
  ].join('|')

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
  /**
   * **배틀 안에서 회복 도구를 쓸까** (지시서 §13.5의 3번).
   *
   * 기본은 **끈 상태**다 — 아무 배틀에서나 약을 쓰면 판마다 가방이 달라져
   * 배틀을 견줄 수 없다. 관장전처럼 **사람이 약을 쓰는 자리**에서만 켠다
   * (`usePotions`). 켠 자리를 벗어나면 다시 끈다
   */
  const potion = {
    item: null, name: null, floor: 0, left: 0, used: 0, why: '', misses: [], uses: [],
    /**
     * 실제로 커서를 어느 줄에 놓았는가 (지시서 R7).
     *
     * 화면 줄 번호와 세이브 가방 순번을 **따로** 적는다 — 둘이 같다고 믿은 것이
     * 옛 결함이었다 (`maybePotion`)
     */
    rows: [],
    /** 마지막으로 못 본 배틀 턴 — **같은 턴에는 다시 안 간다** */
    missTurn: null,
  }
  const usePotions = (item, name, floor, count) => {
    potion.item = item; potion.name = name; potion.floor = floor
    // ⚠️ **쓴 횟수는 안 지운다.** 관장 재도전에서 다시 켜므로, 지우면 보고서가
    // 「한 판에 몇 번 썼나」를 마지막 배틀 것만 적는다. 남은 개수는 가방이 답한다
    potion.left = count
    potion.why = ''
  }
  const stopPotions = () => { potion.item = null; potion.name = null; potion.floor = 0; potion.left = 0 }

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
      /**
       * ⚠️ **글로 찾지 않는다 — 화면이 이미 갈라 놓은 것을 읽는다.**
       *
       * 예전에는 「이 포켓몬을 내보낸다」·「싸울 수 없다」·「이미 나와 있다」 셋을
       * 찾았고 주석에 "우리 안내문이라 롬 대사가 아니다"라고 적혀 있었다.
       * **지금은 아니다** — 그 자리의 글은 롬 뱅크 3에서 온다
       * (`ui/battle/SwitchScreen`의 `banner`). 실측(2026-09-16)으로 한국어 줄은
       * 「이미 배틀에 나가 있습니다」와 「싸우기 위한 기력이 남아있지 않습니다!」라,
       * 찾던 셋은 **어느 화면에도 없다.** 즉 이 함수는 늘 거짓을 돌려주고 있었다.
       *
       * 파티가 한 마리인 동안에는 교체 화면이 안 떠서 안 드러났다. 잡아서 둘이
       * 되는 순간부터는 앞의 마리가 쓰러질 때마다 이 화면이 뜨고, 커서는
       * **쓰러진 그 마리**에 놓여 있다 — 거기서 결정을 눌러 봐야 아무 일도 없다.
       *
       * 그래서 **고를 수 있는 칸**을 누른다. 화면이 `disabled`로 이미 갈라 두었다
       * (`ui/battle/PartyCards`의 `can`). 칸은 「Lv.」이 붙은 단추뿐이라 기술
       * 칸(`12/25`)과 안 헷갈린다
       */
      const cards = page.locator('button').filter({ hasText: /Lv\./ })
      const n = await cards.count()
      if (n === 0) return false
      for (let i = 0; i < n; i++) {
        const card = cards.nth(i)
        if (await card.isDisabled().catch(() => true)) continue
        await card.click({ timeout: 3000 }).catch(() => {})
        return true
      }
      // 고를 수 있는 칸이 하나도 없다 — 전멸이다. 넘겨서 끝낸다
      await tap('Space', 60)
      return true
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

    /**
     * **「새 기술을 배우겠는가」에 정해진 규칙으로 답한다** (`ui/battle/LearnMove`).
     *
     * ⚠️ **이 화면을 모르면 배틀이 영영 안 끝난다.** 실측(`_wild42`, 2026-09-16):
     * 모부기가 17레벨에서 저주를 배우려 하자 화면에 **잊을 기술 네 칸**이 떴고,
     * `pickMove`가 그 칸을 기술 고르기로 읽어 **121초 · 800탭** 동안 같은 자리를
     * 눌렀다. 그 판의 트레이너전은 8~13초에 끝났으니 느린 것이 아니라
     * **그 물음에 아무도 답하지 않은 것**이다.
     *
     * **규칙 — 위력이 가장 낮은 기술을 잊는다.** 같으면 앞 칸이고, 새 기술이 더
     * 세지 않으면 안 배운다. 변화 기술의 위력은 0이다.
     *
     * ⚠️ **예전에는 늘 「안 배운다」였다.** 판마다 파티를 같게 하려던 것인데,
     * 그 대가로 수풀부기가 L21 물기를 흘려보내고 풀 기술만 들고 유채(풀 셋)에게
     * 갔다 — journey13에서 첫 도전·재도전 모두 졌다(지시서 §13.4). 규칙이
     * **고정**이면 판마다 파티는 여전히 같으므로 견주기는 그대로 유지된다.
     *
     * ⚠️ **화면 글자를 위력으로 읽지 않는다.** 이름을 게임의 기술표에 물어보고,
     * 한 칸이라도 못 읽으면 **손대지 않고** 예전처럼 안 배운다 — 모르는 것을
     * 0으로 접으면 제일 좋은 기술을 잊는다
     */
    const forgetPick = async () => {
      const rows = page.locator('button').filter({ hasText: /\d+\s*\/\s*\d+/ })
      const n = await rows.count()
      if (n === 0) return null
      // 새 기술의 이름은 「그만둔다」 칸의 작은 줄에 그대로 적혀 있다
      const stop = page.locator('button').filter({ hasText: '그만둔다' }).first()
      const sub = (await stop.innerText().catch(() => '')).replace(/\s+/g, ' ')
      const fresh = /(\S+)을\(를\) 안 배운다/.exec(sub)
      if (fresh === null) return null
      const names = []
      for (let i = 0; i < n; i++) {
        names.push((await rows.nth(i).innerText()).split(/\r?\n/)[0].trim())
      }
      const read = await obs.movePower([...names, fresh[1]])
      if (!read.known || !Array.isArray(read.value)) return null
      const power = read.value
      const gain = power[power.length - 1]
      if (typeof gain !== 'number') return null
      let at = -1
      for (let i = 0; i < names.length; i++) {
        if (typeof power[i] !== 'number') return null
        if (at < 0 || power[i] < power[at]) at = i
      }
      return at >= 0 && power[at] < gain ? { at, was: names[at], now: fresh[1] } : null
    }

    const answerLearnMove = async () => {
      const seen = (text) => page.locator('button').filter({ hasText: text }).count()
      // 세 단은 화면의 **다른 칸**으로 갈린다 (`LearnMove`의 `Stage`)
      const ask = await seen('기술 하나를 잊는다') > 0
      const giveUp = await seen('다시 고른다') > 0
      const forget = !ask && !giveUp && await seen('그만둔다') > 0
      if (!ask && !giveUp && !forget) return false
      /**
       * ⚠️ **누르지 말고 키로 답한다.** 실측(`_wild42`, 2026-09-16): 칸을
       * `click()`으로 고르면 **3초씩 통째로 시간이 나가고** 화면은 그대로다 —
       * 40번을 그렇게 눌러 122초를 썼다. 대사가 아직 흐르는 동안은 그 칸이
       * 눌릴 자리에 안 서 있다는 뜻이다. 사람은 키로 답하고, 키는 먹는다.
       *
       * 커서는 **안 돌아간다** (`clampCursor`) — 첫 칸에서 시작해 아래로만 간다
       */
      if (ask) await tap('Space', 120)                                   // 예
      else if (giveUp) { await tap('ArrowDown', 60); await tap('Space', 120) } // 다시 고른다
      else {
        const pick = await forgetPick()
        if (pick === null) {
          for (let i = 0; i < 5; i++) await tap('ArrowDown', 40)
          await tap('Space', 120)
          learnKept++
        } else {
          for (let i = 0; i < pick.at; i++) await tap('ArrowDown', 40)
          await tap('Space', 120)
          learnTaught.push(`${pick.was}→${pick.now}`)
        }
      }
      learnAsks++
      return true
    }

    /**
     * **약이 필요하면 쓴다** (지시서 §13.5의 3번 · `usePotions`로 켠 자리에서만).
     *
     * 길은 볼 던지기와 같다 — 명령 단 → 가방 → 그 약이 보이는 주머니 → 첫 줄 →
     * 「누구에게?」의 첫 칸. 사람이 하는 그 길이고 뒷문은 없다.
     *
     * ⚠️ **약은 턴을 쓴다.** 원작과 같다 — 쓴 턴에는 공격하지 않는다. 그래서
     * 문턱을 낮게 잡는다(체력이 그 몫 아래로 떨어질 때만).
     *
     * ⚠️ **첫 줄만 누르지 않는다** (지시서 R7).
     *
     * 예전에는 세이브 가방의 순번(`bagState().items[].row`)이 0이 아니면
     * `potion.left = 0`으로 그 판의 약을 통째로 포기했다. 그런데 그 순번은
     * **화면 줄 번호가 아니다** — 배틀 가방은 `battlePocket` 비트로 다시 거르고
     * 쪽까지 나눈다 (`ui/battle/BattleBag`). 그래서 약이 정말 둘째 줄이든,
     * 거르고 나니 첫 줄이든 똑같이 포기했다.
     *
     * 지금은 **화면에서** 그 도구의 줄을 찾아 방향키로 옮기고, 고른 줄의 도구
     * 번호가 맞는지 확인한 뒤에 결정한다. 못 찾으면 안 쓰고 까닭을 남긴다 —
     * 첫 줄의 다른 도구를 잘못 쓰지 않는 보호는 그대로다
     */
    /**
     * **명령 단(싸운다·가방·포켓몬·도망친다)이 서 있나.**
     *
     * ⚠️ **「싸운다」가 든 칸으로 찾으면 안 된다.** 시합규칙 「교체」 물음의
     * 「아니오」 칸 밑줄이 **「그대로 싸운다」**다(`BattleScreen`의 `YesNo`). 상대가
     * 쓰러진 뒤 그 물음이 뜬 채로 선두 체력이 문턱 아래면 옛 판정은 그것을 명령
     * 단으로 읽었고, ↓ 결정이 **「예」(교체)**를 골라 교체 화면이 열렸다 — 약 줄이
     * 안 보이는 것이 당연했다. 관장의 둘째·셋째 마리 앞에서만 난 까닭이다
     * (journey20·21 · 지시서 JOURNEY21_NEXT_DECISIONS §6).
     * 그래서 **칸의 첫 낱말**로 본다 — 「싸운다」와 「가방」이 둘 다 칸 머리에 있어야 한다
     */
    const buttonTexts = async () => (await page.locator('button').allInnerTexts())
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter((t) => t !== '' && !t.startsWith('FPS'))
    const commandReady = (texts) => texts.some((t) => t.startsWith('싸운다'))
      && texts.some((t) => t.startsWith('가방'))
    const maybePotion = async () => {
      if (potion.item === null || potion.left <= 0) return false
      /**
       * ⚠️ **배틀 중 체력은 `partyState`가 아니라 배틀에게 묻는다.** `saveStore`의
       * 파티는 배틀이 끝나야 바뀐다 — 실측(journey16)에서 그 값이 만피 그대로라
       * 문턱이 한 번도 안 걸렸고, 산 약 넷을 하나도 못 썼다
       */
      const me = await obs.battleHp()
      if (!me.known || me.value === null) return false
      const { hp, max, fainted } = me.value
      if (fainted || typeof hp !== 'number' || typeof max !== 'number') return false
      if (hp <= 0 || hp > max * potion.floor) return false
      const moment = await obs.battleMoment()
      const turn = moment.known ? moment.value?.turn ?? null : null
      // 못 본 그 턴에는 다시 손대지 않는다 — 입력이 한 턴에 쌓이면 무엇이 먹었는지 모른다
      if (turn !== null && potion.missTurn === turn) return false
      const bag = await obs.bagState()
      const mine = bag.known ? (bag.value?.items ?? []).find((one) => one.item === potion.item) : null
      if (!mine) { potion.why = '가방에 그 약이 없다'; potion.left = 0; return false }
      const panel = buttonTexts
      /**
       * ⚠️ **명령 단이 이미 서 있을 때만 손을 댄다.** 기다리면서 Space를 누르면
       * 기술 고르기 화면에서 **아무 기술이나 골라 버린다** — 약을 쓰려다 턴을
       * 엉뚱하게 쓴다. 안 서 있으면 물러나고, 바깥 바퀴가 다시 부른다
       */
      const before = await panel()
      if (!commandReady(before)) return false
      /**
       * ⚠️ **가방이 잠긴 턴에는 손을 안 댄다** (앙코르·참기 — 원작도 그 턴은 기술뿐이다).
       * 실측(2026-09-24 대표 구간 12판): 커서를 잠긴 가방으로 내리고 결정을 눌렀는데
       * 아무 일도 없었고, 기술 고르기는 명령 창에서 안 움직이므로 바깥 바퀴가 그 자리에서
       * Space만 800번 눌렀다 — 턴이 안 넘어가니 잠금도 안 풀린다. 커서를 안 옮기면
       * 그 Space가 「싸운다」를 연다
       */
      if (before.some((t) => t.startsWith('가방') && t.includes('쓸 수 없다'))) {
        potion.missTurn = turn
        return false
      }
      const t0 = Date.now()
      await tap('ArrowDown', 90)
      await tap('Space', 150)
      const rowUp = async (rounds) => {
        for (let i = 0; i < rounds; i++) {
          if ((await panel()).some((t) => t.includes(potion.name))) return true
          await page.waitForTimeout(200)
        }
        return false
      }
      const ready = await rowUp(50)
      /**
       * **화면이 지금 보여 주는 회복 주머니.** 제품이 줄마다 적어 두는 읽기 전용
       * 표시를 그대로 읽는다 (`ui/battle/BattleBag`의 `data-item-*`) — 스토어를
       * 직접 집지 않는다
       */
      const bagRows = async () => page.evaluate(() => {
        const list = document.querySelector('[data-battle-bag="items"]')
        if (list === null) return null
        return {
          pocket: Number(list.getAttribute('data-pocket')),
          cursor: Number(list.getAttribute('data-cursor')),
          total: Number(list.getAttribute('data-items')),
          rows: [...list.querySelectorAll('[data-item-id]')].map((el) => ({
            item: Number(el.getAttribute('data-item-id')),
            row: Number(el.getAttribute('data-item-row')),
            count: Number(el.getAttribute('data-item-count')),
            on: el.getAttribute('aria-selected') === 'true',
            label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          })),
        }
      }).catch(() => null)
      /**
       * ⚠️ **한 번 못 봤다고 그 판의 약을 끊지 않는다.** 그 순간 **무슨 화면이었는지**를
       * 넉넉히 적고, 세 번 못 볼 때까지는 **다음 턴에** 다시 간다. 세 번은 재시도
       * 정책이지 고쳤다는 판정이 아니다.
       *
       * ⚠️ 못 봤을 때 ←→로 주머니를 넘겨 보지 않는다 — 가방이 아닌 화면(교체 목록)에서
       * 그 키는 커서를 옮기고, 입력만 쌓인다
       */
      if (!ready) {
        const saw = await panel()
        const marks = await page.evaluate(() => ({ ...document.documentElement.dataset })).catch(() => null)
        const after = await obs.battleMoment()
        let shot = null
        if (shotDir !== null) {
          shot = `${shotDir}/potion-miss-${String(potion.misses.length + 1)}.png`
          await page.screenshot({ path: shot }).catch(() => { shot = null })
        }
        potion.misses.push({
          used: potion.used, ms: Date.now() - t0,
          hp, max, turn,
          before: before.slice(0, 8), screen: saw.slice(0, 12),
          momentBefore: moment.known ? moment.value : `관측 불가 (${String(moment.why)})`,
          momentAfter: after.known ? after.value : `관측 불가 (${String(after.why)})`,
          scene: marks?.scene ?? null, menu: marks?.menu ?? null,
          item: { id: potion.item, count: mine.count, row: mine.row, pocket: mine.pocket },
          keys: recentKeys.map((k) => `${k.key}@${String(k.at - t0)}`),
          shot,
        })
        potion.missTurn = turn
        potion.why = `가방 화면에 ${String(potion.name)}이(가) 안 보인다`
          + ` (${String(potion.misses.length)}번째 · 화면 ${JSON.stringify(saw.slice(0, 4))})`
        if (potion.misses.length >= 3) potion.left = 0
        // 명령 단이 다시 설 때까지만 물러난다 — 거기서 멈춘다
        for (let i = 0; i < 4; i++) {
          const now2 = await panel()
          if (commandReady(now2) || (await now()).scene !== 'battle') break
          await tap('KeyX', 120)
          await page.waitForTimeout(150)
        }
        return false
      }
      /**
       * 목표 도구가 선 줄까지 커서를 옮긴다.
       *
       * ⚠️ **줄 수를 세어 누르고 끝내지 않는다.** 누른 뒤에 고른 줄의 도구 번호를
       * 다시 읽어 맞는지 본다 — 쪽이 넘어가거나 목록이 줄면 세어 둔 수가 어긋난다.
       * 안 맞으면 결정을 **안 누르고** 물러난다
       */
      const backOff = async () => {
        for (let i = 0; i < 4; i++) {
          if (commandReady(await panel()) || (await now()).scene !== 'battle') break
          await tap('KeyX', 120)
          await page.waitForTimeout(150)
        }
        potion.missTurn = turn
        return false
      }
      const seen = await bagRows()
      if (seen === null) {
        potion.why = '회복 주머니 목록을 못 읽었다'
        return backOff()
      }
      const started = seen.cursor
      /**
       * 한 줄씩 내려가며 **선 줄의 도구 번호**를 본다.
       *
       * ⚠️ **쪽이 넘어간다.** 한 쪽이 여섯 줄이라(`BattleBag`의 `PER_PAGE`) 일곱째
       * 도구는 지금 화면에 아예 없다 — 「보이는 줄에서 찾기」로는 못 집는다.
       * 커서가 더 안 내려가면 목록 끝이므로 거기서 멈춘다
       */
      let stood = seen.rows.find((r) => r.on) ?? null
      let where = seen.cursor
      for (let i = 0; i <= (Number.isFinite(seen.total) ? seen.total : 40); i++) {
        if (stood !== null && stood.item === potion.item) break
        await tap('ArrowDown', 70)
        const next = await bagRows()
        if (next === null) { stood = null; break }
        if (next.cursor === where) { stood = next.rows.find((r) => r.on) ?? null; break }
        where = next.cursor
        stood = next.rows.find((r) => r.on) ?? null
      }
      if (stood === null || stood.item !== potion.item) {
        potion.why = `커서가 ${String(potion.name)} 줄에 안 섰다`
          + ` (선 줄 ${JSON.stringify(stood?.label ?? null)} · ${String(seen.total)}종)`
        return backOff()
      }
      const seat = stood
      const cursorAt = started
      // 화면 줄 번호와 세이브 순번을 **따로** 적는다. 둘이 어긋나는 것이
      // 이 고침의 전부라, 다음에 또 어긋나면 기록에서 바로 보인다
      potion.rows.push({
        turn, item: potion.item, screenRow: seat.row, saveRow: mine.row,
        from: cursorAt, pocket: seen.pocket, total: seen.total,
      })
      await tap('Space', 250)   // 그 약
      await tap('Space', 250)   // 「누구에게?」 첫 칸 — 선두
      potion.left--
      potion.used++
      /**
       * 턴이 끝날 때까지 넘기면서 **체력의 제일 높은 값**을 같이 본다.
       *
       * ⚠️ **끝값만 보면 「안 나았다」로 적힌다.** 약은 턴을 쓰므로 **같은 턴에 상대가
       * 때린다** — 실측(2026-09-17 `_potion42 --drive`): 쓴 값까지 찼다가 맞아서 그
       * 아래로 끝난 턴이 있다
       */
      let peak = hp
      for (let i = 0; i < 60; i++) {
        const r = await obs.battleHp()
        const v = r.known && r.value !== null ? r.value.hp : null
        if (typeof v === 'number' && v > peak) peak = v
        const s2 = await now()
        if (s2.scene !== 'battle') break
        if (commandReady(await panel())) break
        await tap('Space', 90)
      }
      const bag2 = await obs.bagState()
      const left2 = bag2.known ? (bag2.value?.items ?? []).find((one) => one.item === potion.item)?.count ?? 0 : null
      potion.uses.push({
        turn, hp, max,
        hpPeak: peak,
        count: mine.count, countAfter: left2,
        spent: left2 === null ? null : mine.count - left2,
      })
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
      // ⚠️ **기술 배우기 물음이 제일 먼저다.** 그 화면에도 PP가 붙은 칸 넷이
      // 떠서, 뒤에 두면 `pickMove`가 그것을 기술 고르기로 읽고 영영 누른다
      if (await answerLearnMove()) continue
      // 파티 목록이 떠 있으면 **고를 수 있는 마리로 커서를 옮긴 뒤** 결정한다.
      // ⚠️ **기술 고르기보다 먼저다** — 그 화면의 오른쪽 판에도 상성 글이 뜬다
      if (await pickFighter()) continue
      // 약은 기술보다 **먼저** 본다 — 쓰면 그 턴을 쓴 것이라 공격과 겹치면 안 된다
      if (await maybePotion()) continue
      if (await pickMove()) continue
      await tap('Space')
    }
    stuckFights++
    /**
     * ⚠️ **「안 끝났다」만 적으면 다음 판도 똑같이 선다.** 실측(2026-09-24
     * `journey-from30` 둘째 판): 209번도로 (561,686)의 트레이너전이 안 끝났고
     * 그 뒤 모든 단계가 「진행이 없다」였는데, 화면도 배틀 상태도 안 남아 무엇을
     * 묻고 있었는지 못 봤다. 그래서 그 순간의 **그림 · 배틀 가게의 단계 · 보이는
     * 단추 글**을 남긴다
     */
    const stuckShot = `shots/journey/stuck-battle-${String(stuckFights)}.png`
    await page.screenshot({ path: stuckShot }).catch(() => {})
    const moment = await obs.battleMoment().catch(() => null)
    const buttons = await page.locator('button:visible').allInnerTexts().catch(() => [])
    const said = await page.evaluate(() => document.querySelector('[data-battle-text], [role="log"]')?.textContent ?? null).catch(() => null)
    log(`    배틀이 안 끝났다 — 그림 ${stuckShot} · 단계 ${JSON.stringify(moment?.value ?? moment)}`
      + ` · 단추 ${JSON.stringify(buttons.map((t) => t.replace(/\s+/g, ' ').slice(0, 40)).slice(0, 12))}`
      + `${said ? ` · 글 ${JSON.stringify(said.slice(0, 120))}` : ''}`)
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
    /**
     * ⚠️ **관성이 죽기를 기다린다.** 70ms였고, 그것이 문으로 새는 두 번째 길이었다.
     *
     * 손을 떼면 속도가 `exp(−12t)`로 죽는다(`actor/player`의
     * `velocity.lerp(desired, 1 − exp(−12dt))`). 70ms 뒤에도 **43%**가 남아 있고,
     * 다음 다리가 다른 방향이면 그 나머지가 **대각선 미끄러짐**이 되어 주인공을
     * 계획에 없는 옆 칸으로 밀어 넣는다 — 실측(2026-09-22)으로 그렇게 밀려간 칸이
     * 약초가게 문 앞이었고 그대로 가게 안이었다.
     *
     * 250ms면 `exp(−3)` ≈ 5%다. 걸어서 남는 미끄러짐이 **0.02칸**,
     * 자전거 4단(4배)에서도 0.075칸이라 칸을 못 넘는다
     */
    await page.waitForTimeout(250)
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
  /**
   * **문 앞 칸에 문을 향해 들어서는 걸음을 막는다** (지시서 §1.1).
   *
   * ⚠️ **칸을 피하는 것으로는 못 막는다.** 계획은 문 **칸**을 이미 빼고 있는데도
   * 실측 3판(2026-09-22 `_cyn42`)이 셋 다 건물 안에 들어갔다. 우리 문은 밟는
   * 칸이 아니라 **마주 보고 미는 앞 칸**이고(`map/world`의 `doorEntry`), 그
   * 판정은 **지금 눌려 있는 키**를 프레임마다 본다 — 문 앞 칸에 발을 들이는
   * 그 프레임에 이미 문이 열린다.
   *
   * 마지막 판은 **조용한 기계**에서 났다 (표본 간격 150~170ms · 멎은 구간 없음):
   * (305,532)→(305,531)로 북쪽 한 칸을 딛자 포켓몬센터(69) 안이었다. 칸이 바뀐
   * 것을 보고 손을 떼는 `stepOnce`로는 늦는다 — 폴링 한 바퀴가 한 프레임보다
   * 짧을 수 없다. 그래서 **손이 아니라 길**을 고친다: 같은 칸이라도 옆에서
   * 들어서면 문을 안 보므로 그대로 지나간다.
   *
   * **제품 결함이 아니다** — 사람도 그 칸을 북쪽으로 걸으면 센터에 들어간다.
   * 원작도 걸음 끝에 눌린 키를 본다 (`FieldInput` 166줄). 잘못 걸은 쪽은 우리다
   *
   * @param except 일부러 들어갈 문들. 그 앞 칸은 안 막는다 — 안 빼면
   *   **들어가려는 문 앞에도 못 서서** 어느 문으로도 못 들어간다
   */
  const banCache = new Map()
  const doorStepBan = (mapId, except = []) => {
    if (except.length === 0) {
      const hit = banCache.get(mapId)
      if (hit !== undefined) return hit
    }
    const g = gridOf(matrixOf(mapId))
    const ban = new Set()
    for (const w of warpsOf(mapId)) {
      // 밟는 워프(계단·워프판)는 **미는 것이 아니다** — 그쪽은 `avoid`가 뺀다
      if (!g.blocked(w.x, w.z)) continue
      if (except.some((e) => e.x === w.x && e.z === w.z)) continue
      for (const [key, [dx, dz]] of Object.entries(STEPV)) {
        ban.add(`${String(w.x - dx)},${String(w.z - dz)},${key}`)
      }
    }
    if (except.length === 0) banCache.set(mapId, ban)
    return ban
  }
  /** 위 목록을 `planPath`의 `avoidStep` 모양으로 */
  const noDoorStep = (mapId, except = []) => {
    const ban = doorStepBan(mapId, except)
    return (x, z, key) => ban.has(`${String(x)},${String(z)},${key}`)
  }

  /**
   * **문에서 한 칸 떨어져 걷는다** — 문 앞 칸 넷을 계획에서 아예 뺀다.
   *
   * ⚠️ **걸음 금지(`doorStepBan`)만으로는 안 닫힌다.** 그것은 **계획한 칸**에만
   * 걸리는데, 우리 걸음이 연속이라 **몸이 계획 밖 칸으로 간다**. 실측
   * (2026-09-22 · 약초가게 81): 계획은 317열로 북상하는 것이었는데 밟은 칸이
   * `… 317,523 → 316,523 → 316,522`였다 — 서쪽 키를 떼고 북쪽을 누르는 사이
   * 서쪽 관성이 남아 **대각선으로 흘러** 한 열 옆으로 밀렸고, 그 칸이 하필
   * 약초가게 문 (316,521) 앞이었다.
   *
   * 그래서 문 둘레에 **한 칸을 비우고** 걷는다. 밀려도 문 앞에 닿으려면 온 칸
   * 하나를 가야 하는데, 손을 뗀 뒤 남는 미끄러짐은 0.02칸이다(`runKeys` 꼬리).
   *
   * ⚠️ **길이 그것뿐이면 놓는다.** 부르는 쪽이 이 규칙을 **먼저** 걸어 보고,
   * 못 가면 빼고 다시 계획한다 — 안 그러면 골목 안 가게에 영영 못 들어간다
   *
   * @param except 일부러 들어갈 문들. 그 앞은 안 비운다
   */
  const berthCache = new Map()
  const doorBerth = (mapId, except = []) => {
    if (except.length === 0) {
      const hit = berthCache.get(mapId)
      if (hit !== undefined) return hit
    }
    const g = gridOf(matrixOf(mapId))
    const out = new Set()
    for (const w of warpsOf(mapId)) {
      if (!g.blocked(w.x, w.z)) continue
      if (except.some((e) => e.x === w.x && e.z === w.z)) continue
      for (const [dx, dz] of Object.values(STEPV)) {
        out.add(`${String(w.x + dx)},${String(w.z + dz)}`)
      }
    }
    if (except.length === 0) berthCache.set(mapId, out)
    return out
  }

  /** 막힌 걸음의 까닭 기록. 판정에는 안 쓰고 증거로만 남긴다 */
  const blockNotes = []
  /** 마지막 `runKeys`가 왜 끝났나 — `arrived`·`stalled`·`scene`·`deadline` */
  let lastRun = { why: null, ms: 0, key: null, count: 0 }

  /**
   * **한 칸만 딛는다** — 키를 잡고 있지 않는다.
   *
   * ⚠️ **문 앞의 마지막 한 칸은 잡고 가면 안 된다.** 실측(2026-09-22 `_cyn42`):
   * 영원시티 (305,532)에서 북쪽 한 칸을 잡고 가는데 페이지가 **2초 멎었고**, 풀리는
   * 순간 잡혀 있던 키가 (305,531)을 지나 문 (305,530)을 밀어 포켓몬센터에 들어갔다 —
   * 그 앞 판(`_cut42`)도 같은 모양으로 약초가게에 들어갔다. 멎은 것은 기계지만
   * (다른 프로젝트의 e2e가 같은 CPU를 쓴다) 잡고 있는 손은 우리 것이다. 칸이
   * 바뀐 것을 보는 즉시 손을 떼고, 멈춰 서기를 기다린다
   */
  const stepOnce = async (key, want) => {
    lastKeyAt = Date.now()
    const cap = Date.now() + 1_500
    await page.keyboard.down(key)
    let at = null
    let why = 'deadline'
    while (Date.now() < cap) {
      at = await now()
      if (at.talk || at.scene !== 'overworld') { why = 'scene'; break }
      if (at.x === want.x && at.z === want.z) { why = 'arrived'; break }
      await page.waitForTimeout(15)
    }
    await page.keyboard.up(key)
    // 칸 중심까지 마저 걷기를 기다린다 — 다음 계획이 반 칸에서 시작하면 안 된다
    await page.waitForTimeout(260)
    at = await now()
    lastRun = { why, ms: Date.now() - lastKeyAt, key, count: 1 }
    return at
  }

  /**
   * **파도타기를 시작한다** — 사람이 하는 길 그대로: 물 쪽으로 돌아서서 A →
   * 「파도타기를 쓰겠습니까?」 예 (`FieldMoves_Water` → `UseSurf`).
   *
   * 물은 파도타기가 아니면 막혀 있어서 방향키를 눌러도 제자리에서 돌기만 한다
   * (`actor/player`의 제자리 돌기). 탔는지는 글이 아니라 `fieldState.surfing`으로 본다
   */
  const surfStart = async (key) => {
    const t0 = Date.now()
    const before = await now()
    await tap(key, 80)
    await settle()
    await tap('Space', 400)
    await clearTalk()
    let on = false
    for (let i = 0; i < 50 && !on; i++) {
      const f = await obs.fieldState()
      on = f.known && f.value?.surfing === true
      if (!on) await page.waitForTimeout(100)
    }
    // 물 칸으로 뛰어오르는 동안 기다린다 — 도착 칸에서 다음 계획을 세운다
    await page.waitForTimeout(700)
    const after = await now()
    const row = {
      ok: on, key, from: { map: before.map, x: before.x, z: before.z },
      to: { map: after.map, x: after.x, z: after.z }, ms: Date.now() - t0,
    }
    surfLog.push(row)
    log(`      파도타기 ${on ? '탔다' : '못 탔다'} (${String(before.x)},${String(before.z)}) ${key}`)
    return row
  }

  /**
   * 걸음 목록에서 **뭍에서 물로 드는 첫 걸음**의 번호. 없으면 -1.
   * 다리 위는 땅으로 친다(`waterAt`)
   */
  const waterEntry = (keys, from, matrix) => {
    let x = from.x
    let z = from.z
    for (let i = 0; i < keys.length; i++) {
      const [dx, dz] = STEPV[keys[i]]
      const wet = waterAt(matrix, x + dx, z + dz)
      if (wet && !waterAt(matrix, x, z)) return i
      x += dx
      z += dz
    }
    return -1
  }

  /**
   * 걸음을 밟는다. ⚠️ **파도타기 다리에서는 물에 들기 직전에 끊는다** — 거기까지
   * 걷고, 물 쪽으로 돌아서 파도타기를 쓰고, 돌려준다. 나머지는 부르는 쪽이 물 위에서
   * 다시 계획한다(`goTo`는 바퀴마다 다시 계획한다)
   */
  const walk = async (keys, from, mapId, shun = null) => {
    if (surfMode) {
      const cut = waterEntry(keys, from, matrixOf(mapId))
      if (cut >= 0) {
        if (cut > 0) {
          const dry = await walkSteps(keys.slice(0, cut), from, mapId, shun)
          if (dry !== 'done') return dry
        }
        const f = await obs.fieldState()
        if (!(f.known && f.value?.surfing === true)) {
          const got = await surfStart(keys[cut])
          if (!got.ok) return 'blocked'
        }
        return 'done'
      }
    }
    return walkSteps(keys, from, mapId, shun)
  }

  const walkSteps = async (keys, from, mapId, shun = null) => {
    const doors = warpsOf(mapId)
    for (const leg of runs(keys, from)) {
      const legT0 = Date.now()
      /**
       * ⚠️ **다음 칸이 문이면 마지막 한 칸은 잡지 않고 딛는다** (`stepOnce`). 문은
       * 마주 보고 미는 것이라(`map/world`의 `doorEntry`) 한 칸만 지나쳐도 건물 안이다.
       * 계획은 문 칸을 피하지만 손을 떼는 것은 폴링이라, 기계가 멎으면 지나친다
       */
      const [ldx, ldz] = STEPV[leg.key]
      const beyond = { x: leg.want.x + ldx, z: leg.want.z + ldz }
      const doorAhead = doors.some((w) => w.x === beyond.x && w.z === beyond.z)
      let at
      if (doorAhead) {
        if (leg.count > 1) {
          const shy = { x: leg.want.x - ldx, z: leg.want.z - ldz }
          at = await runKeys(leg.key, leg.count - 1, shy)
          if (at !== null && at.scene === 'overworld' && !at.talk && at.map === mapId
            && at.x === shy.x && at.z === shy.z) {
            at = await stepOnce(leg.key, leg.want)
          }
        } else at = await stepOnce(leg.key, leg.want)
      } else at = await runKeys(leg.key, leg.count, leg.want)
      const legMs = Date.now() - legT0
      if (at === null) return 'unknown'
      if (at.scene === 'battle') return 'battle'
      if (at.talk || at.scene === 'menu') return 'talk'
      if (at.scene !== 'overworld') return 'scene'
      if (at.map !== mapId) return 'warped'
      if (at.x !== leg.want.x || at.z !== leg.want.z) {
        // ⚠️ **막은 칸은 「가려던 끝」이 아니라 「멈춘 자리 바로 앞」이다.**
        // 한 방향을 다섯·여섯 칸씩 몰기 때문에, 끝 칸을 물으면 **엉뚱한 칸**을
        // 보고 엉뚱한 칸을 기피에 넣는다. 실측(2026-09-17 `_leg42`): 영원의
        // 숲(202)에서 215,566에 멈췄는데 220,566을 기피에 넣어 매번 같은
        // 216을 다시 계획했다 — 같은 걸음을 20분 동안 되풀이했다
        const [bdx, bdz] = STEPV[leg.key]
        const stop = { x: at.x + bdx, z: at.z + bdz }
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
          stop,
          grid: grid0(mapId, stop.x, stop.z),
          // ⚠️ **게임에게 직접 묻는다.** 우리 격자와 다르면 그것이 원인이다
          game: await (async () => {
            const r = await obs.blockedAt(stop.x, stop.z)
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
            const r = await obs.solidAt(stop.x + 0.5, stop.z + 0.5)
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
            + ` · 막은 칸 ${String(stop.x)},${String(stop.z)}`
            + ` · 우리격자 ${grid0(mapId, stop.x, stop.z) ? '막힘' : '열림'}`
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
        shun?.add(`${String(stop.x)},${String(stop.z)}`)
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
    /**
     * **그만두는 자는 시계가 아니라 진행이다** (지시서 H1).
     *
     * ⚠️ **벽시계 900초는 기계가 붐비면 게임을 잘못 고발한다.**
     * 실측(2026-09-09): 다른 프로세스와 CPU를 나눠 쓰기 시작하자 그전까지
     * 통과하던 축복시티 구간이 「시간이 다 됐다」로 떨어졌다 — 게임은 한 줄도
     * 안 바뀌었다. 진행이 있으면 얼마가 걸리든 기다리고, 진행이 없으면
     * 얼마 안 걸렸어도 그만둔다.
     *
     * 진행은 지시서가 정한 넷이다 — **칸이 바뀜 · 맵이 바뀜 · 장면(대사·
     * 스크립트·배틀)이 열리거나 닫힘 · 남은 계획 길이가 줄어듦**
     */
    const stall = makeStall(GO_PATIENCE)
    /** 움직이는데 안 나아가는가 (`makePen`) */
    const pen = makePen(PEN_ROUNDS, PEN_TILES)
    /** 화면이 기어서 **안 센** 바퀴 수 (`CRAWL_FPS`). 보고에만 쓴다 */
    let crawled = 0
    /** 박동이 마지막으로 울린 때, 이 걸음이 시작한 때, 지나온 맵 자취 */
    let beatAt = Date.now()
    /** 박동이 같은 칸을 몇 번 찍었나 — 그림을 한 번 남기는 데 쓴다 */
    let beatSame = 0
    let beatWhere = ''
    const t0Go = Date.now()
    const seenMaps = []
    /**
     * **이번 여행에서 실제로 지나온 문**. `맵:x,z` 꼴이다.
     *
     * ⚠️ **한 맵이 여러 구역으로 갈려 있으면 「어느 문으로 들어갔나」가 뜻을 가진다**
     * (REPAIR §53). 앞 내다보기(`landsWell`)는 **목적지가 다음 홉일 때 아무것도 못
     * 거른다** — 어느 계단으로 내려도 「그 맵에 도착」이라서다. 그래서 갤럭시 빌딩
     * 2F로 갈 때 왼쪽 방에 떨어질 수 있고, 그다음 3F 계단이 안 보인다.
     *
     * 그때는 **왔던 문을 빼고 다시 고른다.** 어느 문으로 들어왔는지는 도착한 칸으로
     * 안다 — 워프의 `anchor`가 상대 맵의 몇 번째 워프에 내리는지 말해 준다
     */
    const usedDoors = new Set()
    /** 맵이 갈린 직후, 어느 문으로 들어왔는지 적는다 */
    const noteArrival = (from, to, at) => {
      if (from === to || from === null) return
      /**
       * ⚠️ **도착 칸이 워프 칸과 늘 같지는 않다.** 계단·워프판은 그 칸에 내리지만
       * **문은 통행 불가**라 씬이 한 칸 내려 세운다(`map/world`의 `walkOutOfDoor`).
       * 표본도 한 바퀴 늦을 수 있다. 그래서 딱 맞는 것이 없으면 **두 칸 안**을 본다.
       *
       * ⚠️ **애매하면 아무것도 안 적는다.** 같은 맵으로 나가는 문 짝 488개 가운데
       * **186개**가 내려서는 칸이 두 칸 안이다(가게 양쪽 문처럼 아예 같은 칸도 있다).
       * 그때 하나를 찍으면 **안 지나온 문을 지나왔다고 적는** 셈이라, 다음 고르기가
       * 엉뚱한 문을 뺀다. 못 가리면 안 적는 것이 맞다 — 이 기억은 길을 좁히는
       * 도움일 뿐이고, 없다고 틀리지는 않는다
       */
      const mine = warpsOf(from).filter((w) => w.to === to)
        .map((w) => ({ w, land: warpsOf(to)[w.anchor] }))
        .filter((one) => one.land !== undefined)
      const exact = mine.filter((one) => one.land.x === at.x && one.land.z === at.z)
      const close = mine.filter((one) => Math.abs(one.land.x - at.x) + Math.abs(one.land.z - at.z) <= 2)
      const pick = exact.length === 1 ? exact[0] : close.length === 1 ? close[0] : null
      if (pick !== null) usedDoors.add(`${String(from)}:${String(pick.w.x)},${String(pick.w.z)}`)
    }
    /** 지난 바퀴에 세운 계획의 남은 걸음 수. 줄어드는 것도 진행이다 */
    let planLeft = -1
    /** 이번 바퀴가 시작한 시각. 진행 없는 바퀴를 너무 짧게 안 센다 */
    let roundAt = Date.now()
    for (let t = 0; Date.now() < till; t++) {
      // ⚠️ **빠른 바퀴가 견딤을 갉아먹지 않게 한다** (`ROUND_MS`)
      const spent = Date.now() - roundAt
      if (stall.idle > 0 && spent < ROUND_MS) await page.waitForTimeout(ROUND_MS - spent)
      roundAt = Date.now()
      const s = await now()
      /**
       * **기는 바퀴는 안 센다** (`CRAWL_FPS`). 나아가지 못한 바퀴에서만 묻는다 —
       * 잘 가고 있으면 계기판을 읽을 까닭이 없다
       */
      let crawling = false
      if (stall.idle > 0 || pen.count > 0) {
        const r = await obs.perf()
        const fps = r.known ? r.value?.fps ?? null : null
        crawling = fps !== null && fps < CRAWL_FPS
        if (crawling) {
          crawled++
          // 프레임을 벌어 준다 — 다음 바퀴에 게임이 실제로 몇 칸 갈 수 있게
          await page.waitForTimeout(ROUND_MS)
        }
      }
      if (!crawling && stall.note(beat(s, planLeft))) {
        return done(`${STALLED} — ${String(GO_PATIENCE)}바퀴 동안 진행이 없다`
          + ` (맵 ${String(s.map)} · 칸 ${String(s.x)},${String(s.z)}`
          + ` · 씬 ${String(s.scene)}${s.script ? ' · 스크립트' : ''}`
          + `${s.talk ? ' · 대사창' : ''}${crawled > 0 ? ` · 긴 바퀴 ${String(crawled)}` : ''})`)
      }
      if (verbose && t % 5 === 0) log(`    →${String(target)} ${t}: ${JSON.stringify(s)}`)
      /**
       * **박동** — 조용한 것이 「걷는 중」인지 「되풀이하는 중」인지 밖에서
       * 가를 수 있어야 한다.
       *
       * ⚠️ **실측(2026-09-16 대표 구간 WebGL 판): 30분 동안 로그가 한 줄도 안
       * 나왔다.** 배틀은 붙을 때마다 줄을 남기므로 「싸우지도 멎지도 않는」
       * 상태였는데, 밖에서는 그것이 긴 걸음인지 문 앞 되돌이인지 알 길이
       * 없었다 — 영상만 자라고 있었다. 사람이 판을 끊을지 말지를 **짐작으로**
       * 정하게 되는 자리라, 60초마다 지금 자리와 지나온 맵을 적는다.
       *
       * 판정에 안 쓴다. 적는 것뿐이고, 늘 켜 둔다 (`verbose`와 무관하다)
       */
      if (Date.now() - beatAt > 60_000) {
        beatAt = Date.now()
        log(`    →${String(target)} 걷는 중 ${String(Math.round((Date.now() - t0Go) / 1000))}초`
          + ` · 맵 ${String(s.map)} 칸 ${String(s.x)},${String(s.z)}`
          + ` · 지나온 맵 ${JSON.stringify(seenMaps.slice(-6))}`
          + ` · 쉰 바퀴 ${String(stall.idle)}`)
        /**
         * ⚠️ **같은 칸에서 세 번째 박동이면 그림을 남긴다.** 실측(2026-09-24 대표
         * 구간 9판): 209번도로 (562,693)에서 20분을 같은 칸으로 찍었는데 배틀도
         * 대사도 없었고, 무엇이 막았는지 볼 것이 하나도 없었다
         */
        const here = `${String(s.map)}:${String(s.x)},${String(s.z)}`
        beatSame = here === beatWhere ? beatSame + 1 : 0
        beatWhere = here
        if (beatSame === 2) {
          const file = `shots/journey/stall-${String(s.map)}-${String(s.x)}-${String(s.z)}.png`
          await page.screenshot({ path: file }).catch(() => {})
          log(`    같은 칸에서 3분째다 — 그림 ${file}`)
        }
      }
      if (seenMaps.at(-1) !== s.map) {
        noteArrival(seenMaps.at(-1) ?? null, s.map, { x: s.x, z: s.z })
        seenMaps.push(s.map)
      }
      if (s.scene === 'battle') { await fightThrough(); continue }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      // 스크립트가 도는 동안은 발이 묶인다 — 밀어 봐야 안 움직인다. 넘겨 준다
      if (s.script) { await tap('Space'); continue }
      if (!s.ok) { await page.waitForTimeout(200); continue }
      maps.add(s.map)
      if (s.map === target) return done('arrived')
      /**
       * ⚠️ **여기서만 센다.** 위의 `continue` 넷(배틀·대사·스크립트·아직 못
       * 읽음)을 다 지난 바퀴라야 **자유 보행**이다. 컷신 동안 제자리에 선 것을
       * 가둠으로 읽지 않으려면 이 자리여야 한다
       */
      if (!crawling && pen.note(s.map, s.x, s.z)) {
        return done(`${STALLED} — 맵 ${String(s.map)}에서 ${String(pen.count)}바퀴를`
          + ` 칸 ${String(pen.size)}개 안에서만 걸었다 (되밀리는 중이다)`
          + `${crawled > 0 ? ` · 긴 바퀴 ${String(crawled)}` : ''}`)
      }

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
        /**
         * ⚠️ **물러나는 걸음도 문 앞에 문을 향해 서면 안 된다** (지시서 §1.1 (나)).
         * 워프 **칸**만 피하면 한 칸 옆의 문 앞으로 물러나 그대로 들어가 버린다 —
         * 문을 못 열어 막힌 자리에서 물러나는 걸음이라 하필 문이 가깝다
         */
        const banned = doorStepBan(s.map)
        const away = ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']
          .map((key) => ({ key, at: { x: s.x + STEPV[key][0], z: s.z + STEPV[key][1] } }))
          .find((n) => !grid.blocked(n.at.x, n.at.z)
            && !warpsOf(s.map).some((w) => w.x === n.at.x && w.z === n.at.z)
            && !banned.has(`${String(n.at.x)},${String(n.at.z)},${n.key}`))
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
      // 이 맵의 장애물이 **아직 서 있는지** 한 번 묻는다 (맵당 한 번)
      await askObstacles(s.map)
      const others = warpsOf(s.map)
      const avoid = (x, z) => shun.has(`${String(x)},${String(z)}`)
        || others.some((w) => w.x === x && w.z === z)
        || blockedByFeature(s.map, x, z)
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
       * @param into 일부러 들어갈 문들. 그 문 앞 칸만 걸음 금지에서 뺀다 —
       *   안 빼면 **들어가려는 문 앞에도 못 서서** 어느 문으로도 못 들어간다
       */
      /**
       * **진흙 비탈은 오르지 않는다** — 걸어서도, 하네스의 3단 자전거로도
       * (`slopeClimbBan`). 내려오는 걸음은 그대로 둔다
       */
      const noClimb = slopeClimbBan(here)
      const path = (isGoal, why, door = false, into = []) => {
        const banStep = noDoorStep(s.map, into)
        const opts = {
          enterBlockedGoal: door,
          avoidStep: noClimb === null
            ? banStep
            : (nx, nz, key) => banStep(nx, nz, key) || noClimb(nx, nz, key),
        }
        /**
         * **문에서 한 칸 떨어져서** 먼저 찾는다 (`doorBerth`). 못 찾으면 놓는다 —
         * 골목 안 가게처럼 문 앞을 지나야만 닿는 자리가 있다
         */
        const berth = doorBerth(s.map, into)
        const wide = (x, z) => berth.has(`${String(x)},${String(z)}`)
        const shy = planned(here, from, isGoal,
          { ...opts, avoid: (x, z) => avoid(x, z) || grassAt(here, x, z) || wide(x, z) }, `${why}/풀·문회피`)
        if (shy.keys !== null) {
          return { keys: shy.keys, status: shy.status, why, grassAvoided: true }
        }
        const dry = planned(here, from, isGoal,
          { ...opts, avoid: (x, z) => avoid(x, z) || wide(x, z) }, `${why}/문회피`)
        if (dry.keys !== null) {
          return { keys: dry.keys, status: dry.status, why, grassAvoided: false, shy: shy.status }
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
      /**
       * ⚠️ **아직 못 지나는 맵** (`closedMaps`). 맵 그래프에서 빼고, 「닿을 수 있는
       * 다른 구역」 후보에서도 뺀다 — 한쪽만 빼면 그쪽으로 다시 걸어간다
       */
      const shut = closedMaps === null ? null : closedMaps()
      if (here === matrixOf(target)) {
        keys = use(path((x, z) => grid.zoneAt(x, z) === target, `구역 ${String(target)}`))
      }
      // ⚠️ **같은 행렬에 있다고 걸어서 닿는다는 뜻이 아니다.** 축복시티와
      // 무쇠시티는 둘 다 행렬 0인데 사이가 절벽이라, 사람은 무쇠게이트(258)로
      // 들어갔다 나온다. 곧바로 노리는 길이 없으면 **없는 것이 아니라 문으로
      // 도는 것**이므로 맵 그래프에 다시 묻는다 — 실측(2026-09-07)으로 이
      // 자리가 없어서 「(177,804)에서 길을 못 찾았다」로 섰다
      if (keys === null) {
        // 자전거길이 그 예다 — 격자에는 길이 있고 게임은 막는다. 빼지 않으면 그
        // 길로 계획을 내고, 계획이 늘 「17걸음 있다」고 하니 같은 자리를 영영
        // 맴돈다 (실측 2026-09-17 journey17 — 207번도로에서 18분)
        const route = mapRoute(s.map, target, { without: shut })
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
          const all = others.filter((w) => w.to === hop)
          if (all.length === 0) return done(`${String(s.map)}에서 ${String(hop)}으로 나가는 문이 없다`)
          /**
           * **한 맵 안이 여러 구역으로 갈려 있을 수 있다** — 맵 그래프는 맵을 한
           * 덩어리로 보므로 그 갈림을 모른다.
           *
           * ⚠️ 실측(2026-09-22 다리 a): 갤럭시 빌딩 **2F(73)** 가 그렇다. 1F에서
           * 내려오는 계단이 **둘**인데 왼쪽 (3,3)으로 내려오면 x=4·5가 벽이라
           * 3F 계단 (14,3)·(20,3)과 **안 이어진다**. 재는 자는 그 방에서 「길을
           * 못 찾았다」로 서고, 밖에서는 빌딩을 못 올라가는 것으로 보였다.
           *
           * 그래서 문을 고를 때 **내려서는 자리**를 본다: 워프의 `anchor`가 상대
           * 맵의 몇 번째 워프에 내리는지 말해 주므로(`resolveWarp`와 같은 규칙),
           * 그 칸에서 **그 맵의 다음 문**까지 이어지는 문만 쓴다.
           *
           * ⚠️ **모르면 막지 않는다.** 앞을 못 내다보는 갈래는 전부 참을 낸다 —
           * 이 규칙이 길을 **좁히기만** 하고 새로 막지는 않게 한다. 다 걸러지면
           * 원래 목록을 그대로 쓴다
           */
          const landsWell = (w) => {
            const land = warpsOf(w.to)[w.anchor]
            if (land === undefined) return true
            const on = mapRoute(w.to, target, { without: shut })
            if (!Array.isArray(on) || on.length < 2) return true
            const nextDoors = warpsOf(w.to).filter((d) => d.to === on[1])
            if (nextDoors.length === 0) return true
            const there = warpsOf(w.to)
            const r = planPath(matrixOf(w.to), { x: land.x, z: land.z },
              (x, z) => nextDoors.some((d) => d.x === x && d.z === z),
              {
                enterBlockedGoal: true,
                // 다른 워프는 밟지 않는다 — 노리는 문만 목표다
                avoid: (x, z) => there.some((o) => o.x === x && o.z === z)
                  && !nextDoors.some((d) => d.x === x && d.z === z),
              })
            return r.keys !== null
          }
          const good = all.filter((w) => landsWell(w))
          /**
           * **이미 지나온 문은 다시 안 고른다** — 그 문으로 들어가 봤는데 여기로
           * 되돌아왔다는 뜻이다(구역이 갈린 맵). 남는 것이 없으면 그 기억은 놓는다
           */
          const narrowed = good.length > 0 ? good : all
          const fresh = narrowed.filter((w) => !usedDoors.has(`${String(s.map)}:${String(w.x)},${String(w.z)}`))
          const doors = fresh.length > 0 ? fresh : narrowed
          if (verbose && fresh.length !== narrowed.length) {
            log(`      →${String(hop)} 이미 지나온 문 ${String(narrowed.length - fresh.length)}개를 뺀다`)
          }
          if (verbose && good.length !== all.length) {
            log(`      →${String(hop)} 문 ${String(all.length)}개 중 ${String(good.length)}개만`
              + ' 내려선 자리에서 길이 이어진다')
          }
          // ⚠️ **문만 통행 불가 칸으로 들어선다** (후속 §4.2)
          keys = use(path((x, z) => doors.some((w) => w.x === x && w.z === z),
            `문 →${String(hop)}`, true, doors))
        } else {
          for (let i = far; i >= 1 && keys === null; i--) {
            keys = use(path((x, z) => grid.zoneAt(x, z) === route[i],
              `경유 구역 ${String(route[i])}`))
          }
        }
      }
      // ⚠️ **맵 그래프가 못 지나가는 길을 낼 수 있다.** 구역 표는 **맞닿아
      // 있는가**만 보는데, 그 경계에 베어가르기 나무가 서 있으면 맞닿아 있어도
      // 못 간다 — 실측(2026-09-17 `_leg42`): 영원의 숲 바깥(202)에서 205번도로
      // 북(349)이 「맞닿음」인데 사이가 나무 둘이라, `mapRoute`가 낸
      // `[202, 349, 65]`가 통째로 거짓말이었다. 진짜 길은 **뒤로 나갔다가**
      // 숲 안(203)의 북쪽 문으로 도는 것이다.
      //
      // 그래서 마지막으로 **닿을 수 있는 다른 구역**을 찾는다. 거기서 다시
      // 물으면 맵 그래프가 이번엔 지나갈 수 있는 길을 낸다
      if (keys === null) {
        const byZone = new Map()
        const worthGoing = (zone) => {
          if (zone === s.map) return false
          let ok = byZone.get(zone)
          if (ok === undefined) {
            const r = shut?.has(zone) === true ? null : mapRoute(zone, target, { without: shut })
            // 지금 맵으로 되돌아오는 길은 소용없다 — 왔던 자리로 도로 온다
            ok = Array.isArray(r) && r.length >= 1 && !r.includes(s.map)
            byZone.set(zone, ok)
          }
          return ok
        }
        keys = use(path((x, z) => worthGoing(grid.zoneAt(x, z)), '닿을 수 있는 다른 구역'))
        /**
         * **실내는 구역이 하나뿐이라 위 갈래가 후보를 못 찾는다** (REPAIR §53).
         * 그런데 한 맵이 여러 구역으로 갈려 있을 수 있다 — 갤럭시 빌딩 2F가 그렇다.
         * 노리는 문이 안 닿으면 **닿는 다른 문으로 일단 나갔다가** 다시 들어온다.
         *
         * ⚠️ **되돌아오기만 하는 문은 고르지 않는다** — 그 맵에서 목적지로 가는
         * 길이 남아 있어야 하고, **이미 지나온 문**도 뺀다(`usedDoors`). 그래야
         * 두 문 사이를 영영 오가지 않는다
         */
        if (keys === null) {
          const leads = others.filter((w) => w.to !== s.map)
            .filter((w) => {
              const r = shut?.has(w.to) === true ? null : mapRoute(w.to, target, { without: shut })
              return Array.isArray(r) && r.length >= 1
            })
          /**
           * ⚠️ **들어온 문까지 빼면 못 나오는 방이 생긴다.**
           *
           * 「이미 지나온 문」을 빼는 것은 두 문 사이를 영영 오가지 않으려는
           * 규칙인데, **문이 둘뿐이고 하나가 막힌 방**에서는 그 규칙이 방을
           * 통째로 잠근다. 실측(2026-09-23 대표 구간): 험한 샛길(254)에 들어가
           * (18,50)에서 **한 발도 못 나왔다** — 앞문 (28,44)는 깰 바위 너머라
           * 못 가고, 들어온 문 (19,50)은 「지나온 문」이라 빠졌다. 그 뒤
           * 영원시티·체육관·빌딩·마트가 **전부** 같은 줄로 무너졌다.
           *
           * 그래서 남는 것이 없으면 **지나온 문도 다시 센다.** 왔던 길로
           * 되돌아가는 것은 사람도 하는 일이고, 갇히는 것보다 낫다
           */
          const fresh = leads.filter(
            (w) => !usedDoors.has(`${String(s.map)}:${String(w.x)},${String(w.z)}`))
          const back = fresh.length > 0 ? fresh : leads
          if (back.length > 0 && fresh.length === 0 && verbose) {
            log(`      ${String(s.map)}에서 남은 문이 없다 — 들어온 문으로 되돌아 나간다`)
          }
          if (back.length > 0) {
            keys = use(path((x, z) => back.some((w) => w.x === x && w.z === z),
              '나갔다 다시 들어올 문', true, back))
            if (keys !== null && verbose) {
              log(`      ${String(s.map)}에서 ${String(target)}로 곧장 못 간다 — 다른 문으로 나갔다 온다`)
            }
          }
        }
        if (keys !== null && verbose) log('      맵 그래프의 길이 막혔다 — 다른 구역으로 돌아 나간다')
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
      planLeft = keys.length
      const how = await walk(keys, { x: s.x, z: s.z }, s.map, shun)
      noteMove(how, await now())
      if (verbose) log(`      ${String(keys.length)}걸음 → ${how}`)
    }
    // ⚠️ **총예산은 마지막 방어선이지 판정자가 아니다** (지시서 1.1).
    // 나아가는 중에 거기 걸렸으면 그것은 **못 잰 것**이지 실패가 아니다
    return done(stall.moving
      ? `${SLOW} — 나아가는 중에 총예산이 끝났다`
        + ` (${String(stall.moves)}번 나아갔고 마지막 진행 뒤 ${String(stall.idle)}바퀴)`
      : `${STALLED} — 총예산이 끝났고 그전에 진행도 없었다`)
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
  /**
   * @param intoDoors 일부러 문 앞에 서려는 것이면 그 문들. 그 문만 걸음 금지에서
   *   뺀다 (`enterDoor`가 쓴다 — 안 빼면 문 아래 칸에 **아래에서** 못 올라선다)
   */
  const stepOn = async (mapId, spot, budgetMs, { intoDoors = [] } = {}) => {
    const here = matrixOf(mapId)
    const doors = warpsOf(mapId)
    /** 문에서 한 칸 떨어져 걸을까. 그래서는 못 가면 아래에서 놓는다 */
    let berth = true
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
    /** 여기도 시계가 아니라 진행으로 그만둔다 (지시서 H1 · `goTo`와 같은 자다) */
    const stall = makeStall(STEP_PATIENCE)
    /** 화면이 기어서 **안 센** 바퀴 수 (`CRAWL_FPS` — `goTo`와 같은 자다) */
    let crawled = 0
    /** 지난 바퀴의 남은 걸음 수 */
    let planLeft = -1
    let roundAt = Date.now()
    while (Date.now() < till) {
      const spent = Date.now() - roundAt
      if (stall.idle > 0 && spent < ROUND_MS) await page.waitForTimeout(ROUND_MS - spent)
      roundAt = Date.now()
      const s = await settle()
      // **기는 바퀴는 안 센다** (`CRAWL_FPS`) — 나아가지 못한 바퀴에서만 묻는다
      let crawling = false
      if (stall.idle > 0) {
        const r = await obs.perf()
        const fps = r.known ? r.value?.fps ?? null : null
        crawling = fps !== null && fps < CRAWL_FPS
        if (crawling) { crawled++; await page.waitForTimeout(ROUND_MS) }
      }
      // ⚠️ **밟은 것을 먼저 본다.** 멈춤으로 접기 전에 `trail`을 봐야, 밟고
      // 장면에 끌려간 판이 「멈췄다」로 안 적힌다
      if (!crawling && stall.note(beat(s, planLeft))) {
        if (passed()) return done('arrived')
        return done(`${STALLED} — ${String(STEP_PATIENCE)}바퀴 동안 진행이 없다`
          + ` (맵 ${String(s.map)} · 칸 ${String(s.x)},${String(s.z)}`
          + ` · 씬 ${String(s.scene)}${s.script ? ' · 스크립트' : ''}`
          + `${crawled > 0 ? ` · 긴 바퀴 ${String(crawled)}` : ''})`)
      }
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
          || doors.some((w) => w.x === x && w.z === z)
          || blockedByFeature(mapId, x, z)
          // **문에서 한 칸 떨어져 걷는다** — 못 가면 아래에서 놓는다
          || (berth && doorBerth(mapId, intoDoors).has(`${String(x)},${String(z)}`)),
        // ⚠️ **밟으러 가다 건물에 들어가지 않는다** (지시서 §1.1). 실측 3판이
        // 전부 이 부름에서 샜다 — `stepOn(65, {303,524})`이 포켓몬센터였다
        avoidStep: noDoorStep(mapId, intoDoors),
      }, `밟기 ${String(spot.x)},${String(spot.z)}${berth ? '/문회피' : ''}`)
      if (r.keys === null) {
        // ⚠️ **문 회피는 넉넉한 규칙이지 길이 아니다.** 골목 안 가게나 문 앞
        // 칸 자체가 목표면 그 규칙으로는 못 간다 — 먼저 그것부터 놓는다
        if (berth) { berth = false; continue }
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
      planLeft = keys.length
      const how = await walk(keys, { x: s.x, z: s.z }, mapId, shun)
      noteMove(how, await now())
      if (how === 'done') { ep.via = 'stood'; return done('arrived') }
      if (passed()) return done('arrived')
      if (verbose) log(`      ${String(spot.x)},${String(spot.z)}까지 ${how}`)
    }
    if (passed()) return done('arrived')
    return done(stall.moving
      ? `${SLOW} — 나아가는 중에 총예산이 끝났다`
        + ` (${String(stall.moves)}번 나아갔고 마지막 진행 뒤 ${String(stall.idle)}바퀴)`
      : `${STALLED} — 총예산이 끝났고 그전에 진행도 없었다`)
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
              || doors.some((w) => w.x === x && w.z === z)
              || blockedByFeature(mapId, x, z),
            // ⚠️ **말 걸러 가다 건물에 들어가지 않는다** (지시서 §1.1)
            avoidStep: noDoorStep(mapId),
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

  /** 이야기 변수·가방·꽃시계 — **읽기만** 한다. 못 읽으면 `null`이다 */
  const storyVars = async () => {
    const r = await obs.storyVars()
    return r.known ? r.value : null
  }
  const bagState = async () => {
    const r = await obs.bagState()
    return r.known ? r.value : null
  }
  const eternaWalls = async () => {
    const r = await obs.eternaWalls()
    return r.known ? r.value : null
  }
  /**
   * 넷째·다섯째 배지 체육관을 재는 읽기 셋. 전부 **제품이 내놓는 값**이다
   * (`observe.mjs`가 까닭을 적어 뒀다). 못 읽으면 `null`이고, 부르는 쪽이
   * 그것을 「관측 불가」로 적는다 — 0이나 빈 목록으로 접지 않는다
   */
  const veilstoneState = async () => {
    const r = await obs.veilstoneState()
    return r.known ? r.value : null
  }
  const pastoriaState = async () => {
    const r = await obs.pastoriaState()
    return r.known ? r.value : null
  }
  /** @param box `{ x0, z0, x1, z1 }` 훑을 네모 */
  const featureWalls = async (box) => {
    const r = await obs.featureWalls(box)
    return r.known ? r.value : null
  }
  /** 장막 체육관 풀이 — **페이지 안에서** 돈다 (`observe.veilstonePlan`) */
  const veilstonePlan = async (arg) => {
    const r = await obs.veilstonePlan(arg)
    return r.known ? r.value : null
  }

  /**
   * **마트에서 산다** — 사람이 하는 길 그대로.
   *
   * 점원은 계산대 뒤 (3,5)고 **스크립트 1**이다 (`events.json`의 마트 넷이
   * 다 같다 — 축복 4 · 모래 419 · 꽃향기 427 · 영원 66). 자리가 아니라
   * 스크립트로 찾는 까닭은 간호사와 같다.
   *
   * 화면은 `ui/menu/ShopScreen`이고 줄이 `<div>`라 **누를 단추가 없다** —
   * 키로 몬다. 계약이 그 파일에 그대로 있다:
   *
   *   · 결정 한 번에 `count`가 0 → 1 (`confirm`의 `if (max > 0) setCount(1)`)
   *   · `count > 0`이면 ↑가 **개수를 올린다** (`Math.min(max, c + 1)`)
   *   · 그 자리에서 결정이 `settle()` — 돈을 내고 가방에 넣는다
   *   · 취소가 가게를 닫는다
   *
   * ⚠️ **산 것은 가방으로 확인한다.** 「샀다」 글을 읽으면 글자 맞추기가 되고,
   * 돈이 모자라 안 산 판이 통과로 새어 나간다
   *
   * @param martMap 마트 맵 번호
   * @param item    도구 번호 (몬스터볼이 4다)
   * @param want    몇 개
   */
  const buyAt = async (martMap, item, want, budgetMs) => {
    const t0 = Date.now()
    const before = await bagState()
    if (before === null) return { ok: false, unknown: true, why: `가방을 못 읽었다 (${obs.kind})` }
    const held = (bag) => bag.items.find((one) => one.item === item)?.count ?? 0
    const came = await goTo(martMap, Math.min(budgetMs, left()))
    if (came !== 'arrived') return { ok: false, why: `마트에 못 갔다 (${String(came)})` }
    const said = await talkToNpc(martMap, 1, Math.min(120_000, left()))
    if (said !== true) return { ok: false, why: '점원에게 못 걸었다' }
    // 가게가 열릴 때까지 넘긴다 — 인사 대사가 먼저 흐른다
    let opened = false
    for (let i = 0; i < 60 && !opened; i++) {
      const s2 = await now()
      if (s2.menu === 'shop') { opened = true; break }
      await tap('Space', 120)
    }
    if (!opened) return { ok: false, why: '가게가 안 열렸다' }
    /**
     * ⚠️ **줄 번호를 짐작하지 않는다.** 재고는 그 자리의 **배지 수**가 정하므로
     * (`engine/bag/mart.ts`) 배지가 하나 늘면 목록이 통째로 밀린다 — 「첫 줄이
     * 몬스터볼」은 오늘만 참인 문장이다. 열린 가게의 재고를 읽어 **그 줄까지**
     * 커서를 내린다. 커서는 안 돌아간다 (`clampCursor`)
     */
    const stock = await obs.shopStock()
    if (!stock.known || !Array.isArray(stock.value)) {
      await tap('KeyX', 120)
      return { ok: false, unknown: true, why: `재고를 못 읽었다 (${obs.kind})` }
    }
    const at = stock.value.indexOf(item)
    if (at < 0) {
      await tap('KeyX', 120)
      return { ok: false, why: `이 가게에 도구 ${String(item)}이 없다` }
    }
    for (let i = 0; i < at; i++) await tap('ArrowDown', 70)
    await tap('Space', 200)
    for (let i = 1; i < want; i++) await tap('ArrowUp', 70)
    await tap('Space', 300)
    await tap('KeyX', 200)
    await clearTalk()
    await settle()
    const after = await bagState()
    if (after === null) return { ok: false, unknown: true, why: `가방을 못 읽었다 (${obs.kind})` }
    const got2 = held(after) - held(before)
    return {
      ok: got2 > 0, bought: got2, want, ms: Date.now() - t0,
      money: [before.money, after.money], have: held(after),
      why: got2 > 0 ? null : `안 샀다 (돈 ${String(after.money)}원)`,
    }
  }

  /**
   * **가방을 열고 그 도구 칸에 커서를 놓는다** — 사람이 하는 길 그대로.
   *
   * 시작 메뉴에서 가방을 찾는 자리가 여기다. ⚠️ **글로 못 찾는다** — 실측
   * (2026-09-16 `_north42` 3판)으로 일곱 칸의 글이 전부 비어 있었다
   * (`["▶","","","","","",""]`). 이름표는 롬 뱅크에서 받아 오는데
   * (`ui/menu/StartMenu`의 `label()`) 그 왕복이 아직 안 끝나 있었다.
   * 그래서 **차례로 찾는다**: 뒤 다섯은 늘 가방·트레이너카드·리포트·설정·닫기라,
   * 앞의 도감·포켓몬·공중날기가 있든 없든 가방은 **뒤에서 다섯째**다.
   * 리포트를 뒤에서 셋째로 찾는 `journey.mjs`의 `writeReport`와 같은 자리다.
   * 글이 와 있으면 그것으로 맞춰 본다.
   *
   * 주머니는 ←→로 옮기고(**돌아간다** — `wrapCursor`) 줄은 ↑↓다(안 돌아간다).
   * 몇 번째 주머니의 몇째 줄인지는 세이브에서 읽는다 (`bagState`)
   *
   * @returns `{ ok, slot, why }` — `slot`은 `{ item, count, pocket, row }`
   */
  const openBagAt = async (item, till) => {
    const bag = await bagState()
    if (bag === null) return { ok: false, unknown: true, why: `가방을 못 읽었다 (${obs.kind})` }
    const slot = bag.items.find((one) => one.item === item) ?? null
    if (slot === null) return { ok: false, why: `가방에 도구 ${String(item)}이 없다` }

    await settle()
    await tap('KeyC')
    const rowAt = async () => page.evaluate(() => {
      const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
      return {
        n: all.length,
        at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true'),
        want: all.findIndex((e) => (e.textContent ?? '').includes('가방')),
        texts: all.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
      }
    })
    let menu = null
    for (let i = 0; i < 20 && Date.now() < till; i++) {
      menu = await rowAt().catch(() => null)
      if (menu !== null && menu.n > 0) break
      await page.waitForTimeout(250)
    }
    if (menu === null || menu.n < 5) {
      for (let i = 0; i < 6; i++) await tap('KeyX', 80)
      return { ok: false, why: `시작 메뉴가 안 열렸다 (${JSON.stringify(menu?.texts ?? null)})` }
    }
    const want = menu.want >= 0 ? menu.want : menu.n - 5
    for (let i = 0; i < menu.n + 3; i++) {
      const at = await rowAt()
      if (at.at === want) break
      await tap(at.at < want ? 'ArrowDown' : 'ArrowUp', 60)
    }
    await tap('Space', 250)
    for (let i = 0; i < 30 && (await now()).menu !== 'bag'; i++) await page.waitForTimeout(200)
    if ((await now()).menu !== 'bag') {
      for (let i = 0; i < 6; i++) await tap('KeyX', 80)
      return { ok: false, why: '가방이 안 열렸다' }
    }
    for (let i = 0; i < slot.pocket; i++) await tap('ArrowRight', 90)
    for (let i = 0; i < slot.row; i++) await tap('ArrowDown', 80)
    return { ok: true, slot, why: null }
  }

  /** 가방이든 무엇이든 열린 화면을 닫고 필드로 돌아온다 */
  const closeMenus = async () => {
    for (let i = 0; i < 8 && (await now()).menu !== undefined; i++) await tap('KeyX', 120)
    await settle()
  }

  /**
   * **공중날기로 그 마을에 간다** — 시작 메뉴 「공중날기」 → 타운맵 → 방향키 → 결정.
   *
   * ⚠️ **원작은 이 항목이 포켓몬 화면에 붙는다.** 제품이 시작 메뉴에 둔 것은 그 자리를
   * 아직 안 만들어서다(`ui/menu/StartMenu`) — 사람도 지금은 이 길로 난다.
   *
   * 커서는 화면 안의 상태라 못 읽는다. 열린 첫 자리에서 시작해 방향키 한 번에 한 칸
   * 가는 규칙을 **제품의 표로** 셈하고(`flyPlan`), 날았는지는 **맵**으로 본다
   */
  const flyTo = async (target, budgetMs = 120_000) => {
    const t0 = Date.now()
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const before = await now()
    if (before.map === target) return { ok: true, already: true, ms: 0 }
    const plan = await obs.flyPlan(target)
    if (!plan.known) return { ok: false, unknown: true, why: `타운맵을 못 읽었다 (${String(plan.why)})` }
    const { from, to, unlocked } = plan.value
    if (!unlocked || from === null || to === null) return { ok: false, why: `맵 ${String(target)}은 아직 날 수 없다` }
    await settle()
    await tap('KeyC')
    const rowAt = async () => page.evaluate(() => {
      const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
      return {
        n: all.length,
        at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true'),
        want: all.findIndex((e) => (e.textContent ?? '').includes('공중날기')),
        texts: all.map((e) => (e.textContent ?? '').replace(/s+/g, ' ').trim()),
      }
    })
    let menu = null
    for (let i = 0; i < 20 && Date.now() < till; i++) {
      menu = await rowAt().catch(() => null)
      if (menu !== null && menu.n > 0) break
      await page.waitForTimeout(250)
    }
    if (menu === null || menu.want < 0) {
      await closeMenus()
      return { ok: false, why: `시작 메뉴에 공중날기가 없다 (${JSON.stringify(menu?.texts ?? null)})` }
    }
    for (let i = 0; i < menu.n + 3; i++) {
      const at = await rowAt()
      if (at.at === menu.want) break
      await tap(at.at < menu.want ? 'ArrowDown' : 'ArrowUp', 60)
    }
    await tap('Space', 400)
    for (let i = 0; i < 30 && (await now()).menu !== 'fly'; i++) await page.waitForTimeout(200)
    if ((await now()).menu !== 'fly') { await closeMenus(); return { ok: false, why: '타운맵이 안 열렸다' } }
    // 커서는 열린 첫 자리에서 시작한다 — 화면이 그 값을 효과로 세우므로 한 박자 기다린다
    await page.waitForTimeout(400)
    const dx = to.x - from.x
    const dz = to.z - from.z
    for (let i = 0; i < Math.abs(dx); i++) await tap(dx > 0 ? 'ArrowRight' : 'ArrowLeft', 70)
    for (let i = 0; i < Math.abs(dz); i++) await tap(dz > 0 ? 'ArrowDown' : 'ArrowUp', 70)
    await tap('Space', 400)
    let at = await now()
    while (Date.now() < till && !(at.map === target && at.scene === 'overworld' && !at.restoring)) {
      await page.waitForTimeout(250)
      at = await now()
    }
    await settle()
    const ok = at.map === target
    if (!ok) await closeMenus()
    log(`      공중날기 → 맵 ${String(target)} ${ok ? '닿았다' : `못 닿았다 (지금 ${String(at.map)})`}`)
    return { ok, from, to, map: at.map, ms: Date.now() - t0, why: ok ? null : `맵이 ${String(at.map)}이다` }
  }

  /**
   * **괴력으로 큰바위를 민다** — 바위 뒤 칸에 서서 바위 쪽을 보고 A → 「쓰겠습니까?」 예
   * (`FieldMoves_Strength` → `DoStrengthFunc`) → 그 방향으로 `n`번 민다.
   *
   * 민 것은 **게임의 물체 자리**로 본다(`obstacleAt`). 밀고 나면 장애물 표에서 옛 칸을
   * 지우고 새 칸을 넣는다 — 안 그러면 계획이 옛 칸을 막힌 채로 둔다
   */
  const strengthPush = async (mapId, boulder, key, n, budgetMs = 180_000) => {
    const t0 = Date.now()
    const [dx, dz] = STEPV[key]
    const stand = { x: boulder.x - dx, z: boulder.z - dz }
    const went = await stepOn(mapId, stand, budgetMs)
    if (went !== 'arrived') return { ok: false, why: `바위 뒤 칸에 못 섰다 (${went})`, pushed: 0 }
    await tap(key, 80)
    await settle()
    await tap('Space', 400)
    await clearTalk()
    const f = await obs.fieldState()
    if (!(f.known && f.value?.strength === true)) {
      return { ok: false, why: `괴력이 안 켜졌다 (${JSON.stringify(f.known ? f.value : f.why)})`, pushed: 0 }
    }
    let pushed = 0
    let rock = { ...boulder }
    for (let i = 0; i < n; i++) {
      const next = { x: rock.x + dx, z: rock.z + dz }
      const here = await now()
      await page.keyboard.down(key)
      let moved = false
      for (let k = 0; k < 40 && !moved; k++) {
        await page.waitForTimeout(50)
        const r = await obs.obstacleAt(next.x, next.z)
        moved = r.known && r.value !== null
      }
      await page.keyboard.up(key)
      await page.waitForTimeout(300)
      if (!moved) {
        log(`      괴력 ${String(i + 1)}번째 밀기 — 바위가 안 옮겨졌다 (${String(here.x)},${String(here.z)})`)
        break
      }
      obstacleGone(mapId, rock.x, rock.z)
      standingObstacles.add(`${String(matrixOf(mapId))}:${String(next.x)},${String(next.z)}`)
      rock = next
      pushed++
    }
    await settle()
    log(`      괴력 — ${String(pushed)}/${String(n)}번 밀었다 · 바위 (${String(rock.x)},${String(rock.z)})`)
    return { ok: pushed === n, pushed, rock, ms: Date.now() - t0, why: pushed === n ? null : '다 못 밀었다' }
  }

  /** 파도타기 다리를 켜고 끈다 (`surfMode`) */
  const setSurf = (on) => { surfMode = on === true }

  /**
   * **도구 하나를 밭에서 쓴다** (`ui/menu/itemAction`의 그 갈래들).
   *
   * 지금 쓰는 자리는 **벌레회피스프레이**다 — 영원의 숲과 205번도로는 칸마다
   * 야생이 붙어서, 실측(2026-09-16 대표 구간)으로 한 다리에 열두 번이 붙고
   * 900초 상한이 걸어가는 도중에 끊겼다. 원작이 그 자리에 주는 답이 이 도구고
   * (마트 재고 t2 · 350원 · 100걸음), 우리 쪽도 `TryUseRepel` 그대로 걸음을 센다.
   *
   * ⚠️ **썼는지는 가방으로 본다.** 화면 글(「…을 썼다!」)로 재면 「아직 효과가
   * 남아 있다」와 구분이 글자 맞추기가 된다
   */
  const useItem = async (item, budgetMs = 120_000) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const before = await bagState()
    const had = before?.items.find((one) => one.item === item)?.count ?? 0
    const at = await openBagAt(item, till)
    if (!at.ok) { await closeMenus(); return { ...at, had } }
    await tap('Space', 400)
    await closeMenus()
    const after = await bagState()
    const now2 = after?.items.find((one) => one.item === item)?.count ?? 0
    return { ok: now2 < had, had, left: now2, why: now2 < had ? null : '안 줄었다' }
  }

  /**
   * **비전머신을 가르친다** — 사람이 하는 길 그대로.
   *
   * 원작이 여기서 막는다: `whyNot`이 「그 기술을 아는 파티원이 있는가」를 보고
   * (`Party_HasMonWithMove`), 없으면 바위 앞에서 A를 눌러도 아무 일도 안 난다.
   * 비전머신06(도구 425)은 첫 배지 자리의 가방에 **이미 들어 있다** — 무쇠게이트
   * 1층의 등산가가 배지 하나를 보고 준다 (`OreburghGate1F_HikerGiveHM`).
   *
   * 화면의 계약은 `ui/menu/BagScreen`과 `ui/menu/PartyScreen`에 있다 —
   * ←→가 주머니, ↑↓가 줄, 결정이 **바로** 쓴다(갈래 메뉴가 없다). 기술머신이면
   * 파티 화면이 열리고, 거기서 고른 마리가 배운다. 비전머신은 **안 없어진다**.
   *
   * ⚠️ **배웠는지는 파티로 확인한다.** 화면 글(「배웠다!」)로 재면 「이 포켓몬은
   * 배울 수 없다」와 구분이 글자 맞추기가 되고, 못 배운 판이 통과로 샌다
   */
  /**
   * @param only 가르칠 **파티 자리들**. 주면 그 자리만 누른다 — 파도타기·괴력은
   *   비버통, 공중날기는 찌르호크처럼 사람이 고르는 마리가 정해져 있다(JOURNEY_BADGE67 §7).
   *   안 주면 예전처럼 빈 칸이 있는 마리부터 본다
   * @param keep 칸이 찼을 때 **잊으면 안 되는 기술들**. 잊을 칸은 이 목록에 없는 첫
   *   칸이다. ⚠️ 원작은 비전기술을 못 잊게 막는데 제품은 안 막는다(REPAIR §76) —
   *   그래서 부르는 쪽이 비전기술을 여기 넣는다
   */
  const teachHm = async (item, move, budgetMs, { only = null, keep = [] } = {}) => {
    const t0 = Date.now()
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const knows = async () => {
      const party = await partyState()
      return party === null ? null
        : party.findIndex((one) => one.moves.some((m) => m.move === move))
    }
    const had = await knows()
    if (had === null) return { ok: false, unknown: true, why: `파티를 못 읽었다 (${obs.kind})` }
    if (had >= 0) return { ok: true, already: true, slot: had, ms: 0 }
    /**
     * ⚠️ **무엇을 잊었는지 적는다.** 칸이 다 찼으면 이 걸음은 **첫 칸을 버린다** —
     * 대개 레벨로 가장 먼저 배운 기술이라 사람도 그것을 버리지만, **늘 그렇지는
     * 않다.** 셋째 배지 계획은 선두의 **물기**로 멜리사(고스트)를 친다
     * (`JOURNEY_BADGE345` §7) — 그것을 잊고 간 판은 관장 앞에서야 표가 난다.
     * 판정에는 안 쓰고, 부르는 쪽이 결과에 적어 사람이 보게 한다
     */
    const movesBefore = (await partyState())?.map((one) => ({
      species: one.species, moves: one.moves.map((m) => m.move),
    })) ?? null
    const at = await openBagAt(item, till)
    if (!at.ok) { await closeMenus(); return { ...at, ms: Date.now() - t0 } }
    await tap('Space', 300)

    /**
     * 파티 화면에서 **배울 수 있는 마리**를 찾는다.
     *
     * ⚠️ **한 마리만 눌러 보고 그만두지 않는다.** 찌르꼬는 바위깨기를 못 배운다 —
     * 첫 칸에서 「이 포켓몬은 배울 수 없다」가 나면 다음 칸으로 간다. 배운 것은
     * 글이 아니라 파티로 본다
     */
    let learned = -1
    /** 화면이 뭐라고 했나 — 「배울 수 없다」와 「칸이 다 찼다」는 다른 결함이다 */
    const said2 = []
    const screen = async () => page.evaluate(
      () => (document.body.innerText ?? '').replace(/\s+/g, ' '),
    ).catch(() => '')
    /**
     * **빈 칸이 있는 마리에게 먼저 가르친다** — 두 바퀴를 돈다.
     *
     * ⚠️ **첫 칸에 있는 마리가 늘 옳지는 않다.** 실측(2026-09-22 다리 a 앞):
     * 선두 수풀부기의 기술이 `바위깨기·물기·흡수·잎날가르기`로 **꽉 차 있었고**,
     * 비버니는 `몸통박치기` 하나뿐이라 **빈 칸이 셋**이었다. 그냥 첫 칸부터 누르면
     * 수풀부기가 **바위깨기를 버리고** 베어가르기를 배운다 — 사람이라면 비버니에게
     * 가르친다. 그래서 첫 바퀴는 **칸이 남은 마리만** 보고, 아무도 못 배우면
     * 두 번째 바퀴에서 칸이 찬 마리까지 본다.
     *
     * 칸이 찬 마리에게 가르치는 것 자체는 막지 않는다 — 비전머신을 배울 마리가
     * 그것뿐인 판이 있고, 그때는 **무엇을 잊었는지가 결과에 적힌다**(`lost`)
     */
    const full = (i) => (movesBefore?.[i]?.moves.length ?? 0) >= 4
    const roomy = only === null && (movesBefore ?? []).some((_, i) => !full(i))
    for (let pass = 0; pass < (roomy ? 2 : 1) && learned < 0 && Date.now() < till; pass++) {
      if (pass > 0) {
        // 커서를 처음으로 되돌린다 — 파티 화면을 닫았다 열면 0에서 시작한다
        for (let i = 0; i < 8 && (await now()).menu !== undefined; i++) await tap('KeyX', 120)
        const again = await openBagAt(item, till)
        if (!again.ok) break
        await tap('Space', 300)
      }
    for (let i = 0; i < 6 && Date.now() < till; i++) {
      // 첫 바퀴에는 **칸이 찬 마리를 건너뛴다**
      if (pass === 0 && roomy && full(i)) { await tap('ArrowRight', 120); continue }
      if (only !== null && !only.includes(i)) { await tap('ArrowRight', 120); continue }
      await tap('Space', 400)
      /**
       * **기술 칸이 다 찼으면 원작은 묻는다** (`PartyMenuCB_TeachMove`) —
       * 「다른 기술을 잊게 하겠습니까?」 → 「어느 기술을 잊게 하겠습니까?」다.
       * 눈 감고 결정을 연타하면 그 둘을 우연히 지나가게 되므로, **글을 보고**
       * 답한다. 잊는 것은 **첫 칸**이다 — 레벨로 가장 먼저 배운 기술이라
       * 사람도 대개 그것을 버린다(모부기면 몸통박치기다). 커서는 열 때마다
       * 0이라 옮길 것이 없다
       */
      /**
       * ⚠️ **「어느 기술을」을 먼저 본다.** 롬 글이 「어느 기술을 **잊게 하겠습니까**?」(59)라
       * 첫 물음 「…다른 기술을 잊게 하겠습니까?」(52)를 가리는 말이 그 안에도 들어 있다. 차례가
       * 거꾸로면 잊을 칸 고르기에서 커서를 안 옮기고 결정을 눌러 **첫 칸**을 잊는다.
       *
       * ⚠️ **잊은 뒤에는 글이 더 있다** — 「1, 2… 짠!」 · 「깨끗이 잊었다! 그리고…!」 ·
       * 「배웠다!」(60 · 61). 그것을 넘겨야 배운다. 그래서 **배웠는지를 먼저 보고**, 아니면
       * 글을 넘긴다. 이 갈래는 배지 6·7 전까지 판에서 한 번도 안 탔다 — 앞 구간은 빈 칸이
       * 있는 마리에게만 가르쳤다(2026-09-24 탐침 4판에서 파도타기·공중날기 둘 다 못 배웠다)
       */
      let forgot = false
      for (let step = 0; step < 14; step++) {
        if ((await knows() ?? -1) >= 0) break
        const text = await screen()
        // 앞의 계기판 글(FPS · 시계)을 떼고 적는다 — 160자로 자르면 물음이 안 남았다
        said2.push(text.replace(/^[sS]*?디지털시계/, '').slice(0, 300))
        if (text.includes('어느 기술을')) {
          const forget = (movesBefore?.[i]?.moves ?? []).findIndex((m) => !keep.includes(m))
          // 지킬 것만 남았으면 「그만둔다」(다섯째 칸)로 물러난다 — 아무것도 안 잊는다
          const down = forget < 0 ? (movesBefore?.[i]?.moves.length ?? 4) : forget
          for (let k = 0; k < down; k++) await tap('ArrowDown', 120)
          await tap('Space', 400)
          forgot = forget >= 0
          continue
        }
        if (text.includes('잊게 하겠습니까')) { await tap('Space', 300); continue }
        // 「그만둔다」 뒤의 「포기하겠습니까?」 — 예. 지킬 기술만 남은 마리는 배우지 않는다
        if (text.includes('포기하겠습니까')) { await tap('Space', 400); break }
        // 잊은 뒤의 글 — 넘긴다. 잊기 전이면 물음이 아닌 글(「배울 수 없다」 따위)이라 그만둔다
        if (forgot) { await tap('Space', 350); continue }
        break
      }
      learned = await knows() ?? -1
      if (learned >= 0) break
      await tap('ArrowRight', 120)
    }
    }
    for (let i = 0; i < 8 && (await now()).menu !== undefined; i++) await tap('KeyX', 120)
    await settle()
    const bagAfter = await bagState()
    const movesAfter = (await partyState())?.map((one) => ({
      species: one.species, moves: one.moves.map((m) => m.move),
    })) ?? null
    /** 이 걸음에 사라진 기술들 — 마리마다 「전에 있었는데 지금 없는 것」 */
    const lost = movesBefore === null || movesAfter === null ? null
      : movesBefore.flatMap((was, i) => {
        const now2 = movesAfter[i]
        if (now2 === undefined || now2.species !== was.species) return []
        return was.moves.filter((m) => !now2.moves.includes(m))
          .map((m) => ({ slot: i, species: was.species, move: m }))
      })
    return {
      ok: learned >= 0, slot: learned, ms: Date.now() - t0, said: said2,
      // 비전머신은 써도 안 없어진다 (`PartyScreen`의 `index < 92`)
      have: bagAfter?.items.find((one) => one.item === item)?.count ?? 0,
      // ⚠️ **잊은 기술은 결함이 아니라 값이다** — 사람이 보고 판단할 자리다
      lost, movesBefore, movesAfter,
      why: learned >= 0 ? null : '아무도 못 배웠다',
    }
  }

  /**
   * **이상한사탕을 먹인다** (`docs/orders/RARE_CANDY_20260917.md`).
   *
   * ⚠️ 사탕을 가방에 넣는 것은 부르는 쪽의
   * 개발 모듈이고, 먹이는 것은 사람이 누르는 길 그대로다 — 가방에서 결정 →
   * 파티 화면에서 그 자리로 → 결정 → 「레벨 올랐다」· 오른 폭 · 새 능력치 ·
   * 배운 기술을 결정으로 넘긴다 → 진화가 걸리면 진화 화면을 끝까지 본다.
   *
   * 한 알이 끝났는지는 **화면 이름**으로 본다. 진화가 없으면 파티 화면이 가방으로
   * 돌아가고, 진화가 걸리면 메뉴가 다 닫힌다. ⚠️ 가방으로 돌아온 뒤 결정을 한 번
   * 더 누르면 **다음 알을 먹이러 간다** — 그래서 거기서 바로 멈춘다.
   *
   * 칸이 찼을 때의 물음은 `forget`이 정한다 — 기본은 `teachHm`과 같게 **첫 칸**을
   * 잊는다. 진단은 답을 차례로 줄 수 있다(`['refuse', 1]` = 첫 물음은 거절, 다음
   * 물음은 둘째 칸을 잊는다). 목록이 다하면 다시 첫 칸이다.
   * 올랐는지는 글이 아니라 **파티의 레벨**로 잰다
   *
   * @returns `{ ok, fed, level, species, said }`
   */
  const feedCandy = async (slot, toLevel, budgetMs = 600_000, { forget = [] } = {}) => {
    const CANDY = 50
    const t0 = Date.now()
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const said3 = []
    /** 칸이 찼을 때 무엇으로 답했나 — 진단이 이 자취를 본다 */
    const asks = []
    const answers = [...forget]
    let fed = 0
    const screen = async () => page.evaluate(
      () => (document.body.innerText ?? '').replace(/\s+/g, ' '),
    ).catch(() => '')
    const done = (extra) => ({ fed, said: said3, asks, ms: Date.now() - t0, ...extra })
    for (;;) {
      const party = await partyState()
      if (party === null) return done({ ok: false, unknown: true, why: `파티를 못 읽었다 (${obs.kind})` })
      const mon = party[slot]
      if (!mon) return done({ ok: false, why: `${String(slot)}번 자리가 비었다` })
      if (mon.level >= toLevel) return done({ ok: true, level: mon.level, species: mon.species, why: null })
      if (Date.now() >= till) return done({ ok: false, level: mon.level, why: '시간이 다 됐다' })
      const at = await openBagAt(CANDY, till)
      if (!at.ok) { await closeMenus(); return done({ ...at, level: mon.level }) }
      await tap('Space', 300)
      for (let i = 0; i < 30 && (await now()).menu !== 'party'; i++) await page.waitForTimeout(150)
      if ((await now()).menu !== 'party') {
        await closeMenus()
        return done({ ok: false, level: mon.level, why: '파티 화면이 안 열렸다' })
      }
      for (let i = 0; i < slot; i++) await tap('ArrowRight', 90)
      await tap('Space', 250)
      fed++
      // 한 알의 끝까지 넘긴다. 진화 화면은 도는 동안 결정을 안 받으니 넉넉히 기다린다
      const stopAt = Math.min(Date.now() + 90_000, till)
      while (Date.now() < stopAt) {
        const s = await now()
        if (s.menu === 'bag' || s.menu === null) break
        const text = await screen()
        // 글띠는 화면 **끝**에 있다 — 앞쪽은 계기판 글이다
        if (said3.at(-1) !== text.slice(-120)) said3.push(text.slice(-120))
        /**
         * 「다른 기술을 잊게 하겠습니까?」 — 커서는 「예」에 선다.
         *
         * · 거절한다 → ↓「아니오」 → 「포기하겠습니까?」의 「예」 (**기본**)
         * · n번째 칸을 잊는다 → 예 · ↓를 n번
         *
         * ⚠️ **기본은 거절이다.** 한때 기본이 `0`(첫 칸을 잊는다)이었는데,
         * 첫 칸은 대개 **제일 센 기술**이다 — 실측(2026-09-22 배지5 탐침 1판):
         * 들판 체육관 앞에서 토대부기 L38→L39 사탕 한 알에 `광합성`을 배우며
         * **지진을 잊었다**(`asks: [{at:1, answer:"0"}]`). 사탕은 **레벨을
         * 맞추려고** 먹이는 것이지 기술을 바꾸려는 것이 아니고, 관장 앞에서
         * 주력기를 잃는 것이 새 기술 하나보다 훨씬 나쁘다. 바꾸고 싶으면
         * 부르는 쪽이 `forget`으로 **말해야** 한다 (`_candy42`가 그 길이다)
         */
        if (text.includes('잊게 하겠습니까')) {
          const answer = answers.length > 0 ? answers.shift() : 'refuse'
          asks.push({ at: fed, answer: String(answer) })
          if (answer === 'refuse') {
            await tap('ArrowDown', 200)   // 아니오
            await tap('Space', 300)
            await tap('Space', 300)       // 「포기하겠습니까?」 — 예
            continue
          }
          await tap('Space', 300)         // 예
          // 목록이 실제로 뜬 뒤에 고른다 — 안 기다리면 ↓가 허공으로 간다
          for (let i = 0; i < 20 && !(await screen()).includes('어느 기술을'); i++) {
            await page.waitForTimeout(150)
          }
          for (let i = 0; i < Number(answer); i++) await tap('ArrowDown', 150)
          await tap('Space', 300)
          continue
        }
        if (text.includes('어느 기술을')) { await tap('Space', 300); continue }
        await tap('Space', 250)
        if (s.menu === 'evolution') await page.waitForTimeout(250)
      }
      await closeMenus()
      const after = (await partyState())?.[slot]
      if (after && after.level <= mon.level) {
        return done({ ok: false, level: after.level, why: `먹였는데 레벨이 ${String(after.level)} 그대로다` })
      }
    }
  }

  /**
   * **앞을 막은 바위를 깬다** (`OBJ_EVENT_GFX_ROCK_SMASH` · 스프라이트 85).
   *
   * 험한 샛길(254)이 그 자리다 — 204번도로 남쪽에서 (19,50)으로 들어와
   * 북쪽 출구 (28,44)로 나가야 하는데 (23,44)에 바위가 있다. 실측(2026-09-16
   * 대표 구간 한 판)으로 하네스가 그 앞 (22,44)에서 314번을 나아가고도 못 나갔다 —
   * **막은 것은 원작이고, 빠진 것은 바위깨기였다.**
   *
   * 바위는 말 거는 길로 걸린다 (`events.json`의 스크립트 10001). 앞에 서서 A를
   * 누르면 「바위깨기를 쓸까?」가 뜨고 `clearTalk`가 「예」를 고른다 —
   * 그 갈래는 이미 롬의 차례(MENU_YES → MENU_NO)로 맞춰져 있다.
   *
   * ⚠️ **다 깨지 않는다.** 험한 샛길에만 스물일곱 개가 있고 길에 필요한 것은
   * 몇 개뿐이다. **가까운 것부터 하나씩** 깨고 그때마다 목적지로 가 본다
   */
  /**
   * **길을 막는 물체를 치우고 지나간다** — 바위(85)든 나무(86)든 같은 걸음이다.
   *
   * 원작이 셋을 한 자리에서 다룬다(`actor/obstacles.ts`의 `OBSTACLE_MOVE`): 마주
   * 보고 A → 「…을 쓰겠습니까」 → 예. 치웠는지는 **게임에게 묻는다**(`obstacleAt`) —
   * 화면 글로 재면 「깼다」와 「이 포켓몬은 …을 쓸 수 없다」가 글자 맞추기가 된다.
   *
   * ⚠️ **가까운 것부터 친다.** 영원시티의 나무 셋(304~306,521)은 나란히 서서 문 하나를
   * 막으므로 하나만 베도 길이 난다 — 다 베지 않는다. 한 번 치우고 목적지로 가 보고,
   * 닿았으면 끝이다
   */
  const clearWay = async (mapId, to, budgetMs, { sprite = 85, maxHits = 4 } = {}) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const what = sprite === 86 ? '나무' : sprite === 84 ? '큰바위' : '바위'
    const rocks = npcsOf(mapId).filter((one) => one.sprite === sprite)
    const broke = []
    if (rocks.length === 0) return { ok: false, why: `맵 ${String(mapId)}에 ${what}가 없다`, broke }
    for (let i = 0; i < maxHits && Date.now() < till; i++) {
      const at = await now()
      if (!at.ok || at.map !== mapId) return { ok: false, why: `그 맵을 벗어났다 (맵 ${String(at.map)})`, broke }
      const left2 = rocks
        .filter((r) => !broke.some((b) => b.x === r.x && b.z === r.z))
        .sort((a, b) => (Math.abs(a.x - at.x) + Math.abs(a.z - at.z))
          - (Math.abs(b.x - at.x) + Math.abs(b.z - at.z)))
      if (left2.length === 0) return { ok: false, why: `치울 ${what}가 더 없다`, broke }
      const rock = left2[0]
      const said = await talkTo(mapId, { x: rock.x, z: rock.z },
        Math.min(180_000, till - Date.now()))
      await clearTalk()
      await settle()
      const still = await obs.obstacleAt(rock.x, rock.z)
      const gone = still.known ? still.value === null : null
      broke.push({ ...rock, said, gone })
      if (gone === true) obstacleGone(mapId, rock.x, rock.z)
      log(`  ${what} (${String(rock.x)},${String(rock.z)}) → `
        + `${said ? '말을 걸었다' : '못 걸었다'} · ${gone === null ? '확인 불가' : gone ? '치웠다' : '그대로다'}`)
      const went = await goTo(to, Math.min(240_000, till - Date.now()))
      if (went === 'arrived') return { ok: true, broke, went }
    }
    return { ok: false, why: `${what}를 치웠는데도 길이 안 열렸다`, broke }
  }

  /**
   * **자전거를 탄다** — 가방에서 자전거를 고르는 그 길이다 (`ui/menu/itemAction`의 `bike`).
   *
   * ⚠️ **`useItem`으로는 못 잰다.** 그쪽은 「개수가 줄었나」로 판정하는데 자전거는
   * 열쇠도구라 안 준다. 여기서는 게임의 `CheckPlayerOnBike`가 읽는 그 값(`riding`)을
   * 본다. 이미 타고 있으면 안 누른다 — 누르면 **내린다**
   */
  const rideBike = async (budgetMs = 120_000) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const was = await obs.riding()
    if (!was.known) return { ok: false, unknown: true, why: was.why }
    if (was.value === true) return { ok: true, already: true }
    const at = await openBagAt(BIKE_ITEM, till)
    if (!at.ok) { await closeMenus(); return at }
    await tap('Space', 400)
    await closeMenus()
    const now2 = await obs.riding()
    const ok = now2.known && now2.value === true
    return { ok, why: ok ? null : now2.known ? '안 탔다 (그 자리에서는 못 탄다고 했을 수 있다)' : now2.why }
  }
  const riding = async () => {
    const r = await obs.riding()
    return r.known ? r.value : null
  }
  /** 연고 체육관 문 답을 **읽는다** (`observe.hearthomeDoor`). 못 읽으면 null */
  const hearthomeDoor = async () => {
    const r = await obs.hearthomeDoor()
    return r.known ? r.value : null
  }

  const smashWay = async (mapId, to, budgetMs, maxRocks = 4) =>
    clearWay(mapId, to, budgetMs, { sprite: 85, maxHits: maxRocks })

  /**
   * 풀밭 위를 왕복해서 야생을 만난다.
   *
   * ⚠️ **지나가다 만나기를 기다리면 안 된다.** 같은 길을 세 번 몰았는데 야생이
   * 3회·0회·0회였다 — 길이 풀밭을 스치는지가 그때그때 달라서다. 여기서는
   * **풀 칸만 골라 밟는다**
   */
  const grindForWild = async (mapId, budgetMs, onBattle = null) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const here = matrixOf(mapId)
    const grass = encounterTiles(mapId)
    if (grass.length === 0) return `맵 ${String(mapId)}에 풀이 없다`
    const doors = warpsOf(mapId)
    let i = 0
    while (Date.now() < till) {
      const s = await now()
      if (s.scene === 'battle') { await (onBattle ?? fightThrough)(); return 'battle' }
      if (s.talk || s.scene === 'menu') { await clearTalk(); continue }
      if (s.script) { await tap('Space'); continue }
      if (!s.ok || s.map !== mapId) return `풀밭을 벗어났다 (맵 ${String(s.map)})`
      // 지금 자리에서 가장 가까운 풀 칸부터. 밟을 때마다 다른 칸을 고른다
      const want = grass[(i++ * 7) % grass.length]
      const keys = planned(here, { x: s.x, z: s.z }, (x, z) => x === want.x && z === want.z,
        {
          avoid: (x, z) => doors.some((w) => w.x === x && w.z === z),
          // ⚠️ **풀밭을 오가다 건물에 들어가지 않는다** (지시서 §1.1)
          avoidStep: noDoorStep(mapId),
        }, '풀 칸').keys
      if (keys === null || keys.length === 0) continue
      const how = await walk(keys, { x: s.x, z: s.z }, mapId)
      if (how === 'battle') { await (onBattle ?? fightThrough)(); return 'battle' }
    }
    return '시간이 다 됐다'
  }

  /**
   * **열려 있는 야생 배틀에서 볼을 던진다.**
   *
   * 사람이 하는 길 그대로다 — 명령 단의 「가방」 → 주머니를 **볼**로 옮기고
   * → 첫 줄을 고른다. 주머니 차례는 원작의 `enum BattlePocketIndex`라
   * (`ui/battle/BattleBag`의 `CATEGORY`) 회복·상태·**볼**·배틀용이고, 그래서
   * 오른쪽으로 두 번이다. 글자로 찾지 않는다 — 탭 이름은 **롬에서 읽어** 오므로
   * 로케일을 바꾸면 달라진다.
   *
   * ⚠️ **잡혔는지는 파티로 안다.** 화면 글로 재면 「잡았다」와 「아깝다」를
   * 가르는 일이 글자 맞추기가 된다. 파티가 한 마리 늘었으면 잡은 것이다.
   *
   * ⚠️ **볼이 떨어지면 그만둔다.** 볼 주머니가 비면 줄이 하나도 안 뜨고,
   * 그때 결정을 눌러 봐야 아무 일이 없다 — 그 자리에서 배틀을 싸워 끝낸다
   */
  const throwBalls = async (budgetMs, maxThrows = 4) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const was = (await partyState())?.length ?? null
    let thrown = 0
    let why = ''
    /** 마지막으로 본 칸들 — 왜 안 나갔는지가 여기 있다 */
    let saw = null

    /** 지금 화면의 칸 글자들. 대사가 흐르는 동안은 **빈 목록**이다 */
    const panel = async () => {
      const all = await page.locator('button').allInnerTexts()
      return all.map((t) => t.replace(/\s+/g, ' ').trim())
        .filter((t) => t !== '' && !t.startsWith('FPS'))
    }
    const has = (list, text) => list.some((t) => t.includes(text))

    /**
     * ⚠️ **정해진 순서로 키를 쏘면 안 된다.** 실측(`_bag42`, 2026-09-16): 명령 단이
     * 떠 있을 때 ↓를 한 번 눌렀더니 **다음 순간 칸이 하나도 없었다** — 대사가
     * 흐르는 동안 화면이 메뉴를 아예 안 그린다(`BattleScreen`의 `reading`).
     * 그래서 「↓ · 결정 · → · → · 결정」을 줄줄이 보내면 절반이 허공에 떨어지고,
     * 밖에서는 「볼을 다섯 번 던졌는데 가방은 여섯 그대로」로 보인다.
     *
     * 한 걸음 누르고 **그 걸음이 먹었는지 보고** 다음을 누른다
     */
    const waitFor = async (want, rounds = 40) => {
      for (let i = 0; i < rounds; i++) {
        const list = await panel()
        saw = list
        if (want(list)) return list
        // 칸이 없으면 대사가 흐르는 중이다 — 넘겨 준다
        await tap('Space', 90)
      }
      return null
    }

    while (Date.now() < till && thrown < maxThrows) {
      const at = await now()
      if (at.scene !== 'battle') { why = '배틀이 끝났다'; break }

      // ① 명령 단을 기다린다
      const root = await waitFor((list) => has(list, '싸운다'))
      if (root === null) { why = `명령 단이 안 떴다 (${JSON.stringify(saw?.slice(0, 6))})` ; break }
      // ⚠️ **트레이너전에는 볼을 못 쓴다** — 원작이 막고 우리도 막는다.
      // 그 사실을 「볼이 없다」로 적으면 가방을 뒤지게 된다
      if (has(root, '도망칠 수 없다')) { why = '트레이너전이라 볼을 못 쓴다'; break }

      // ② 가방으로 (싸운다 → **가방**). 커서는 안 돌아간다 (`clampCursor`)
      await tap('ArrowDown', 90)
      await tap('Space', 150)
      /**
       * ③④ **몬스터볼이 보일 때까지 주머니를 넘긴다.**
       *
       * ⚠️ **첫 주머니가 비었다고 그만두면 안 된다.** 실측(`_catch42` 4·5판):
       * 가방을 열면 주머니 이름 넷(회복·상태·볼·배틀용)만 뜨고 줄이 하나도
       * 없었다 — 첫 배지 자리의 가방에는 **회복 주머니가 비어 있어서**다
       * (몬스터볼 여섯은 볼 주머니에 있다). 줄이 뜰 때까지 기다리다 그만두면
       * 볼을 한 번도 못 던지고 「가방에 볼이 없다」로 적힌다.
       *
       * ⚠️ **주머니 차례를 세지 않고 글자로 찾는다.** 도구 표는 화면이 그때
       * 받아 오므로(`BattleBag`의 `loadItems`) 한 주머니마다 잠깐 기다려 준다
       */
      const ballRow = async (rounds) => {
        for (let i = 0; i < rounds; i++) {
          const list = await panel()
          saw = list
          if (list.some((t) => t.includes('몬스터볼'))) return true
          await page.waitForTimeout(200)
        }
        return false
      }
      /**
       * ⚠️ **첫 주머니에서 넉넉히 기다린다.** 도구 표는 가방을 처음 열 때 한 번
       * 받아 오는데(`BattleBag`의 `loadItems`), 그 왕복이 기계 사정에 따라
       * 몇 초씩 걸린다. 실측(2026-09-16): 1.6초씩 기다린 판은 주머니 이름 넷만
       * 보고 「몬스터볼이 없다」로 떨어졌고, 같은 코드가 다른 판에서는 잡았다 —
       * 끊은 것은 가방이 아니라 **기다린 길이**다. 첫 번만 10초를 준다
       */
      let ready = await ballRow(50)
      for (let i = 0; i < 4 && !ready; i++) {
        await tap('ArrowRight', 150)
        ready = await ballRow(10)
      }
      if (!ready) {
        why = `가방에 몬스터볼이 안 보인다 (${JSON.stringify(saw?.slice(0, 8))})`
        await tap('KeyX', 90)
        break
      }
      // ⑤ 첫 줄이 몬스터볼이다 — 커서는 주머니를 옮길 때마다 0으로 돌아간다
      await tap('Space', 250)
      thrown++

      // ⑥ 결말이 날 때까지 넘긴다. 잡히면 배틀이 끝난다
      for (let i = 0; i < 80; i++) {
        const s2 = await now()
        if (s2.scene !== 'battle') break
        const list = await panel()
        if (has(list, '싸운다')) break
        await tap('Space', 90)
      }
      const party = await partyState()
      if (party !== null && was !== null && party.length > was) {
        return { caught: true, thrown, party, saw }
      }
    }
    const party = await partyState()
    const caught = party !== null && was !== null && party.length > was
    return { caught, thrown, party, saw, why: caught ? '' : (why || '볼을 다 썼는데 안 잡혔다') }
  }

  /**
   * **도망친다** — 찾던 마리가 아닐 때 쓰는 길이다.
   *
   * 첫 단의 넷은 `useListCursor`라 **안 돌아간다** (`ui/battle/BattleScreen`의
   * `RootMenu`) — 싸운다·가방·포켓몬·도망친다 차례라 ↓ 셋에 결정이다.
   *
   * ⚠️ **눈 감고 키를 쏘지 않는다.** 대사가 흐르는 동안은 화면이 메뉴를 아예
   * 안 그린다(`reading`) — 첫 단이 뜬 것을 보고 누른다. 볼을 던질 때 배운
   * 그 자리다.
   *
   * ⚠️ **도망은 실패한다.** 원작의 확률이 그대로 있으므로(`TryEscape`) 못
   * 도망친 판은 그대로 돌려주고, 부르는 쪽이 싸워서 끝낸다
   */
  const runAway = async (budgetMs = 60_000) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const panel = async () => {
      const all = await page.locator('button').allInnerTexts()
      return all.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '' && !t.startsWith('FPS'))
    }
    while (Date.now() < till) {
      const at = await now()
      if (at.scene !== 'battle') return true
      const list = await panel()
      if (!list.some((t) => t.startsWith('싸운다'))) { await tap('Space', 90); continue }
      // 트레이너전에서는 도망 칸이 꺼져 있다 — 눌러도 아무 일이 없다
      if (list.some((t) => t.includes('도망칠 수 없다'))) return false
      for (let i = 0; i < 3; i++) await tap('ArrowDown', 80)
      await tap('Space', 200)
      for (let i = 0; i < 30; i++) {
        const s2 = await now()
        if (s2.scene !== 'battle') return true
        const again = await panel()
        // 첫 단이 다시 떴으면 **못 도망쳤다** (원작의 확률 그대로다)
        if (again.some((t) => t.startsWith('싸운다'))) return false
        await tap('Space', 90)
      }
    }
    return false
  }

  /**
   * 그 맵 풀숲에서 **한 마리를 잡는다.**
   *
   * ⚠️ **안 잡히면 그 배틀은 싸워서 끝낸다.** 볼만 던지다 상대에게 맞아
   * 쓰러지면 전멸해서 되돌려 보내지고, 그러면 그 뒤 걸음이 전부 엉뚱한 자리에서
   * 시작한다 — 「잡기」가 「길 잃기」로 보이는 자리다
   */
  const catchInGrass = async (mapId, budgetMs, maxTries = 6, want = null) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    const was = (await partyState())?.length ?? null
    const tried = []
    /** 이번에 나온 것이 **찾던 마리인가.** 못 읽으면 가리지 않는다 */
    /** 걸러 본 자취 — 무엇이 나왔고 왜 던졌나. 「못 읽어서 던졌다」도 여기 남는다 */
    const saw = []
    /**
     * 이번에 나온 것이 **찾던 마리인가.**
     *
     * ⚠️ **배틀이 열린 그 순간에는 아직 못 읽는다.** 상대는 `view.active.p2a`에
     * 들어오는데 그것이 채워지기 전에 물으면 `null`이다 — 그때 「모르니 던진다」로
     * 접었더니 **찌르꼬를 찾는 판에서 비버니를 잡고도 「찌르꼬 잡았다」로 적혔다**
     * (실측 2026-09-16 `_north42` 4판). 그래서 **읽힐 때까지 몇 번 더 묻고**,
     * 끝내 못 읽으면 그 사실을 자취에 남긴다 — 조용히 아무나 잡지 않는다
     */
    const wanted = async () => {
      if (want === null) return true
      for (let i = 0; i < 20; i++) {
        const r = await obs.foeNow()
        if (r.known && r.value !== null && r.value.species != null) {
          const yes = want.includes(r.value.species)
          saw.push({ species: r.value.species, level: r.value.level, threw: yes })
          return yes
        }
        await page.waitForTimeout(250)
      }
      saw.push({ species: null, threw: true, why: `상대를 못 읽었다 (${obs.kind})` })
      return true
    }
    for (let t = 0; t < maxTries && Date.now() < till; t++) {
      const how = await grindForWild(mapId, Math.min(180_000, till - Date.now()), async () => {
        /**
         * ⚠️ **나온 것마다 볼을 던지지 않는다.** 실측(2026-09-16 `_north42`):
         * 204번도로 남쪽에서 두 번 다 **꼬몽울**이 잡혔다 — 풀 타입이라 유채에게
         * 아무 쓸모가 없고, 비전머신06도 못 배운다. 그 표에는 찌르꼬(비행)와
         * 비버니(바위깨기를 배운다)도 같이 있다 (`encounters.json` 143번 표).
         * 사람도 나온 것을 보고 정한다 — 찾던 것이 아니면 **싸워서** 끝낸다
         * (경험치는 그대로 남는다)
         */
        if (!await wanted()) {
          /**
           * ⚠️ **안 찾던 마리와 매번 싸우면 못 버틴다.** 실측(2026-09-16
           * `_north42` 3판): 모부기 한 마리로 찌르꼬를 기다리다 **무쇠 센터(48)로
           * 되돌려 보내졌다** — 「풀밭을 벗어났다」로 적힌 그 줄이 전멸이다.
           * 사람도 안 찾는 마리에게서는 도망친다. 못 도망치면 싸워서 끝낸다
           */
          if (!await runAway(Math.min(60_000, till - Date.now()))) {
            const s2 = await now()
            if (s2.scene === 'battle') await fightThrough()
          }
          return
        }
        const got = await throwBalls(Math.min(150_000, till - Date.now()))
        tried.push(got)
        // 안 잡혔으면 남은 배틀은 싸워서 끝낸다
        if (!got.caught) {
          const s = await now()
          if (s.scene === 'battle') await fightThrough()
        }
      })
      const party = await partyState()
      if (party !== null && was !== null && party.length > was) {
        return {
          ok: true, tries: tried.length, party, met: saw,
          /** **실제로 들어온 마리.** 찾던 것과 다를 수 있다 — 그러면 그게 사실이다 */
          got: party.at(-1)?.species ?? null,
          wanted: want, saw: tried.at(-1)?.saw ?? null,
          thrown: tried.reduce((a, b) => a + b.thrown, 0),
        }
      }
      if (how !== 'battle' && how !== '시간이 다 됐다') {
        return { ok: false, why: how, tries: tried.length, party }
      }
      if (tried.at(-1)?.why?.startsWith('가방에 몬스터볼이') === true) {
        return { ok: false, why: String(tried.at(-1)?.why), tries: tried.length, party }
      }
    }
    return {
      ok: false, why: '풀밭을 돌았는데 못 잡았다', tries: tried.length,
      party: await partyState(), saw: tried.at(-1)?.saw ?? null,
      thrown: tried.reduce((a, b) => a + b.thrown, 0),
    }
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
  /**
   * 주인공이 **지금 어느 쪽을 보고 있나** (`DIR` — 북 0 · 남 1 · 서 2 · 동 3).
   *
   * ⚠️ **돌아섰다고 믿지 않는다.** 방향키 한 번으로 도는 것은 **그 칸이 막혀
   * 있을 때**뿐이고, 떨어지기도 한다. A는 **보는 칸**에 가므로, 안 돌았으면
   * 엉뚱한 칸에 눌린다 — 그때 아무 일도 안 일어나면 밖에서는 「입력이 안 먹었다」와
   * 구별이 안 된다
   */
  const facing = async () => {
    const r = await obs.facingDir()
    return r.known ? r.value : null
  }
  /** 그 맵의 **지금** 사람 자리들. 못 읽으면 `null` — 빈 목록으로 안 접는다 */
  /**
   * **게임 자신에게 그 칸을 묻는다** (`observe.blockedAt` · `observe.solidAt`).
   *
   * ⚠️ **「길은 있는데 안 걸어진다」는 이 둘로만 갈린다.** 계획은 우리 격자로
   * 세우고 막는 것은 게임이라, 어긋나면 하네스는 영영 같은 칸에 부딪힌다.
   * 못 읽으면 `null`이다 — 「안 막혔다」로 접지 않는다
   */
  const gameBlocked = async (x, z) => {
    const r = await obs.blockedAt(x, z)
    return r.known ? r.value : null
  }
  const gameSolid = async (x, z) => {
    const r = await obs.solidAt(x, z)
    return r.known ? r.value : null
  }

  const npcSpots = async (mapId) => {
    const r = await obs.npcSpots(mapId)
    return r.known ? r.value : null
  }
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
    await page.evaluate(watchMapScene, 311)
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
    const ranDuringEntry = await page.evaluate(() => globalThis.__rpMapSceneWatch.finish())
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
    let ran = ranDuringEntry
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
  /**
   * 뒤에 이어 가는 걸음(`after`)에 넘기는 **길잡이 한 벌**.
   *
   * ⚠️ **한 벌만 둔다.** 예전에는 `skipStory` 갈래와 새 게임 갈래가 목록을 따로
   * 적었고, `npcSpots`·`facing`이 앞쪽에만 들어갔다. `--from`으로 이어 달린 판은
   * 장막 체육관을 지났는데, 새 게임부터 한 판으로 처음 거기 닿은 13판(2026-09-24)이
   * 문간에서 `api.npcSpots is not a function`으로 터졌다
   */
  const handles = () => ({
    goTo, stepOn, talkTo, talkToNpc, npcSpot, grindForWild, catchInGrass, throwBalls,
    settle, now, tap, clearTalk,
    partyState, healAt, fullyHealed, buyAt, storyVars, bagState, eternaWalls,
    veilstoneState, pastoriaState, featureWalls, veilstonePlan,
    teachHm, feedCandy, smashWay, clearWay, rideBike, riding, hearthomeDoor, npcSpots, facing,
    gameBlocked, gameSolid,
    flyTo, strengthPush, setSurf, surfLog, fieldState: () => obs.fieldState(),
    // 한 칸 걸음 — 체육관 풀이가 계획한 칸을 한 칸씩 밟는다. 판정은 부르는 쪽이 한다
    stepKey: (key, want) => stepOnce(key, want),
    /**
     * **판에 오르는 한 칸** — 그 칸에 닿았거나 **판이 움직이기 시작하면** 곧바로 키를 뗀다.
     *
     * ⚠️ `stepKey`로는 안 된다. 판이 주인공을 초당 9칸으로 옮기면 그 칸을 한 프레임만 밟아
     * 폴링이 놓치고, 1.5초까지 키를 누른 채로 있다 — 판이 멈추는 순간 조작이 풀려 그 방향으로
     * 걸어 내린다(2026-09-24 탐침 5판: 판 #10을 타다 (16,22)에 섰다)
     */
    rideStep: async (key, want) => {
      lastKeyAt = Date.now()
      const cap = Date.now() + 1_500
      await page.keyboard.down(key)
      let at = null
      while (Date.now() < cap) {
        at = await now()
        if (at.talk || at.scene !== 'overworld') break
        if (at.x === want.x && at.z === want.z) break
        const st = await obs.canalaveState()
        if (st.known && st.value?.busy === true) break
        await page.waitForTimeout(10)
      }
      await page.keyboard.up(key)
      return now()
    },
    canalavePlan: async (goal) => { const r = await obs.canalavePlan(goal); return r.known ? r.value : null },
    canalaveState: async () => { const r = await obs.canalaveState(); return r.known ? r.value : null },
    snowpointPlan: async (goal) => { const r = await obs.snowpointPlan(goal); return r.known ? r.value : null },
    iceState: async () => { const r = await obs.iceState(); return r.known ? r.value : null },
    runAway, useItem, usePotions, stopPotions,
    fightThrough,
    // ⚠️ **소포를 받는 걸음도 같이 넘긴다.** 새 게임 갈래는 트레이너전이 0일 때만
    // 부르는데(라이벌전이 이미 붙었으면 건너뛴다), 그 뒤로 더 가는 쪽은
    // **언제나** 소포가 있어야 한다 — 없으면 202번도로 서쪽이 막힌다
    getParcel,
    // 읽기만 하는 진단 손잡이. 짧은 재현이 막힌 자리를 그대로 적는 자리다
    lakeVars, snapshot, lakeVerity,
    log, left, maps, trouble, battles,
  })

  if (skipStory) {
    const only = after === null ? null : await after(handles())
    return {
      maps: [...maps], ...battles, shops, missed: [], trouble,
      plan: planSummary(), episodes: episodeSummary(), failedEpisodes: failedEpisodes(),
      blocks: blockSummary(),
      fights, movePicks, observer: obs.kind, extra: only,
      potions: { used: potion.used, left: potion.left, why: potion.why, misses: potion.misses, uses: potion.uses, rows: potion.rows },
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
  const extra = after === null ? null : await after(handles())

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
    /** 「새 기술을 배우겠는가」에 몇 번 답했나 */
    learnAsks,
    /** 규칙대로 갈아 낀 기술 — `잊은것→배운것`. 파티가 왜 그 기술을 들었는지가 여기 남는다 */
    learnTaught,
    /** 새것이 더 세지 않거나 기술표를 못 읽어 그대로 둔 횟수 */
    learnKept,
    /** 배틀 안에서 약을 몇 번 썼나 · 못 썼으면 까닭 */
    potions: { used: potion.used, left: potion.left, why: potion.why, misses: potion.misses, uses: potion.uses, rows: potion.rows },
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
