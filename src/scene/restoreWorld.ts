// 저장한 자리를 한 번에 세우는 절차 (야간 실행서 N1)
//
// ⚠️ **씬에서 떼어 낸 까닭.** 여기서 어긋나는 것은 그리기가 아니라 **순서**다 —
// 늦게 온 응답, 정리 뒤에 도착한 약속, 다시 마운트, 실패 뒤의 재시도. 그것을
// R3F 나무 안에 두면 브라우저를 켜야만 잴 수 있고, 그러면 한 판에 수십 초씩
// 드는 여정으로만 확인하게 된다. 순수한 함수로 내려 두면 노드에서 잰다.
//
// ⚠️ **`enter`는 여기 없다.** 실제로 들어서는 일은 `MapStreamer`가 쥔 것이고
// (격자·플레이어·존 이름·NPC를 한 번에 맞춘다), 이 파일이 쥐는 것은 **누가
// 그것을 부를 자격이 있는가**뿐이다.
import type { MapGrid } from '../engine/map/grid'
import { useRestoreStore } from '../state/restoreStore'

/** 저장이 가리키는 자리. `state/save/schema`의 `position`과 같은 모양이다 */
export interface RestoreTarget {
  map: number
  matrix: number
  x: number
  z: number
  y: number | null
}

interface RestoreDeps {
  /** 이미 손에 있는 오버월드 격자 (행렬 0) — 기다릴 것이 없다 */
  overworld: MapGrid
  /** 그 밖의 행렬을 받는다 (`scene/worldData`의 `gridFor`) */
  load: (matrix: number) => Promise<MapGrid>
  /**
   * 목적지에 들어선다. **이 복원에서 딱 한 번** 불린다.
   *
   * ⚠️ **전에는 두 번이었다.** 오버월드 기본 스폰으로 한 번, 격자가 오면
   * 저장 자리로 한 번. 그런데 들어서는 일에는 `enterMap`·`arriveAt`·
   * `journalChangedMap`·`roamersWarped`와 세이브의 `exit`·`flute`까지 딸려
   * 있어서, 저장이 실내를 가리키면 **가 본 적 없는 맵의 도착 처리가 매번 한
   * 번씩 돌았다**
   */
  settle: (grid: MapGrid) => void
}

/**
 * 복원 요청 하나를 연다.
 *
 * 돌려주는 것은 **이 요청을 무효로 하는 손잡이**다. 정리에서 반드시 불러야
 * 한다 — 안 부르면 떠난 화면에 늦은 응답이 `ready`를 쓴다.
 *
 * ⚠️ **`world.mapId` 비교가 세대를 대신하지 못한다.** 같은 맵으로 돌아온
 * 세대는 번호가 달라도 `mapId`가 같아서, 앞 세대의 늦은 응답이 「내 차례다」로
 * 읽힌다. 그래서 번호를 들고 다닌다
 */
export function startRestore(at: RestoreTarget, deps: RestoreDeps): () => void {
  const store = useRestoreStore.getState()
  const gen = store.begin()
  /** 아직 내 차례인가. 스토어를 매번 다시 읽는다 — 값은 그 사이에 바뀐다 */
  const mine = (): boolean => useRestoreStore.getState().generation === gen

  /**
   * 못 세웠다. **한 자리에서만** 적는다.
   *
   * ⚠️ **기본 스폰으로 조용히 풀어 주지 않는다.** 저장한 곳이 아닌 데서 걷게
   * 두면 거기서 저장할 수 있고, 그러면 못 받은 격자 하나가 리포트를 덮는다.
   * 실패는 실패로 보이고, 고르는 것은 사람이다
   */
  const fail = (e: unknown): void => {
    if (!mine()) return
    console.error(`저장한 자리(맵 ${String(at.map)} · 행렬 ${String(at.matrix)})를 못 세웠다`, e)
    useRestoreStore.getState().markFailed(gen, e instanceof Error ? e.message : String(e))
  }

  const arrive = (grid: MapGrid): void => {
    if (!mine()) return
    /**
     * ⚠️ **들어서다 터진 것도 실패다.** 예전에는 `settle`이 던지면 그대로
     * 위로 새어 나갔다 — 오버월드(행렬 0)는 `startRestore`를 부른 effect
     * 밖으로, 실내는 `then`의 성공 갈래라 **아무도 안 받는 거절**로. 어느
     * 쪽이든 `markReady`도 `markFailed`도 안 써서 화면은 「세우는 중」에
     * 영영 머물렀다.
     *
     * ⚠️ **터진 뒤에 `ready`를 쓰지 않는다.** `settle`은 `enter` 하나라
     * 중간에 터지면 절반만 들어선 상태다. 거기서 발을 풀면 사람이 반쯤 선
     * 세계를 걷는다 — 실패 화면을 띄우고 저장을 지킨다.
     *
     * ⚠️ **「다시 해 보기」는 그 절반 위에서 다시 들어선다.** `enter`는 맵을
     * 세우는 일 전체를 다시 하므로(격자·플레이어·존·NPC를 한 번에 맞춘다)
     * 다시 부르는 것이 곧 덮어쓰기다. 다만 `arriveAt`의 회복 지점처럼
     * **한 번만 일어나야 하는 도착 처리**는 절반쯤 돈 뒤 다시 돌 수 있다 —
     * 그 자리를 트랜잭션으로 감싸는 것은 확인되지 않은 큰 손질이라, 여기서는
     * 「실패는 ready를 안 쓴다」까지만 못 박는다
     */
    try {
      deps.settle(grid)
    } catch (e) {
      fail(e)
      return
    }
    useRestoreStore.getState().markReady(gen)
  }

  if (at.matrix === 0) {
    // 손에 있는 것으로 같은 프레임에 끝난다 — 기다리는 화면이 뜰 새도 없다.
    // ⚠️ **동기 완료를 비동기로 바꾸지 않는다** — 한 프레임을 미루면 그동안
    // 기본 스폰이 보인다. 던지는 것만 `arrive`가 받는다
    arrive(deps.overworld)
  } else {
    // ⚠️ **`load`가 **동기로** 던지기도 한다.** 색인을 못 읽으면 약속을
    // 만들기 전에 터지는데, 그러면 `.then`이 아예 안 걸려 실패 처리가 안 된다
    try {
      deps.load(at.matrix).then(arrive, fail)
    } catch (e) {
      fail(e)
    }
  }

  return () => {
    // ⚠️ **내 것만 무효로 한다.** 이미 다음 세대가 열려 있으면 그것의 잠금을
    // 풀면 안 된다 — 정리와 새 요청은 같은 커밋 안에서 잇달아 돈다
    if (mine()) useRestoreStore.getState().release()
  }
}
