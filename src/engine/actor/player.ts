// 플레이어 이동 — fixedUpdate에서 적분, 렌더는 prev/current 보간
import { Vector3 } from 'three'
import { worldState } from '../../state/worldState'
import { activeZone, isOnWater } from '../map/zone'
import { MapGrid } from '../map/grid'
import { standableSpot } from '../map/world'
import { distortionHop, HOP_RISE, HOP_TIME, HOP_TWICE_TIME, ledgeHop } from './ledge'
import { clearIceSlide, iceStep, isSliding, type IceView } from './ice'
import { clearPanelSlide, panelStep } from './slidePanel'
import { facingFromYaw } from '../input/mouse'
import { pushDirection } from '../input/move'
import { obstacleAt, pushBoulder, solidNpcAt, STRENGTH_BOULDER } from './obstacles'
import { bikeSpeedAt } from './bike'
import { onElevatedBridge, trackBridge } from './bridge'
import { distortionBridge, PLATFORM_FLOOR } from '../world/distortion'
import { surfaceHeading, surfaceVector } from './distortionSurface'
import { mapFeatureBridge } from '../world/mapFeatures'
import { DIR } from '../script/movement'
import { cutInFrame } from '../battle/encounterCutIn'

/**
 * 걷기·달리기 속도 (타일/초).
 *
 * ⚠️ **원작 값이 아니다. 원작은 걷기 7.5 · 달리기 15다.**
 *
 * 실측: 원작 주인공은 NPC와 **같은 이동 동작 표**를 쓴다 — `player_move.c`가
 * 보통 걸음에 `MOVEMENT_ACTION_WALK_NORMAL_NORTH`, 달리기에
 * `MOVEMENT_ACTION_RUN_NORTH`를 건다. 그 표를 `scripts.json`에서 읽으면
 * 한 칸에 8프레임(7.5타일/초)과 4프레임(15타일/초)이다.
 *
 * 우리가 늦춘 까닭은 **화면이 다르기** 때문이다 (PARITY §1.31).
 * 원작은 한 칸이 16px인 내려다보는 2D라 7.5칸/초가 경쾌한 걸음으로 읽히는데,
 * 우리는 한 칸이 사람 키에 맞춘 3D 공간이라 같은 값이 **시속 27km**다 — 걷는
 * 것이 아니라 달리는 것으로 보이고, 카메라가 못 따라가 멀미가 난다.
 *
 * ⚠️ **그래서 함께 늦춘 것이 더 있다.** 턱 뛰기(`HOP_TIME` 0.4초)가 그렇다 —
 * 원작은 두 칸을 16프레임(0.267초)에 넘는데, 걷기와 같은 비율로 늘려 두었다.
 * 한쪽만 고치면 뛰는 것이 걷는 것보다 빨라 보인다.
 *
 * ⚠️ **NPC는 원작 값 그대로다** — 그쪽은 이동 동작 표가 프레임을 정하고
 * (`actor/ambient`), 한 칸 가고 서는 짓이라 빨라도 안 어색하다. 따라다니는
 * 동행만 이 값을 보고 걸음을 고른다 (`followAction`)
 */
export const WALK_SPEED = 4.5
export const RUN_SPEED = 8

/**
 * 지금 주인공이 내는 속도(타일/초).
 *
 * 걷기·달리기·자전거 세 갈래고 자전거는 밟을수록 빨라진다. 따라다니는 동행이
 * 이 값으로 걸음 빠르기를 고른다 (`actor/ambient`) — 그쪽이 이 식을 다시 쓰면
 * 한쪽만 고쳐졌을 때 동행이 조용히 뒤처진다
 */
export function playerSpeed(): number {
  const p = worldState.player
  if (p.cycling) return WALK_SPEED * bikeSpeedAt(p.pedalling)
  return worldState.input.run && p.runningShoes ? RUN_SPEED : WALK_SPEED
}
/** 캐릭터 반지름(타일 단위). 벽에 얼굴이 박히지 않게 여유를 둔다 */
const RADIUS = 0.3
/** 존이 없을 때(회색 박스 월드) 쓰는 경계 */
const FALLBACK_ARENA = 19
/** 지면을 따라붙는 속도. 클수록 계단에 딱 붙는다 */
const CLIMB_RATE = 18
/** 이보다 크게 벌어지면 따라붙이지 않고 즉시 맞춘다 — 워프가 그렇다 */
const CLIMB_SNAP = 1.5

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
] as const
const quarterOf = (facing: number): number => ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4

/**
 * 밀고 있는데 못 간 방향 (`DIR`), 아니면 −1. 원작의 「걸음 시도가 충돌로
 * 끝났다」다 — 소리는 `scene/walkSound`가 낸다.
 *
 * ⚠️ **누른 축이 거절당했을 때만 센다.** 벽을 따라 비스듬히 미끄러지는 것은
 * 한 축이 거절당한 것이 맞고, 원작도 그 방향을 누르고 있었다면 부딪히는
 * 걸음이다 (원작에는 대각선 입력이 아예 없어 늘 한 축이다).
 *
 * ⚠️ **둘 다 거절당하면 크게 민 쪽이다.** `scene/stepSystem`의 `pushedDir`와
 * 같은 잣대로 갈라야 「어느 칸으로 걸으려 했나」가 두 자리에서 안 갈린다
 */
function bumpDirection(
  push: { x: number, z: number }, refusedX: boolean, refusedZ: boolean,
): number {
  const wantX = refusedX && Math.abs(push.x) > 0.2
  const wantZ = refusedZ && Math.abs(push.z) > 0.2
  if (wantX && (!wantZ || Math.abs(push.x) > Math.abs(push.z))) {
    return push.x > 0 ? DIR.east : DIR.west
  }
  if (wantZ) return push.z > 0 ? DIR.south : DIR.north
  return -1
}

const desired = new Vector3()

/**
 * 한 축씩 나눠 판정한다 — 벽을 따라 미끄러지게 하려면 축을 합쳐 판정하면 안 된다.
 *
 * ⚠️ 격자만 봐서는 **바다 위를 걸어 다닌다.** 물 25,469칸이 통행 가능으로 찍혀
 * 있어서다. 물은 격자가 아니라 **파도타기 상태**가 가른다 (`map/zone`의
 * `isSurfable`) — 원작 `player_move.c` 248줄이 그 한 줄이다
 */
function blocked(x: number, z: number, y = worldState.player.position.y): boolean {
  const grid = activeZone.grid
  if (!grid) return false
  const surfing = worldState.player.surfing
  const shut = (cx: number, cz: number) => {
    // 깨어진 세계는 맵 격자가 아니라 **서 있는 판**이 정한다 (PARITY §6.10).
    // 판 위가 아니면 null을 주고, 그때만 아래 평소 판정으로 내려간다
    const dw = distortionBridge.blockedAt?.(cx, y, cz)
    if (dw !== null && dw !== undefined) {
      if (dw) return true
      // ⚠️ **이 세계에도 물이 있다** — B4F 천장의 50칸이 `TILE_BEHAVIOR_WATER_SEA`고,
      // 폭포가 그 웅덩이에 있다. 맵 격자에는 안 적혀 있어서 판에 물어야 한다.
      // 파도타기 없이는 못 들어간다 (`player_move.c` 248줄과 같은 규칙)
      const beh = distortionBridge.behaviorAt?.(cx, y, cz)
      return !surfing && beh !== null && beh !== undefined && isOnWater(beh, false)
    }
    // 그 맵에만 있는 장치가 먼저다 (`DynamicMapFeatures_CheckCollision`) —
    // 들판시티의 물바닥처럼 **같은 칸이 물 높이에 따라 열리고 닫히는** 자리는
    // 격자에 안 적혀 있다. 안 보는 칸이면 null이 와서 아래로 내려간다
    const feature = mapFeatureBridge.blocked?.(Math.floor(cx), Math.floor(cz), y)
    if (feature !== null && feature !== undefined) return feature
    return (
      grid.isBlockedAtWorld(cx, cz) ||
      // ⚠️ **물인지 땅인지가 층에 달린 칸이 있다** — 물 위의 다리다 (PARITY §1.16).
      // 위를 건널 때는 걸어갈 땅이고 밑을 지날 때는 파도를 탈 물이다
      (!surfing && isOnWater(grid.behaviorAtWorld(cx, cz), onElevatedBridge())) ||
      // 벨 나무·깰 바위·밀 바위는 지형이 아니라 객체다 (`actor/obstacles`)
      obstacleAt(Math.floor(cx), Math.floor(cz)) !== null ||
      // 나머지 사람·물체도 막는다 (`sub_02063F00`) — 210번도로의 골덕 넷과
      // 선단 체육관의 눈덩이 열아홉이 이 줄이 없어서 통과됐다
      solidNpcAt(cx, cz, y) !== null
    )
  }
  // 캐릭터를 점이 아니라 반지름 있는 원으로 본다
  return (
    shut(x - RADIUS, z - RADIUS) ||
    shut(x + RADIUS, z - RADIUS) ||
    shut(x - RADIUS, z + RADIUS) ||
    shut(x + RADIUS, z + RADIUS)
  )
}

/**
 * 얼음 판정이 세계에 묻는 것 (`actor/ice`).
 *
 * ⚠️ **`blocked()`를 그대로 쓴다.** 얼음이 따로 격자를 보면 눈덩이 열아홉과
 * 사람이 안 걸린다 — 선단 체육관에서 멈추게 하는 것이 바로 그 눈덩이다
 */
const iceView: IceView = {
  behaviorAt: (tx, tz) => activeZone.grid?.behavior(tx, tz) ?? 0,
  blockedAt: (tx, tz) => blocked(tx + 0.5, tz + 0.5),
  heightAt: (tx, tz) =>
    activeZone.grid?.heightAtWorld(tx + 0.5, tz + 0.5, worldState.player.position.y) ?? 0,
}

export const playerSystem = {
  fixedUpdate(dt: number) {
    const p = worldState.player
    // 부딪히는 걸음은 **이 프레임의 사건**이다 (`actor/footstep`). 아래 어느
    // 갈래로 빠져나가도 낡은 값이 남지 않게 여기서 먼저 비운다 — 타거나 뛰는
    // 동안은 조작이 아예 안 먹으므로 그 갈래들은 −1로 나가는 것이 맞다
    p.bumpDir = -1

    // 조우 컷인이 도는 동안은 발이 묶인다 (`MapObjectMan_PauseAllMovement`,
    // `encounter.c` 168줄). 안 묶으면 화면이 찢어지는 동안 계속 걸어가서
    // 배틀이 열릴 때 서 있는 칸이 조우한 칸이 아니다
    if (p.riding || p.flying || cutInFrame.now !== null) {
      p.velocity.set(0, 0, 0)
      /**
       * ⚠️ **빠져나가는 갈래에서도 `prevPosition`을 맞춰 둔다.**
       *
       * 그리는 쪽은 `prevPosition`과 `position`을 `alpha`로 섞는다
       * (`scene/EngineDriver`). 여기서 안 건드리면 자리를 옮기는 쪽이
       * **저마다 기억해서** 맞춰야 하는데, 지금 그러고 있는 것이 승강 발판 ·
       * 폭포 · 도는 판 · 운하시티 체육관 여섯 자리다 — 하나라도 빠뜨리면
       * 그 갈래에서 사람이 매 프레임 두 자리 사이를 떤다. 여기서 한 번 맞춰
       * 두면 그 규칙이 **저절로** 지켜진다(그쪽들이 하는 일과 같은 일이라
       * 겹쳐도 값이 안 바뀐다)
       */
      p.prevPosition.copy(p.position)
      worldState.time.elapsed += dt
      return
    }

    p.prevPosition.copy(p.position)

    // ⚠️ **신발이 있어야 뛴다** (`PlayerAvatar`가 `PlayerData_HasRunningShoes`를
    // 본다). 엄마가 주기 전에는 달리기 키를 눌러도 걷는 속도 그대로다.
    //
    // 자전거는 그보다 빠르고 **밟을수록 빨라진다** — 원작이 페달마다 한 단씩
    // 올린다 (`actor/bike`의 실측 배수 2 · 2.67 · 4). 멈추면 처음으로 돌아간다
    const moving = worldState.input.move.lengthSq() > 0.0001
    p.pedalling = p.cycling && moving ? p.pedalling + dt : 0
    const speed = playerSpeed()
    // 3인칭은 원작대로 방향키가 월드 축이다. 1인칭은 **시선이 기준**이라 누른
    // 방향을 yaw만큼 돌린다 — yaw 0이면 회전이 항등이라 3인칭과 같은 식이 된다
    const dir = pushDirection()
    // ⚠️ **깨어진 세계에서는 누른 방향이 서 있는 판을 지나 세계 축이 된다**
    // (PARITY §6.10 · `player_move.c`의 걸음 표 넷). 벽에서는 북남이 오르내림이
    // 되고 서동이 z가 된다 — 좌우를 오르내림에 매면 서쪽 벽에서 오른쪽을 눌러
    // 벽을 타고 내려가고 아래를 눌러 벽에서 떨어진다 (`.audit/probe/distortionWalk.mjs`)
    surfaceVector(distortionBridge.frame?.() ?? null, dir.x, 0, dir.z, desired)
      .multiplyScalar(speed)

    // 간단한 가감속 (스파이크 수준)
    p.velocity.lerp(desired, 1 - Math.exp(-12 * dt))

    // 턱을 넘는 중이면 그것만 한다. 원작도 뛰는 동안은 조작이 안 먹는다
    if (p.hop.active) {
      p.hop.t = Math.min(1, p.hop.t + dt / p.hop.time)
      const k = p.hop.t
      p.position.x = p.hop.fromX + (p.hop.toX - p.hop.fromX) * k
      p.position.z = p.hop.fromZ + (p.hop.toZ - p.hop.fromZ) * k
      p.velocity.set(0, 0, 0)
      // ⚠️ 깨어진 세계에서는 지면에 안 묻는다 — 그 세계의 높이는 지형이 아니라
      // 들고 다니는 상태다 (`distortionBridge.inWorld`). 뛰는 동안 격자에
      // 물으면 0이 와서 발판 속으로 꺼진다
      const ground = distortionBridge.inWorld?.() === true
        ? p.hop.fromY
        : activeZone.grid?.heightAtWorld(p.position.x, p.position.z, p.position.y)
      // 포물선으로 뜬다. 4k(1−k)는 가운데서 1이고 양 끝에서 0이다.
      // ⚠️ **높이가 0인 갈래가 있다** — 폭포·록클라임은 벽을 타고 오르는 것이라
      // 뜨면 안 되고, 오르는 높이는 지형이 준다 (`script/field`의 `hopTo`)
      p.position.y = (ground ?? p.position.y) + p.hop.rise * 4 * k * (1 - k)
      if (p.hop.t >= 1) p.hop.active = false
      worldState.time.elapsed += dt
      return
    }

    const startHop = (land: { x: number; z: number }, time: number) => {
      p.hop = {
        active: true, t: 0, time, rise: HOP_RISE,
        fromX: p.position.x, fromZ: p.position.z, fromY: p.position.y,
        toX: land.x, toZ: land.z,
      }
      p.facing = Math.atan2(land.x - p.position.x, land.z - p.position.z)
    }

    /**
     * 얼음 위에서는 **조작이 안 먹는다** (`PlayerAvatar_TileMove_Ice`).
     *
     * 선단시티 체육관의 기믹이 이것이고, 선단신전 여섯 층도 같은 값이다.
     * 잡히면 잠긴 방향으로 부딪힐 때까지 미끄러지므로 위에서 만든 입력 속도를
     * 통째로 갈아 끼운다 — 가감속도 안 태운다 (원작은 한 칸이 한 동작이라
     * 붙었다 떨어지는 것이 없다).
     *
     * ⚠️ **뛰는 판정보다 먼저 두지 않는다.** 뛰는 동안은 자리를 `hop`이 정하고
     * 그때 격자에 물으면 얼음이 아니라고 나와 상태가 풀린다
     */
    if (activeZone.grid) {
      const slid = iceStep(iceView, p.position, { vx: p.velocity.x, vz: p.velocity.z }, RUN_SPEED)
      if (slid !== null) p.velocity.set(slid.vx, 0, slid.vz)
    } else {
      clearIceSlide()
    }

    /**
     * **밟으면 도는 판** (PARITY §1.30 · `ov5_021E1154`).
     *
     * 골풀무제철소 한 맵뿐이라 얼음 뒤에 둔다 — 두 거동값이 한 칸에 같이 있는
     * 자리는 없다. 얼음과 달리 **몸이 진행 방향과 따로 돈다**, 그래서 속도만
     * 갈아 끼우는 것이 아니라 얼굴도 여기서 정한다
     */
    if (activeZone.grid && !isSliding()) {
      const spun = panelStep(iceView, p.position, WALK_SPEED)
      if (spun !== null) {
        p.velocity.set(spun.vx, 0, spun.vz)
        p.facing = spun.facing
      }
    } else if (!activeZone.grid) {
      clearPanelSlide()
    }

    const grid = activeZone.grid
    if (grid instanceof MapGrid) {
      /**
       * 깨어진 세계의 **두 칸 건너뛰기** (`PlayerAvatar_WillJumpTwice`).
       *
       * ⚠️ **이게 없으면 그 세계가 끊긴 섬들이 된다.** 발판 사이가 두 칸씩
       * 비어 있고 그 두 칸은 통행 불가라, 걸어서는 어느 층에서도 다음 발판에
       * 못 간다 — 1F에서 승강 발판까지 가는 길부터 막힌다.
       *
       * 성질은 판이 먼저다 (`..._WillJumpTwiceDistortion`이 판의 통행 자료를
       * 본다). 판 위가 아니면 맵 격자로 내려간다 — 판이 없는 층이 더 많다
       */
      const frame = distortionBridge.frame?.() ?? null
      // 서 있는 면이 바닥일 때만 뛴다 — 원작이 `AVATAR_DISTORTION_STATE_FLOOR`를
      // 본다. 판이 아예 없는 층(열 중 여섯)은 보통 바닥이라 그대로 해당한다
      const onFloor = frame === null || frame.kind === PLATFORM_FLOOR
      if (onFloor && distortionBridge.behaviorAt !== null) {
        const behaviorAt = (tx: number, tz: number) =>
          distortionBridge.behaviorAt?.(tx, p.position.y, tz) ?? grid.behavior(tx, tz)
        const land = distortionHop(
          behaviorAt, p.position.x, p.position.z, p.velocity.x, p.velocity.z)
        if (land !== null) {
          const dir = land.z !== p.position.z
            ? (land.z > p.position.z ? DIR.south : DIR.north)
            : (land.x > p.position.x ? DIR.east : DIR.west)
          if (distortionBridge.jumpBlocked?.(p.position.x, p.position.z, dir) !== true) {
            startHop(land, HOP_TWICE_TIME)
            return
          }
        }
      }

      const land = ledgeHop(grid, p.position.x, p.position.z, p.velocity.x, p.velocity.z)
      if (land) {
        startHop(land, HOP_TIME)
        return
      }
    }

    /**
     * 깨어진 세계에서 **벽에 서 있는가** (PARITY §6.10).
     *
     * 벽에서는 x가 판에 붙고 걷는 축이 y와 z가 된다. 속도는 위에서 이미 판의
     * 기저를 지나왔으므로 여기서는 **붙는 축만 붙여 둔다** — 반올림 오차로
     * 조금씩 밀려 판에서 떨어지는 것을 막는 자리다
     */
    const frame = distortionBridge.frame?.() ?? null
    const onWall = frame !== null && frame.lockAxis === 'x'
    if (onWall) {
      p.velocity.x = 0
      p.position.x = frame.lock + 0.5
    }

    const nx = p.position.x + p.velocity.x * dt
    const nz = p.position.z + p.velocity.z * dt
    const ny = p.position.y + p.velocity.y * dt

    // 괴력 바위를 민다. 미는 것은 기술이 아니라 **걸음**이라 여기서 한다 —
    // 원작도 기술은 허락만 하고 실제로는 `MOVEMENT_ACTION_PUSH_*`가 옮긴다
    if (p.strength && activeZone.grid && blocked(nx, nz)) {
      const step = FACING_STEP[quarterOf(p.facing)]!
      const front = obstacleAt(Math.floor(p.position.x) + step.x, Math.floor(p.position.z) + step.z)
      if (front && front.gfx === STRENGTH_BOULDER) {
        pushBoulder(activeZone.grid, front, step)
      }
    }

    if (activeZone.grid) {
      // 이미 막힌 칸 안에 서 있으면 판정을 건너뛴다.
      //
      // 반지름으로 네 모서리를 보기 때문에, 한 번 벽 안에 들어가면 **어느 쪽으로
      // 조금 움직여도 그 벽을 다시 짚어서** 영영 못 나온다. 문 타일이 통행 불가라
      // 거기 세워지면 그대로 갇혔다(§4.2). 그 자리는 `walkOutOfDoor`가 막았지만
      // 안전망은 남겨 둔다 — 벽 안은 이미 잘못된 상태고, 갇히는 것보다 걸어
      // 나오는 편이 낫다
      const stuck = blocked(p.position.x, p.position.z)
      // ⚠️ **벽 안에서는 나오는 쪽으로만 걷는다.** 판정을 통째로 끄면 그대로
      // **맵뚫**이다 — 판 밖은 전부 막힌 칸이라 한 번 나가면 `stuck`이 영영
      // 참이고, 검은 공간을 끝까지 걸어 다니게 된다. 실제로 그 일이 있었다
      // (용식이 집: 딴 맵의 장면이 주인공을 벽 속에 세웠다 — `scriptStepSystem`).
      //
      // 그래서 설 수 있는 칸을 하나 찾아(`standableSpot`) **그쪽으로 가까워지는
      // 걸음만** 허락한다. 갇히지 않는다는 원래 목적은 그대로다
      const tx = Math.floor(p.position.x), tz = Math.floor(p.position.z)
      const inWall = stuck && activeZone.grid.isBlocked(tx, tz)
      const out = inWall ? standableSpot(activeZone.grid, p.position.x, p.position.z) : null
      // 옛 안전망을 그대로 여는 두 자리다 — **갇히는 것이 맵뚫보다 나쁘다**:
      // ① 지형은 멀쩡한데 막혔다(사람이 내 칸에 올라섰다 따위) — 나갈 쪽이 없다
      // ② 반경 8칸 안에 설 자리가 없다(`standableSpot`이 제자리를 돌려준다)
      const anywhere = stuck && (out === null
        || activeZone.grid.isBlocked(Math.floor(out.x), Math.floor(out.z)))
      /** 벽 안에서 이 걸음이 나가는 쪽인가 */
      const leaving = (from: number, to: number, goal: number): boolean =>
        Math.abs(goal - to) < Math.abs(goal - from)
      /** 이 축으로 가도 되는가 */
      const may = (from: number, to: number, goal: number, free: boolean): boolean =>
        anywhere || (out !== null ? leaving(from, to, goal) : free)
      // 축별로 따로 시도 — 벽에 비스듬히 부딪히면 벽을 따라 미끄러진다
      let refusedX = false, refusedZ = false
      if (onWall) {
        // 벽에서는 x 대신 y를 민다. x는 이미 판에 붙여 두었다
        if (stuck || !blocked(p.position.x, p.position.z, ny)) p.position.y = ny
        else p.velocity.y = 0
      } else if (may(p.position.x, nx, out?.x ?? 0, !blocked(nx, p.position.z))) {
        p.position.x = nx
      } else { p.velocity.x = 0; refusedX = true }
      if (may(p.position.z, nz, out?.z ?? 0, !blocked(p.position.x, nz))) p.position.z = nz
      else { p.velocity.z = 0; refusedZ = true }
      // **밀었는데 못 갔다** — 원작의 「걸음 시도가 충돌로 끝났다」다
      // (`actor/footstep` 머리말). 여기 말고는 알 자리가 없다: 축별 통행 판정을
      // 하는 것이 이 두 줄뿐이다
      p.bumpDir = bumpDirection(dir, refusedX, refusedZ)
    } else {
      p.position.x = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nx))
      p.position.z = Math.max(-FALLBACK_ARENA, Math.min(FALLBACK_ARENA, nz))
    }

    // 지면을 따라간다. 판이 겹치는 자리(다리와 그 밑)에서는 **지금 높이**가
    // 어느 층인지 가르는 유일한 단서라, 직전 y를 그대로 넘겨야 한다.
    //
    // ⚠️ **벽에 서 있으면 안 따라간다.** 그 y는 지면 높이가 아니라 걷고 있는
    // 축이라, 지면으로 끌어내리면 벽에 붙는 순간 바닥까지 미끄러진다
    //
    // ⚠️ **깨어진 세계에서는 아예 안 따라간다.** 원작이 그 세계에 들어서면서
    // 주인공의 높이 계산을 끈다 (`InitPlayer`) — 높이는 승강 발판·뛰는 자리·
    // 벽 걷기가 정하는 상태고, 그 층 내내 한 값이다. 지형에서 읽으려 들면
    // B2F에서 여덟 칸이 떠 버린다 (`scene/distortion`의 `DISTORTION_STAND_Y`)
    const ground = onWall || distortionBridge.inWorld?.() === true
      ? null
      : activeZone.grid?.heightAtWorld(p.position.x, p.position.z, p.position.y)
    if (ground !== null && ground !== undefined) {
      // 계단은 한 칸에 반 타일씩 오른다. 그대로 대입하면 판 경계에서 튀므로
      // 짧게 따라붙인다 — 시뮬레이션이 아니라 표현이라 눈에 맞추면 된다
      const gap = ground - p.position.y
      p.position.y +=
        Math.abs(gap) > CLIMB_SNAP
          ? gap // 워프·낙하처럼 크게 벌어지면 즉시 맞춘다
          : gap * (1 - Math.exp(-CLIMB_RATE * dt))
    }

    // 1인칭은 **보는 쪽이 곧 앞**이다. 서서 고개만 돌려도 몸이 따라 돌아야
    // 말을 걸 때(`tileInFront`) 눈에 보이는 사람에게 걸린다. 3인칭은 원작대로
    // 걸어간 쪽을 본다
    if (worldState.camera.mode === 'first') {
      p.facing = facingFromYaw(worldState.camera.yaw)
    } else if (p.velocity.lengthSq() > 0.01) {
      // yaw는 **판 위의 로컬 좌표**로 둔다 — 세계 속도를 판의 기저로 되돌리면
      // 벽에서도 천장에서도 같은 식이 된다 (`surfaceHeading`)
      p.facing = surfaceHeading(frame, p.velocity.x, p.velocity.y, p.velocity.z, p.facing)
    }

    const here = activeZone.grid?.behaviorAtWorld(p.position.x, p.position.z) ?? null
    // 깨어진 세계에서는 **서 있는 판**이 성질을 준다. 맵 격자를 보면 천장의
    // 물 위에서도 뭍으로 읽혀 타자마자 내려 버린다
    const standing =
      distortionBridge.behaviorAt?.(p.position.x, p.position.y, p.position.z) ?? here
    // 뭍에 올라서면 내린다. 원작도 물 밖으로 나가는 순간 상태가 풀린다 —
    // 타는 것은 A를 눌러야 하지만 내리는 것은 걸어 나오면 된다
    if (p.surfing && standing !== null && !isOnWater(standing, onElevatedBridge())) {
      p.surfing = false
    }
    // 다리 어귀를 밟았는가 · 다리에서 내려섰는가 (PARITY §1.16).
    // **밑을 지나가는 것과 위를 건너는 것이 이 한 값으로 갈린다**
    if (here !== null) trackBridge(here)
    worldState.time.elapsed += dt
  },
}
