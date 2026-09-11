// 자전거 모드 바꾸기 (`PlayerAvatar_TryCyclingGearChange`)
//
// 원작은 자전거를 탄 채로 **B**를 누르면 3단과 4단을 오간다. 속도만 달라지는
// 것이 아니라 **지나갈 수 있는 자리가 달라진다** — 진흙 비탈은 전속력으로만
// 오르고 전속력은 4단에서만 난다 (`actor/bikeTerrain`).
//
// ⚠️ **우리 키는 B다.** 원작 DS의 B 버튼과 글자가 같아서가 아니라, 그 자리가
// 왼손에 비어 있는 유일한 칸이기 때문이다 — 원작의 B(`cancel`)는 우리에게
// 이미 X고 그것은 시작 메뉴도 연다 (`engine/input/keys`의 `BINDINGS`).
//
// ⚠️ **소리는 여기서 안 낸다.** 규칙과 SDAT를 울리는 일을 나누는 것은
// `actor/footstep`과 `scene/walkSound`가 하는 나눔과 같다 — 엔진이 씬을
// 들여오면 three가 딸려 온다.
import { worldState } from '../../state/worldState'
import { BINDINGS, held, isGameActive, isUiCaptured } from '../input/keys'
import { world } from '../map/world'
import { SFX } from '../audio/sfx'
import { BIKE_GEAR, type BikeGear } from './bike'
import { isBikeRamp, pushBikeCue } from './bikeTerrain'

/** 지난 틱에 눌려 있었는가. 누르고 있는 동안 계속 뒤집히면 안 된다 */
let wasDown = false

/** 맵을 갈아탈 때 부른다 — 눌린 채로 화면이 바뀌면 다음 틱에 한 번 더 먹는다 */
export function resetBikeGearInput(): void { wasDown = false }

export const bikeGearSystem = {
  fixedUpdate(): void {
    const down = isGameActive() && !isUiCaptured() && !worldState.restoring
      && held(BINDINGS.gear)
    const pressed = down && !wasDown
    wasDown = down
    if (!pressed) return

    const p = worldState.player
    // 원작도 타고 있을 때만 본다 (`GetPlayerState() != PLAYER_AVATAR_CYCLING`이면 그냥 돌아간다)
    if (!p.cycling) return
    // ⚠️ **도약대 위에서는 안 바뀐다.** 원작이 그 두 값에서 그냥 돌아간다 —
    // 날아가는 도중에 거리가 바뀌면 착지가 어긋난다. 우리 격자에서는 그 칸이
    // 통행 불가라 설 일이 없지만, 규칙을 반쯤 옮겨 두지 않는다
    const here = world.grid?.behaviorAtWorld(p.position.x, p.position.z) ?? null
    if (here !== null && isBikeRamp(here)) return

    const next = (p.bikeGear === BIKE_GEAR.fourth
      ? BIKE_GEAR.third
      : BIKE_GEAR.fourth) as BikeGear
    p.bikeGear = next
    // 단을 바꾸면 속도는 처음부터다 — 3단은 제 속도로 고정되고, 4단은 다시 오른다
    p.pedalling = 0
    // ⚠️ **차례가 거꾸로 보인다** — 원작이 3단(`gear == 0`)에 `GEAR2`를 낸다
    pushBikeCue(next === BIKE_GEAR.third ? SFX.BIKE_GEAR_DOWN : SFX.BIKE_GEAR_UP)
  },
}
