// 도구를 쓰면 실제로 무슨 일이 일어나는가 (PARITY §4.1 · §4.4)
//
// **여는 길이 둘이라 여기 한 벌만 둔다.** 가방에서 고르는 길(`BagScreen`)과
// **등록한 도구를 필드에서 Y로 쓰는 길**(§4.4)이 같은 일을 해야 한다 —
// 원작도 둘 다 도구표의 같은 `fieldUseFunc`로 간다 (`sItemUseFuncs`).
//
// ⚠️ **무엇을 할지 정하는 것은 여기가 아니다.** 그쪽은 `engine/bag/fieldUse`가
// 도구표를 보고 답하고, 여기는 그 답을 **실제로 밟는다**. 나누는 이유는
// 앞쪽이 순수 함수라 시험이 표 전량을 훑을 수 있어서다
import { BIKE_WHY, bikeBlock, isOnCyclingRoad } from '../../engine/actor/bike'
import { onElevatedBridge } from '../../engine/actor/bridge'
import type { FieldContext, FieldItemAction, PartyItemUse } from '../../engine/bag/fieldUse'
import { isRadarGrass } from '../../engine/battle/encounter'
import { isSurfable } from '../../engine/map/zone'
import { mapById, world } from '../../engine/map/world'
import { SYSTEM_FLAG } from '../../engine/script/commands'
import { fieldScripts, frontTile } from '../../engine/script/field'
import { castRod } from '../../scene/fishingSystem'
import { turnOnRadar } from '../../scene/pokeRadar'
import type { MenuScreen as MenuScreenName } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { worldState } from '../../state/worldState'

/**
 * 지금 이 자리의 사정 (`engine/bag/fieldUse`의 `FieldContext`).
 *
 * **여는 길 둘이 같은 값을 봐야 한다** — 가방에서 고르든 Y로 바로 쓰든
 * 「앞에 물이 있는가」·「풀숲에 서 있는가」의 답이 달라지면 안 된다
 */
export function fieldContextNow(evoItems: ReadonlySet<string> | undefined): FieldContext {
  const header = mapById(world.mapId)
  const p = worldState.player
  const grid = world.grid
  const front = frontTile()
  return {
    mapId: world.mapId,
    mapType: header?.mapType ?? 0,
    escapeRopeAllowed: header?.escapeRope === 1,
    repelSteps: useSaveStore.getState().steps.repel,
    waterAhead: grid !== null && isSurfable(grid.behavior(front.x, front.z)),
    onBridge: onElevatedBridge(),
    // ⚠️ 레이더는 **선** 칸을 본다 — 낚싯대가 앞 칸을 보는 것과 다르다
    inTallGrass: grid !== null
      && isRadarGrass(grid.behaviorAtWorld(p.position.x, p.position.z)),
    hasPartner: fieldScripts.vars?.checkFlag(SYSTEM_FLAG.hasPartner) === true,
    onBike: p.cycling,
    ...(evoItems === undefined ? {} : { evoItems }),
  }
}

/** 밟는 쪽이 대야 하는 바깥 세계 */
export interface ItemActionDeps {
  /** 도구 번호와 그 이름·주머니 */
  readonly item: number
  readonly name: string
  readonly pocket: number
  /** 한 줄 알림. 가방은 바닥줄에, 필드는 대사창에 띄운다 */
  readonly say: (line: string) => void
  /** 개수를 깎는다 */
  readonly consume: (pocket: number, item: number, count: number) => void
  /** 한 단 물러난다. 필드에는 물러날 자리가 없어 아무 일도 안 한다 */
  readonly back: () => void
  /** 화면을 쌓아 올린다 */
  readonly push: (screen: MenuScreenName) => void
  /** 열린 화면을 다 닫는다 */
  readonly closeAll: () => void
  /** 파티에서 먹일 마리를 고르게 연다 */
  readonly openParty: (use: PartyItemUse) => void
}

/**
 * 정해진 갈래를 실제로 밟는다. 무언가 일어났으면 참.
 *
 * ⚠️ **`give`·`pick`은 여기 없다.** 「건네준다」로 열린 가방과 스크립트가
 * 고르라고 연 가방은 도구표의 갈래를 아예 안 보므로 가방 화면이 먼저 가로챈다
 */
export function performItemAction(action: FieldItemAction, deps: ItemActionDeps): boolean {
  switch (action.kind) {
    case 'bike': {
      const header = mapById(world.mapId)
      const p = worldState.player
      const here = world.grid?.behaviorAtWorld(p.position.x, p.position.z) ?? null
      const why = bikeBlock(header, here, p.surfing, p.cycling, isOnCyclingRoad())
      if (why !== null) { deps.say(BIKE_WHY[why]); return false }
      p.cycling = !p.cycling
      p.pedalling = 0
      deps.back()
      return true
    }
    case 'party':
      deps.openParty(action.use)
      return true
    case 'repel': {
      // `TryUseRepel` — 걸음을 세우고 한 개를 쓴다
      const steps = useSaveStore.getState().steps
      useSaveStore.setState({ steps: { ...steps, repel: action.steps } })
      deps.consume(deps.pocket, deps.item, 1)
      deps.say(`${deps.name}을(를) 썼다!`)
      return true
    }
    case 'flute':
      // 걸음을 안 센다. 이 맵을 벗어나면 풀린다 (`FieldSystem_InitFlagsWarp`)
      useSaveStore.setState({ flute: action.factor })
      deps.consume(deps.pocket, deps.item, 1)
      deps.say(`${deps.name}을(를) 불었다!`)
      return true
    case 'escapeRope': {
      const exit = useSaveStore.getState().exit
      if (!exit) { deps.say('돌아갈 자리가 없다.'); return false }
      deps.consume(deps.pocket, deps.item, 1)
      world.pending = {
        to: exit.map, matrix: exit.matrix, x: exit.x, z: exit.z, facing: exit.facing,
        // 문으로 나오는 것이 아니라 굴 밖에 툭 선다. 원작도 문 여닫는 연출이 없다
        viaDoor: false,
      }
      deps.closeAll()
      return true
    }
    case 'fish':
      // 던지는 순간 가방을 닫는다. 원작도 낚싯대를 쓰면 가방이 사라지고
      // 필드 과제(`FieldTask_Fishing`)가 화면을 가져간다
      castRod(action.rod)
      deps.closeAll()
      return true
    case 'screen':
      // 여는 것이 전부인 도구. 쌓아 올려서 B로 돌아온다
      deps.push(action.screen)
      return true
    case 'missing':
      deps.say(`${action.what}이(가) 아직 없다.`)
      return false
    case 'radar':
      // 켜는 순간 가방을 닫는다. 원작도 필드 과제(`RefreshRadarChain`)가
      // 화면을 가져간다 — 배터리가 덜 찼는지는 그쪽이 롬의 대사로 말한다
      turnOnRadar()
      deps.closeAll()
      return true
    default:
      deps.say(action.why)
      return false
  }
}
