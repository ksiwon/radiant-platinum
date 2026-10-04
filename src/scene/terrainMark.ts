// **지형이 실제로 씬에 서 있는가** — 밖에서 읽을 수 있는 준비 경계
//
// ⚠️ **`data-restoring`이 풀린 것은 지형이 섰다는 뜻이 아니다.** 순회와 여정이
// 그동안 쓰던 조건(페이드 종료 · `restoring` 해제 · 맵 두 번 동일)은 **맵을
// 갈아 끼우는 쪽**의 신호고, 청크 모델은 그 뒤에 **비동기로** 온다
// (`ChunkModels`의 effect는 `loadTexSheet`와 청크 스물다섯 개를 기다린다).
// 그 사이에 찍은 컷은 하늘 한 장이다 — 실측(2026-09-08 판정용 journey)에서
// ⑮가 그렇게 떨어졌다.
//
// ⚠️ **시험용 뒷문이 아니다.** `sceneMark`·`sceneRefs`와 같은 자리다 — 이미
// 정해진 것을 밖에서 읽게만 하고, 여기에 값을 써서 게임을 움직일 길은 없다.
// 판정하는 쪽이 「기다릴 것」을 고정 시간이 아니라 **상태**로 잡게 하는 것이
// 이 파일이 있는 까닭이다.
import { cameraSystem } from '../engine/actor/camera'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { perfSnapshot } from './sceneRefs'
import { bdspFailed, bdspReady, bdspSettled } from './bdspReady'

/**
 * 마지막으로 **씬에 반영된** 청크 한 벌. `ChunkModels`가 커밋 뒤에 적는다.
 *
 * ⚠️ **state를 세팅한 순간이 아니라 커밋 뒤에 적는다.** `setPlaced`를 부른
 * 자리는 아직 씬이 아니다 — React가 그 배열로 `<group>`을 만들어 붙인 뒤라야
 * 무대에 있는 것이고, 그 시점은 `placed`를 보는 effect다
 */
const terrainMark = {
  /** 커밋된 그 요청의 번호 (`openTerrainRequest`) */
  req: -1,
  /** 이 한 벌이 어느 맵·행렬·청크의 것인가 */
  mapId: -1,
  matrix: -1,
  chunkIndex: -1,
  /** 받으려 한 청크 수와 실제로 세운 땅 조각 수 */
  want: 0,
  placed: 0,
  /** 청크를 못 받아 빈손으로 접었나 (`ChunkModels`의 `catch`) */
  failed: false,
  /** 그때 던져진 글. 오래 **삼키고 있던** 것이라 화면만 비고 아무 자국이 없었다 */
  why: null as string | null,
  /** 반영된 커밋 직후의 **표시 프레임 수**. 이 뒤로 한 장이 더 나가야 눈에 보인다 */
  frame: -1,
}

/** `ChunkModels`가 커밋 뒤에 부른다 */
export function markTerrain(
  one: { req: number, mapId: number, matrix: number, chunkIndex: number,
    want: number, placed: number, failed: boolean, why: string | null },
): void {
  terrainMark.req = one.req
  terrainMark.mapId = one.mapId
  terrainMark.matrix = one.matrix
  terrainMark.chunkIndex = one.chunkIndex
  terrainMark.want = one.want
  terrainMark.placed = one.placed
  terrainMark.failed = one.failed
  terrainMark.why = one.why
  terrainMark.frame = perfSnapshot.frames
}

/**
 * **한 건의 요청을 끝까지 잇는 자국.**
 *
 * ⚠️ **「끝내 안 끝났다」는 관측이 아니라 결론이다.** 판정용 판의 `stop-08`은
 * 화면에 앞 맵의 지형이 30초 남았는데, 밖에서 볼 수 있는 것은 **표식이 옛
 * 맵이다**뿐이었다 — 새 요청이 나갔는지, 자료를 못 받은 것인지, 받아 놓고
 * 못 세운 것인지, 세워 놓고 커밋이 안 된 것인지를 **가를 자리가 없었다.**
 *
 * ⚠️ **크기를 못 박는다.** 링 버퍼 한 벌이고 담는 것은 수와 짧은 글뿐이다 —
 * three 객체를 붙잡으면 그 자체가 누수가 된다
 */
const TRACE_ROWS = 240
const trace: { t: number, req: number, step: string, note: string }[] = []
let lastReq = 0

/**
 * 지금 **받으러 나가 있는** 한 벌. `ChunkModels`가 요청을 열 때 적는다.
 *
 * ⚠️ **「무엇이 최신인가」를 밖에서 다시 셈하면 안 된다.** 예전에는 표식의
 * 맵 번호를 `world.mapId`와 견줬는데, 오버월드는 **한 행렬에 존이 여럿**이라
 * 도로를 걸어 나가면 번호만 바뀌고 지형은 그대로다 — 그러면 걷는 내내
 * 「준비 안 됨」이 된다. 반대로 텍스처 묶음이 바뀌어 요청이 다시 나간
 * 경우는 번호만으로는 못 본다. 그래서 **요청을 낸 쪽이 신원을 적고**,
 * 준비 판정은 「가장 새 요청이 커밋됐는가」를 묻는다
 */
const terrainWanted = { req: 0, mapId: -1, matrix: -1, chunkIndex: -1, want: 0 }

/** 새 요청 한 건을 연다. 돌려주는 번호가 그 건의 신원이다 */
export function openTerrainRequest(
  one: { mapId: number, matrix: number, chunkIndex: number, want: number },
): number {
  lastReq += 1
  terrainWanted.req = lastReq
  terrainWanted.mapId = one.mapId
  terrainWanted.matrix = one.matrix
  terrainWanted.chunkIndex = one.chunkIndex
  terrainWanted.want = one.want
  traceTerrain(lastReq, 'requested',
    `맵 ${String(one.mapId)}/${String(one.matrix)} 칸 ${String(one.chunkIndex)} · 청크 ${String(one.want)}개`)
  return lastReq
}

/** 그 건이 어디까지 갔는지 한 줄 적는다 */
export function traceTerrain(req: number, step: string, note = ''): void {
  trace.push({ t: Math.round(performance.now()), req, step, note })
  if (trace.length > TRACE_ROWS) trace.splice(0, trace.length - TRACE_ROWS)
}

/** 밖에서 읽는다. 베낀 배열이라 읽는 쪽이 흔들 수 없다 */
export function terrainTrace(): readonly { t: number, req: number, step: string, note: string }[] {
  return trace.map((r) => ({ ...r }))
}

/**
 * 워프가 덮개를 든 동안 묻는다 — **새 맵의 지형이 씬에 섰는가** (`terrainReady`의 ③④⑤만) · **BDSP 층도 섰는가** (`bdspSettled`).
 *
 * `terrainReady`는 전이가 남았으면(`world.pending`) 늘 「아직」이다 — 워프는 덮개를 걷기 전까지 전이를 쥐고 있으므로 그것으로는
 * 못 묻는다 (`scene/asyncPipelines`의 `settleAsyncPipelines`).
 *
 * ⚠️ **BDSP 층을 같이 기다린다.** 원작 지형만 기다리면 덮개가 걷힌 뒤에 BDSP glb가 와서 방이나 마을이 한꺼번에 튀어나온다.
 * 못 받은 glb는 「섰다」로 센다(`bdspReady` 머리말) — 끝까지 안 오는 것은 `settleAsyncPipelines`의 상한이 끊는다
 */
export function terrainLanded(): boolean {
  const grid = world.grid
  if (grid === null) return false
  const p = worldState.player.position
  const chunk = grid.chunkIndexAt(Math.floor(p.x), Math.floor(p.z))
  if (terrainWanted.matrix !== world.matrix || terrainWanted.chunkIndex !== chunk) return false
  if (terrainMark.req !== terrainWanted.req) return false
  if (!bdspSettled()) return false
  if (terrainMark.failed) return true
  if (terrainMark.want > 0 && terrainMark.placed === 0) return false
  return perfSnapshot.frames - terrainMark.frame >= 1
}

/**
 * 지금 그려야 할 BDSP 열쇠 — 방 · 던전 · 둘레 지역 (`bdspReady`의 열쇠는 목차 이름 그대로다). `MapStreamer`가 `expectBdsp`로 알린다
 */
export function bdspWanted(room: string | null, dungeon: string | null, fields: readonly string[]): string[] {
  const out: string[] = []
  if (room !== null) out.push(room)
  if (dungeon !== null) out.push(dungeon)
  out.push(...fields)
  return out
}

/**
 * **BDSP가 지금 그림을 쥐는가** — **맨 앞 열쇠**가 실제로 서서 그려졌을 때만 참이다. 참이면 원작 지형을 숨긴다
 * (`ChunkModels`의 `dsHidden`). 맨 앞이 방 · 던전이고 야외면 플레이어에 가장 가까운 지역이다 — `useBdspFields`가 반 초마다
 * 지역 집합이 같아도 거리순으로 다시 줄 세우므로 「맨 앞」은 걷는 동안에도 가장 가까운 지역을 따라간다.
 *
 * ⚠️ **아무 지역 하나로 숨기면 발밑이 빈다.** 둘레의 작은 지역이 먼저 서자 꽃향기마을 첫 2.4초가 하늘과 사람뿐이었다
 * (트레일러 B4) — 발밑 큰 지역은 아직 받는 중이었다.
 *
 * ⚠️ **이름이 정해진 것만으로 숨기면 허공이 보인다.** 예전에는 둘레 지역 이름 목록이 서자마자 원작 땅을 숨겼는데, 지역 glb는
 * 받고 풀어서 늦게 온다 — 영원의 숲에서 205번도로로 나선 첫 화면이 하늘과 사람뿐이었다(story `20-forest`).
 * 실패한 열쇠는 안 선 것으로 센다 — 그때는 원작 그림이 그대로 남는다
 *
 * ⚠️ **열쇠 하나라도 실패했으면 거짓이다** (`bdspDegraded`). 맨 앞이 서 있고 먼 지역 하나만 못 받았을 때 원작 땅을 숨기면 그
 * 지역이 구멍이고, 맨 앞이 실패했는데 이웃 지역이 서 있으면 원작 땅과 이웃 BDSP가 겹쳐 그려진다. 그래서 하나라도 실패하면
 * 원작 땅이 서고 BDSP 지역은 모두 접는다 (`BdspField`의 `hidden`) — 어느 쪽이든 한 층만 그려진다
 */
export function bdspShowing(keys: readonly string[]): boolean {
  return keys.length > 0 && !bdspDegraded(keys) && bdspReady(keys[0]!)
}

/** 원하는 열쇠 중 못 세운 것이 있는가 — 있으면 BDSP 층을 접고 원작 그림으로 간다 */
export function bdspDegraded(keys: readonly string[]): boolean {
  return keys.some(bdspFailed)
}

/** 카메라가 「닿았다」고 볼 잔여 거리 (월드 단위 = 타일) */
const CAMERA_SETTLED = 0.25

interface TerrainReady {
  ok: boolean
  /** 왜 아직인가. `ok`면 null */
  why: string | null
  /** 지금 서 있어야 할 곳 */
  want: { map: number, matrix: number, chunk: number }
  /** 지금 받으러 나가 있는 한 벌 */
  asked: { req: number, map: number, matrix: number, chunk: number }
  /** 씬에 반영된 한 벌 */
  have: {
    req: number, map: number, matrix: number, chunk: number, placed: number, want: number,
    failed: boolean, why: string | null,
  }
  /** 반영 뒤에 나간 프레임 수 */
  framesSince: number
  pending: boolean
  restoring: boolean
  /** 카메라가 가려던 자리에서 떨어진 거리 */
  drift: number
}

/**
 * 지금 화면이 **판정할 만한가**. 다섯을 한 줄로 잇는다:
 *
 *   ① 격자가 서 있다 (`world.grid`)
 *   ② 처리할 전이가 없다 (`world.pending`) · 복원 중이 아니다
 *   ③ 씬에 반영된 청크 한 벌의 맵·행렬이 지금 것과 같다
 *   ④ 그 한 벌이 **지금 서 있는 칸의 청크**의 것이다 (늦게 온 앞 맵의 것이 아니다)
 *   ⑤ 그 뒤로 프레임이 한 장 이상 실제로 나갔다
 *   ⑥ 카메라가 가려던 자리에 닿았다 (`cameraSystem.drift`)
 *
 * ⚠️ **판정을 이미지로 정의하지 않는다.** 여기서 `ok`가 났는데 화면이
 * 틀렸으면 그건 **화면 결함**이지 「덜 기다린 것」이 아니다
 */
export function terrainReady(): TerrainReady {
  const grid = world.grid
  const p = worldState.player.position
  const chunk = grid === null ? -1 : grid.chunkIndexAt(Math.floor(p.x), Math.floor(p.z))
  const want = { map: world.mapId, matrix: world.matrix, chunk }
  const asked = {
    req: terrainWanted.req, map: terrainWanted.mapId,
    matrix: terrainWanted.matrix, chunk: terrainWanted.chunkIndex,
  }
  const have = {
    req: terrainMark.req,
    map: terrainMark.mapId, matrix: terrainMark.matrix, chunk: terrainMark.chunkIndex,
    placed: terrainMark.placed, want: terrainMark.want, failed: terrainMark.failed,
    why: terrainMark.why,
  }
  const drift = cameraSystem.drift
  const framesSince = perfSnapshot.frames - terrainMark.frame
  const pending = world.pending !== null
  const restoring = worldState.restoring
  const shape = { want, asked, have, framesSince, pending, restoring, drift: +drift.toFixed(2) }
  if (grid === null) return { ok: false, why: '격자가 아직 없다', ...shape }
  if (pending) return { ok: false, why: '처리할 전이가 남았다', ...shape }
  if (restoring) return { ok: false, why: '아직 복원 중이다', ...shape }
  /**
   * ⚠️ **맵 번호로 걸면 안 된다.** 오버월드는 **한 행렬 안에 존이 여럿**이다 —
   * 축복시티(3)에서 201번도로(342)로 걸어 나가는 것은 워프가 아니라 좌표
   * 연속이라 `MapStreamer`가 `world.mapId`만 바꾸고 격자도 칸도 그대로 둔다.
   * 그러면 `ChunkModels`의 effect가 안 돌고 표식은 들어올 때의 번호로 남는데
   * **그 지형이 맞다.** 번호로 걸면 도로를 걷는 내내 「준비 안 됨」이 된다.
   *
   * 그래서 두 걸음으로 묻는다: ⓐ **지금 나가 있는 요청**이 내가 선 자리의
   * 것인가(행렬·칸), ⓑ 그 요청이 **커밋됐는가**(번호가 같은가). 텍스처 묶음이
   * 바뀌어 요청이 다시 나간 경우도 ⓑ가 잡는다 — 밖에서 최신을 다시 셈하지 않고
   * **요청을 낸 쪽이 적은 신원**을 그대로 쓴다
   */
  if (asked.matrix !== want.matrix || asked.chunk !== want.chunk) {
    return { ok: false, why: `선 자리의 지형을 아직 부르지도 않았다 (부른 것: `
      + `맵 ${String(asked.map)}/${String(asked.matrix)} 칸 ${String(asked.chunk)}`
      + ` ≠ 선 곳: 맵 ${String(want.map)}/${String(want.matrix)} 칸 ${String(want.chunk)})`, ...shape }
  }
  if (have.req !== asked.req) {
    return { ok: false, why: `씬에 선 것이 앞 요청의 것이다 (#${String(have.req)} ≠ #${String(asked.req)}`
      + ` — 맵 ${String(have.map)}/${String(have.matrix)} 칸 ${String(have.chunk)})`, ...shape }
  }
  if (have.failed) {
    return { ok: false, why: `청크를 못 받아 빈손이다 — ${String(have.why)}`, ...shape }
  }
  if (have.want > 0 && have.placed === 0) {
    return { ok: false, why: `청크 ${String(have.want)}개를 받았는데 세운 땅이 0이다`, ...shape }
  }
  if (framesSince < 1) return { ok: false, why: '반영 뒤로 나간 프레임이 없다', ...shape }
  /**
   * ⚠️ **청크가 다 서도 카메라가 아직 미끄러지는 중일 수 있다.** 그때 화면은
   * 방이 위에서 내려오는 중이고 나머지가 검다 — 「못 그린 것」이 아니라
   * **아직 안 도착한 것**이다. 실측(2026-09-08 센터 왕복): 세 바퀴째에 지형
   * 칸 0/8이었고 그 반 초 뒤에 8/8이었다.
   *
   * 한 칸의 4분의 1을 문턱으로 둔다 — 걷는 동안의 잔여는 그보다 작고, 맵을
   * 갈아 낀 직후의 미끄러짐은 그보다 한참 크다
   */
  /**
   * ⚠️ **`drift > 문턱`으로 쓰면 NaN이 통과한다.** 비교가 늘 거짓이라 「닿았다」로
   * 읽힌다 — 카메라가 망가진 판이 곧 **통과하는 판**이 된다. 「닿았다」쪽을 물어
   * 유한하지 않으면 떨어지게 뒤집는다
   */
  if (!Number.isFinite(drift)) {
    return { ok: false, why: `카메라 잔여가 수가 아니다 (${String(drift)})`, ...shape }
  }
  if (drift > CAMERA_SETTLED) {
    return { ok: false, why: `카메라가 아직 ${drift.toFixed(2)}칸 미끄러지는 중이다`, ...shape }
  }
  return { ok: true, why: null, ...shape }
}
