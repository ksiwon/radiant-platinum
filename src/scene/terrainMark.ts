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
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { perfSnapshot } from './sceneRefs'

/**
 * 마지막으로 **씬에 반영된** 청크 한 벌. `ChunkModels`가 커밋 뒤에 적는다.
 *
 * ⚠️ **state를 세팅한 순간이 아니라 커밋 뒤에 적는다.** `setPlaced`를 부른
 * 자리는 아직 씬이 아니다 — React가 그 배열로 `<group>`을 만들어 붙인 뒤라야
 * 무대에 있는 것이고, 그 시점은 `placed`를 보는 effect다
 */
const terrainMark = {
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
  one: { mapId: number, matrix: number, chunkIndex: number,
    want: number, placed: number, failed: boolean, why: string | null },
): void {
  terrainMark.mapId = one.mapId
  terrainMark.matrix = one.matrix
  terrainMark.chunkIndex = one.chunkIndex
  terrainMark.want = one.want
  terrainMark.placed = one.placed
  terrainMark.failed = one.failed
  terrainMark.why = one.why
  terrainMark.frame = perfSnapshot.frames
}

interface TerrainReady {
  ok: boolean
  /** 왜 아직인가. `ok`면 null */
  why: string | null
  /** 지금 서 있어야 할 곳 */
  want: { map: number, matrix: number, chunk: number }
  /** 씬에 반영된 한 벌 */
  have: {
    map: number, matrix: number, chunk: number, placed: number, want: number,
    failed: boolean, why: string | null,
  }
  /** 반영 뒤에 나간 프레임 수 */
  framesSince: number
  pending: boolean
  restoring: boolean
}

/**
 * 지금 화면이 **판정할 만한가**. 다섯을 한 줄로 잇는다:
 *
 *   ① 격자가 서 있다 (`world.grid`)
 *   ② 처리할 전이가 없다 (`world.pending`) · 복원 중이 아니다
 *   ③ 씬에 반영된 청크 한 벌의 맵·행렬이 지금 것과 같다
 *   ④ 그 한 벌이 **지금 서 있는 칸의 청크**의 것이다 (늦게 온 앞 맵의 것이 아니다)
 *   ⑤ 그 뒤로 프레임이 한 장 이상 실제로 나갔다
 *
 * ⚠️ **판정을 이미지로 정의하지 않는다.** 여기서 `ok`가 났는데 화면이
 * 틀렸으면 그건 **화면 결함**이지 「덜 기다린 것」이 아니다
 */
export function terrainReady(): TerrainReady {
  const grid = world.grid
  const p = worldState.player.position
  const chunk = grid === null ? -1 : grid.chunkIndexAt(Math.floor(p.x), Math.floor(p.z))
  const want = { map: world.mapId, matrix: world.matrix, chunk }
  const have = {
    map: terrainMark.mapId, matrix: terrainMark.matrix, chunk: terrainMark.chunkIndex,
    placed: terrainMark.placed, want: terrainMark.want, failed: terrainMark.failed,
    why: terrainMark.why,
  }
  const framesSince = perfSnapshot.frames - terrainMark.frame
  const pending = world.pending !== null
  const restoring = worldState.restoring
  const shape = { want, have, framesSince, pending, restoring }
  if (grid === null) return { ok: false, why: '격자가 아직 없다', ...shape }
  if (pending) return { ok: false, why: '처리할 전이가 남았다', ...shape }
  if (restoring) return { ok: false, why: '아직 복원 중이다', ...shape }
  if (have.map !== want.map || have.matrix !== want.matrix) {
    return { ok: false, why: `씬에 선 청크가 다른 맵의 것이다 (${String(have.map)}/`
      + `${String(have.matrix)} ≠ ${String(want.map)}/${String(want.matrix)})`, ...shape }
  }
  if (have.chunk !== want.chunk) {
    return { ok: false, why: `씬에 선 청크가 다른 칸의 것이다 (${String(have.chunk)}`
      + ` ≠ ${String(want.chunk)})`, ...shape }
  }
  if (have.failed) {
    return { ok: false, why: `청크를 못 받아 빈손이다 — ${String(have.why)}`, ...shape }
  }
  if (have.want > 0 && have.placed === 0) {
    return { ok: false, why: `청크 ${String(have.want)}개를 받았는데 세운 땅이 0이다`, ...shape }
  }
  if (framesSince < 1) return { ok: false, why: '반영 뒤로 나간 프레임이 없다', ...shape }
  return { ok: true, why: null, ...shape }
}
