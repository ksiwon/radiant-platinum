// 걸음이 내는 소리를 세계에 붙인다 (`player_move.c`의 `PlayerAvatar_PlayWalkSE`).
//
// 규칙은 `engine/actor/footstep`에 있고 여기는 **언제 한 걸음인가**와 SDAT를
// 울리는 일만 한다 — `scene/stepSystem`이 걸음 계수기에 대해 하는 것과 같은
// 나눔이다.
//
// ⚠️ **여기가 세는 걸음은 `stepSystem`의 그것과 다른 자다.** 저쪽은 독·친밀도·
// 알을 굴리는 자리라 스크립트가 도는 동안 아예 서고, 이쪽은 소리라 같은 조건에
// 걸릴 이유가 없다. `StepTrace`는 세는 자리마다 제 것을 든다 (그 파일 머리말).
import { drainBikeCues } from '../engine/actor/bikeTerrain'
import { BumpGate, isWarpStep, stepOf, walkEffects } from '../engine/actor/footstep'
import { StepTrace } from '../engine/actor/stepTrace'
import { onElevatedBridge } from '../engine/actor/bridge'
import { world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'

/** 지나온 칸을 내주는 자. `stepSystem`과 나눠 쓰지 않는다 */
const trace = new StepTrace()
/** 막힌 걸음을 원작 16프레임으로 자르는 자 */
const gate = new BumpGate()

/**
 * 마지막으로 밟은 칸. 「떠난 칸」이 이것이다 (`MapObject_GetTileBehaviorFromDir`).
 *
 * ⚠️ **지금 자리에서 못 읽는다.** 칸이 바뀐 프레임에는 지금 자리가 이미 **닿은**
 * 칸이라, 그걸 떠난 칸으로 쓰면 둘이 같아진다 — 그러면 긴 풀에서 **나오는**
 * 걸음이 소리를 안 낸다 (풀에서 평지로 나갈 때 둘 다 평지로 읽힌다)
 */
let fromX = Number.NaN
let fromZ = 0

/** 워프·맵 갈아타기 다음에 부른다 — 도착한 칸은 지나온 칸이 아니다 */
export function resetWalkSound(): void {
  const p = worldState.player.position
  trace.reset(p.x, p.z)
  gate.reset()
  fromX = Math.floor(p.x)
  fromZ = Math.floor(p.z)
}

/** 그 칸의 거동값. 격자 밖이면 0(`TILE_BEHAVIOR_NONE`)이다 */
function behaviorAt(tx: number, tz: number): number {
  return mapWorld.grid?.behavior(tx, tz) ?? 0
}

export const walkSoundSystem = {
  fixedUpdate(): void {
    // 자전거가 쌓아 둔 소리 — 단 바꾸기 · 진흙 비탈 · 먼 도약 (`actor/bikeTerrain`).
    //
    // ⚠️ **격자를 기다리지 않는다.** 아래 걸음 소리는 맵이 서 있어야 뜻이 있지만
    // 이 셋은 이미 일어난 사건이라, 안 비우면 다음 맵에서 늦게 울린다
    for (const seq of drainBikeCues()) void music.playEffect(seq)

    const grid = mapWorld.grid
    if (!grid || mapWorld.pending) { gate.reset(); fromX = Number.NaN; return }
    const p = worldState.player.position
    const bridge = onElevatedBridge()

    // ① 한 걸음 — 지나온 칸을 차례로 밟는다.
    //
    // ⚠️ **칸마다 한 번이지 걸음마다 한 번이 아니다.** 원작은 한 칸이 한 걸음이라
    // 둘이 같은 말인데, 우리는 대각선으로 모서리를 스치면 한 틱에 두 칸을
    // 지난다 — 소리는 **밟은 칸**을 따라가는 것이 맞다 (`tilesCrossed`)
    if (Number.isNaN(fromX)) { fromX = Math.floor(p.x); fromZ = Math.floor(p.z) }
    const moved = trace.advance(p.x, p.z)
    for (const t of moved.tiles) {
      const next = behaviorAt(t.x, t.z)
      // 「떠난 칸」은 **바로 앞에 밟은** 칸이지 지금 서 있는 칸이 아니다
      const effects = walkEffects({
        next, cur: behaviorAt(fromX, fromZ), onBridge: bridge, walkOnSpotSlow: false,
      })
      for (const seq of effects) void music.playEffect(seq)
      fromX = t.x
      fromZ = t.z
    }

    // ② 밀었는데 못 간 걸음 (`PlayerAvatar_SetMovement_NormalOverworld` 1031줄).
    //
    // 원작이 이때도 `PlayWalkSE`를 부르므로 **표면 소리도 같이 난다** — 눈밭에서
    // 벽을 밀면 눈 소리와 벽 소리가 함께 난다. 긴 풀만 입을 다문다
    // (`walkOnSpotSlow`)
    const dir = worldState.player.bumpDir
    if (!gate.push(dir >= 0)) return
    const tx = Math.floor(p.x), tz = Math.floor(p.z)
    const here = behaviorAt(tx, tz)
    const step = stepOf(dir)
    // ⚠️ **워프면 조용히 들어간다** — 원작이 아홉 자리에서 다
    // `(collision & PLAYER_COLLISION_WARP) == 0`을 앞세운다. 우리 격자는 문 타일이
    // 통행 불가라 이 갈래가 없으면 문마다 벽 소리가 난다
    if (!isWarpStep(here, behaviorAt(tx + step.x, tz + step.z), dir)) {
      void music.playEffect(SFX.WALL_HIT)
    }
    for (const seq of walkEffects({
      next: here, cur: here, onBridge: bridge, walkOnSpotSlow: true,
    })) {
      void music.playEffect(seq)
    }
  },
}
