// 확인 지점 순간이동을 씬에 잇는 자리 — 시험용.
//
// 옮기는 일 자체는 워프와 똑같다. 그래서 새 길을 내지 않고 `MapStreamer`가 이미
// 갖고 있는 `enter`를 그대로 부른다 — 문 타일 손질(`walkOutOfDoor`)까지 같은 길로
// 지나가야 시험용 이동이 진짜 이동과 다르게 동작하지 않는다.
//
// **배포 번들에 안 들어간다.** 아래 동적 import 하나가 유일한 연결이고
// `import.meta.env.DEV`로 감싸여 있어, 프로덕션 빌드에서는 가지가 통째로 접히고
// `engine/dev/*`는 청크로도 나오지 않는다. 이 파일에 남는 것은 빈 함수 셋이다.
import { useCallback, useMemo, useRef } from 'react'
import type { MapGrid } from '../engine/map/grid'
import { mapById, npcsOf, walkOutOfDoor, warpsOf } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { abortScript } from '../engine/script/field'
import { useBattleStore } from '../state/battleStore'
import { useSaveStore } from '../state/saveStore'
import { startSafari } from '../engine/world/safari'
import { gridFor } from './worldData'
import { distortionSpawn, isDistortionFloor } from './distortion'
import type { Checkpoint } from '../engine/dev/checkpoints'

type EnterFn = (
  grid: MapGrid, mapId: number, x: number, z: number, matrix: number,
  /** 도착 높이. 깨어진 세계처럼 격자에서 못 받는 데서만 준다 */
  atY?: number,
) => void

interface DevApi {
  devWarp: { pending: Checkpoint | null }
  resolveSpot: typeof import('../engine/dev/checkpoints')['resolveSpot']
}

let dev: DevApi | null = null

// 모듈이 평가될 때 바로 받아 둔다. 마운트 시점에 이미 와 있어야 타이틀에서
// 뛰어든 판이 세이브 자리를 한 번 들렀다 가지 않는다 — 게임 청크는 타이틀이
// 미리 받으므로 실제로는 한참 전에 끝난다
if (import.meta.env.DEV) {
  void Promise.all([
    import('../app/devWarp'),
    import('../engine/dev/checkpoints'),
  ]).then(([w, c]) => { dev = { devWarp: w.devWarp, resolveSpot: c.resolveSpot } })
}

interface DevWarpHooks {
  /** 마운트할 때 세이브 자리 대신 확인 지점으로 갈 것인가 */
  claimed: () => boolean
  /**
   * 이 마운트에서 **이미** 확인 지점으로 옮겼는가.
   *
   * ⚠️ **`claimed`만으로는 모자란다.** 그건 "올라온 것이 있는가"라 옮기고 나면
   * 다시 false가 된다. 마운트 effect가 프레임보다 늦게 도는 실행이 있어서
   * (실측: 확인 지점이 12,926ms에 209번도로로 옮겼는데 27ms 뒤에 마운트
   * effect가 411로, 다시 440ms 뒤에 세이브 자리 415로 덮었다) 그때 `claimed`는
   * 이미 false다. 옮겼다는 사실 자체를 남겨야 그 자리를 안 덮는다
   */
  moved: () => boolean
  /** 프레임마다. 올라온 확인 지점이 있으면 옮긴다 */
  tick: () => void
}

export function useDevWarp(enter: EnterFn): DevWarpHooks {
  // 마운트마다 새 ref다. 다시 마운트되면 false로 돌아가는 것이 맞다 —
  // 그때는 `MapStreamer`의 `resume`이 서 있던 자리를 들고 있다
  const warped = useRef(false)
  // 배틀은 도착한 **다음 프레임**에 연다. 같은 프레임에 열면 맵 진입 스크립트와
  // 겹쳐서, 무엇이 배틀을 막았는지 알 수 없게 된다
  const battle = useRef<Checkpoint['battle']>(undefined)

  const claimed = useCallback(() => dev?.devWarp.pending != null, [])
  const moved = useCallback(() => warped.current, [])

  const tick = useCallback(() => {
    const waiting = battle.current
    if (waiting) {
      battle.current = undefined
      // ⚠️ **여기서 한 번 더 끊는다.** 아래에서 이미 끊었지만 그것은 맵이 뜬
      // 프레임이고, 주인공 방의 TV 방송은 그 다음 프레임에 시작한다 — 안 끊으면
      // 배틀 화면 위에 그 대사창이 겹쳐 뜬다 (실측: 배틀 중에 `data-talk=1`)
      abortScript()
      if (waiting.kind === 'trainer') void useBattleStore.getState().startTrainer(waiting.id)
      else if (waiting.kind === 'safari') {
        // 안내원을 거치지 않고 뛰어들므로 깃발과 볼을 여기서 세운다 (PARITY §2.19)
        const save = useSaveStore.getState()
        if (!save.safari.active) {
          useSaveStore.setState({ safari: { ...save.safari, ...startSafari() } })
        }
        void useBattleStore.getState().startSafari(
          { species: waiting.species, level: waiting.level })
      } else void useBattleStore.getState().startWild({ species: waiting.species, level: waiting.level })
      return
    }
    const cp = dev?.devWarp.pending
    if (!cp || !dev) return
    dev.devWarp.pending = null
    // ⚠️ **격자를 받기 전에 적는다.** 아래는 비동기라, 받는 동안 마운트
    // effect가 돌면 그쪽이 세이브 자리로 덮어 버린다
    warped.current = true

    const header = mapById(cp.map)
    if (!header) { console.error(`확인 지점 ${cp.id}: 맵 ${cp.map}이 없다`); return }
    const resolveSpot = dev.resolveSpot
    gridFor(header.matrix)
      .then((next) => {
        const at = resolveSpot(next, cp.map, cp.spot, warpsOf(cp.map), npcsOf(cp.map))
        if (!at) { console.error(`확인 지점 ${cp.id}: 설 자리를 못 찾았다`); return }
        // 문 위면 통행 불가라 한 칸 내려 세운다 — 워프가 지나는 길과 같다
        const out = walkOutOfDoor(next, at.x, at.z)
        // ⚠️ 깨어진 세계는 맵 격자가 아니라 떠 있는 판 위를 걷는다. 격자에서
        // 고른 칸은 판 밖이라 그대로 세우면 판 속에 묻힌다 (`distortionSpawn`)
        const onPlatform = isDistortionFloor(cp.map) ? distortionSpawn(cp.map) : null
        if (onPlatform !== null) {
          enter(next, cp.map, onPlatform.x + 0.5, onPlatform.z + 0.5, header.matrix, onPlatform.y)
        } else {
          enter(next, cp.map, out.x, out.z, header.matrix)
        }
        worldState.player.facing = at.facing
        // 시각을 못 박는 지점이 있다 — 밤 하늘·조명·시간대 인카운터를 보는 자리다
        if (cp.hour !== undefined) worldState.time.gameHour = ((cp.hour % 24) + 24) % 24
        // ⚠️ **여기서 한 번 더 끊는다.** `warpTo`가 이미 끊었지만, 새 판을 여는
        // 것과 맵이 실제로 뜨는 것 사이에 프레임이 있어서 그 사이에 주인공 방의
        // TV 방송이 시작된다. 안 끊으면 딴 맵에서 그 대사창이 뜨고 플레이어가
        // 잠긴 채로 선다 — 걸어도 안 움직이는 것을 이동 버그로 읽기 십상이다
        abortScript()
        battle.current = cp.battle
      })
      .catch((e: unknown) => { console.error(`확인 지점 ${cp.id} 실패`, e) })
  }, [enter])

  // 돌려주는 것이 매번 새 객체면 이것을 의존성에 적은 effect가 프레임마다 다시 돈다
  return useMemo(() => ({ claimed, moved, tick }), [claimed, moved, tick])
}
