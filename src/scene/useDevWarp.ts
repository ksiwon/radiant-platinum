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
import { mapById, walkOutOfDoor, warpsOf } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { abortScript } from '../engine/script/field'
import { useBattleStore } from '../state/battleStore'
import { gridFor } from './worldData'
import type { Checkpoint } from '../engine/dev/checkpoints'

export type EnterFn =
  (grid: MapGrid, mapId: number, x: number, z: number, matrix: number) => void

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

export interface DevWarpHooks {
  /** 마운트할 때 세이브 자리 대신 확인 지점으로 갈 것인가 */
  claimed: () => boolean
  /** 프레임마다. 올라온 확인 지점이 있으면 옮긴다 */
  tick: () => void
}

export function useDevWarp(enter: EnterFn): DevWarpHooks {
  // 배틀은 도착한 **다음 프레임**에 연다. 같은 프레임에 열면 맵 진입 스크립트와
  // 겹쳐서, 무엇이 배틀을 막았는지 알 수 없게 된다
  const battle = useRef<Checkpoint['battle']>(undefined)

  const claimed = useCallback(() => dev?.devWarp.pending != null, [])

  const tick = useCallback(() => {
    const waiting = battle.current
    if (waiting) {
      battle.current = undefined
      if (waiting.kind === 'trainer') void useBattleStore.getState().startTrainer(waiting.id)
      else void useBattleStore.getState().startWild({ species: waiting.species, level: waiting.level })
      return
    }
    const cp = dev?.devWarp.pending
    if (!cp || !dev) return
    dev.devWarp.pending = null

    const header = mapById(cp.map)
    if (!header) { console.error(`확인 지점 ${cp.id}: 맵 ${cp.map}이 없다`); return }
    const resolveSpot = dev.resolveSpot
    gridFor(header.matrix)
      .then((next) => {
        const at = resolveSpot(next, cp.map, cp.spot, warpsOf(cp.map))
        if (!at) { console.error(`확인 지점 ${cp.id}: 설 자리를 못 찾았다`); return }
        // 문 위면 통행 불가라 한 칸 내려 세운다 — 워프가 지나는 길과 같다
        const out = walkOutOfDoor(next, at.x, at.z)
        enter(next, cp.map, out.x, out.z, header.matrix)
        worldState.player.facing = at.facing
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
  return useMemo(() => ({ claimed, tick }), [claimed, tick])
}
