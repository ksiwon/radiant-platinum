// NPC 그림표 (DATA.md §2.16)
//
// 원작의 오버월드 사람은 모델이 아니라 **판때기 하나에 텍스처를 갈아 끼운
// 것**이다. 방향도 걸음도 전부 텍스처가 바뀌는 것이지 뼈대가 움직이는 게 아니다.
//
// 어느 장을 언제 쓰는지는 두 자료가 나눠 갖고 있다:
//
//   `anims`  동작마다 틱 구간 — 걷는 사람은 넷(북·남·서·동)이다
//   `seq`    그 틱에 쓸 장 번호
//
// 그래서 "동작 a의 e틱째"를 물으면 구간 안으로 접은 뒤 차례표를 뒤져 장을 준다.
// 이 모듈은 three를 모른다 — 씬은 여기서 받은 장 번호로 UV만 옮긴다.
import {
  Behavior, isMud, isMudWithGrass, isOnSnow, isOnWater, isPuddle, isShallowWater,
  isTallGrass, isVeryTallGrass,
} from '../map/zone'

/** `BILLBOARD_ANIM_TYPE_*` */
const LOOP = 0

/** 동작 하나: [시작 틱, 끝 틱, 종류] */
type Anim = readonly [number, number, number]

export interface NpcSprite {
  /** `OBJ_EVENT_GFX_` 를 뗀 이름. 사람이 읽으려고 둔다 */
  name: string
  /** 한 장의 크기(텍셀) */
  w: number
  h: number
  /** 아틀라스에 가로로 이어 붙인 장 수 */
  frames: number
  seq: { ticks: number[]; frames: number[] } | null
  anims: Anim[] | null
  /** 동작이 넷이면 그것이 곧 방향이다 */
  directional: boolean
}

let table: Record<string, NpcSprite> = {}

export function loadNpcSprites(data: Record<string, NpcSprite>): void {
  table = data
}

export function npcSprite(gfx: number): NpcSprite | null {
  return table[String(gfx)] ?? null
}

/**
 * 텍셀 몇 개가 한 타일인가.
 *
 * 원작 판때기 모델을 재서 나온 값이다 — `generic_32x32.nsbmd`가 32×32유닛이고
 * 한 타일이 16유닛이니 **정확히 2×2타일**이다. 16×16짜리는 1타일, 64×64짜리는
 * 4타일로 딱 떨어진다. 세 판이 다 맞으므로 눈대중이 아니다.
 *
 * 모델의 y가 0에서 32까지라 **원점이 발밑**이다. 우리 판때기도 그렇게 세운다
 */
export const TEXELS_PER_TILE = 16

// ── 방향 ─────────────────────────────────────────────────────────────────────
//
// `constants/map_object.h`는 북0·남1·서2·동3이다. 나침반 차례(북0·동1·남2·서3)가
// 아니라서 카메라를 돌릴 때 그냥 더하면 엉뚱한 그림이 나온다. 두 번 갈아탄다.

/** DIR_* → 나침반 차례 */
const TO_COMPASS = [0, 2, 3, 1]
/** 나침반 차례 → DIR_* */
const FROM_COMPASS = [0, 3, 1, 2]

/**
 * 카메라가 도는 만큼 그림도 돌려야 한다.
 *
 * 원작은 카메라가 늘 북쪽을 보므로 **동작 번호 = 방향 번호**였다. 우리는 1인칭이
 * 있어서 시선이 돌아간다 — 마주 보고 선 사람은 뒤통수가 아니라 얼굴이어야 한다.
 *
 * @param dir NPC가 보는 쪽 (DIR_*)
 * @param quadrant 카메라가 북쪽에서 몇 사분면 돌았나 (0이면 원작과 같다)
 */
export function artDir(dir: number, quadrant: number): number {
  const c = TO_COMPASS[dir & 3] ?? 0
  return FROM_COMPASS[(c - quadrant + 8) % 4] ?? 0
}

/** 카메라가 보는 쪽을 사분면으로. −Z가 북쪽이다 */
export function cameraQuadrant(dx: number, dz: number): number {
  const q = Math.round(Math.atan2(dx, -dz) / (Math.PI / 2))
  return ((q % 4) + 4) % 4
}

/**
 * 판때기 사람 하나에 쓸 사분면.
 *
 * ⚠️ **1인칭은 화면 시선 하나로 고르지 않는다.** 판은 사람마다 카메라 자리를
 * 향해 도는데(`scene/billboard`) 그림만 시선 하나로 고르면, 가로 화각이 85°쯤
 * 되는 1인칭에서 화면 가장자리 사람은 판과 그림이 40° 넘게 어긋난다 — 나를
 * 마주 보는 사람이 옆모습으로 나오고, 고개만 돌려도 그 사람 그림이 바뀐다.
 * 그래서 카메라에서 **그 사람으로** 가는 선으로 고른다.
 *
 * 3인칭은 시선을 그대로 쓴다. 원작처럼 북쪽에 고정이라 0이고, 사람마다 고르면
 * 카메라 옆으로 멀리 선 사람이 45° 근처에서 뒤집힌다
 *
 * @param view 화면 시선의 사분면 (`cameraQuadrant(목표 − 카메라)`)
 * @param ax 그 사람이 선 칸 (칸 모서리 좌표. 가운데는 +0.5다)
 * @param cx 카메라 자리
 */
export function plateQuadrant(
  view: number, firstPerson: boolean,
  ax: number, az: number, cx: number, cz: number,
): number {
  if (!firstPerson) return view
  return cameraQuadrant(ax + 0.5 - cx, az + 0.5 - cz)
}

// ── 발밑 그림자 (`overlay005/ov5_021F134C.c`) ───────────────────────────────
//
// 원작 판때기 사람은 발밑에 그림자 모델 하나를 깐다. 모델은 하나를 모두가 같이
// 쓰고, **그 진하기와 크기를 시간대가 정한다** — 맵마다·사람마다가 아니다.

/**
 * 시간대마다 그림자 진하기 (`Unk_ov5_02200284`, 0~31의 모델 알파).
 * 색인이 `TimeOfDay`다 — 아침 · 낮 · 해질녘 · 밤 · 심야
 */
const SHADOW_ALPHA: readonly number[] = [14, 18, 18, 8, 4]
/**
 * 시간대마다 그림자 크기, 가로(x)·세로(z) (`Unk_ov5_022002E4`). 높이는 늘 1이다.
 * 해가 낮으면 길게 늘어진다 — 낮은 1.25배, 심야는 0.875배다
 */
const SHADOW_SCALE: readonly (readonly [number, number])[] = [
  [1, 1], [1.25, 1.25], [1.25, 1], [1.125, 1], [0.875, 0.875],
]
/** 한 프레임에 크기가 가는 폭 (`0x10` / FX32_ONE) */
const SCALE_STEP = 0x10 / 4096
/** 한 프레임에 알파가 가는 폭 (`0x200` / FX32_ONE) */
const ALPHA_STEP = 0x200 / 4096

/**
 * 그림자 위치를 사람 자리에서 얼마나 미는가, 칸 단위 (`ov5_021F1670`).
 * 원작은 x −0.5 · z +1유닛이고 한 칸이 16유닛이다
 */
export const SHADOW_OFFSET = { x: -0.5 / 16, z: 1 / 16 } as const

/** 지금 그림자 모양. 원작도 이 하나를 모든 사람이 같이 본다 */
interface FootShadow {
  /** 0~31. 모델에 넘길 때는 정수로 자른다 (`ov5_021F13C8`) */
  alpha: number
  sx: number
  sz: number
  /** 한 번이라도 맞췄는가. 처음에는 감지 않고 바로 그 값이다 (`case 0`) */
  started: boolean
}

export function footShadow(): FootShadow {
  return { alpha: 0, sx: 1, sz: 1, started: false }
}

/** `ov5_021F1400` — 목표까지 `step`만큼 가고 넘으면 멈춘다 */
function approach(now: number, want: number, step: number): number {
  if (now < want) return Math.min(want, now + step)
  if (now > want) return Math.max(want, now - step)
  return now
}

/**
 * 그림자를 한 걸음 감는다 (`ov5_021F1424`).
 *
 * 시간대가 바뀌면 크기는 프레임마다 1/256, 알파는 1/8씩 새 값으로 간다 — 툭
 * 바뀌지 않는다. 처음 한 번은 감지 않고 그 시간대 값으로 바로 선다
 *
 * @param frames 지난 원작 프레임 수 (60Hz). 소수여도 된다
 */
export function stepFootShadow(s: FootShadow, timeOfDay: number, frames: number): void {
  const alpha = SHADOW_ALPHA[timeOfDay] ?? SHADOW_ALPHA[1]!
  const [sx, sz] = SHADOW_SCALE[timeOfDay] ?? SHADOW_SCALE[1]!
  if (!s.started) {
    s.alpha = alpha; s.sx = sx; s.sz = sz; s.started = true
    return
  }
  s.sx = approach(s.sx, sx, SCALE_STEP * frames)
  s.sz = approach(s.sz, sz, SCALE_STEP * frames)
  s.alpha = approach(s.alpha, alpha, ALPHA_STEP * frames)
}

/** 모델 알파 0~31을 불투명도로. 원작이 정수로 자른 뒤 넘긴다 */
export function footShadowOpacity(s: FootShadow): number {
  return Math.floor(s.alpha) / 31
}

/**
 * 그림자를 안 까는 그림 (`Unk_ov5_021FC194`에서 넷째 칸이 0인 것).
 *
 * 나머지 230종은 전부 1이다. 판때기로 서는 것 중에는 갤럭시단 아지트 문 ·
 * 기라티나 오리진폼 · 조무래기 무리 둘이 여기 든다
 */
const NO_SHADOW: ReadonlySet<string> = new Set([
  'MAP_SIGNPOST', 'MAILBOX', 'SIGNBOARD', 'ARROW_SIGNPOST', 'GYM_SIGNPOST',
  'TRAINER_TIPS_SIGNPOST', 'BERRY_SOIL', 'BOOK', 'INVISIBLE', 'GALACTIC_HQ_DOOR',
  'ELITE_FOUR_ROOM_DOOR', 'DIST_WORLD_PLAYER_M', 'GIRATINA_ORIGIN', 'GRUNTS_GROUP_OF_4',
  'GRUNTS_GROUP_OF_3', 'DIST_WORLD_PLAYER_M_SURF', 'DIST_WORLD_PLAYER_F_SURF',
  'DIST_WORLD_PLAYER_M_HOLDING_POKEBALL', 'DIST_WORLD_PLAYER_F_HOLDING_POKEBALL',
  'WALL_BLOCKING_ROTOMS_ROOM', 'DIST_WORLD_PLAYER_F', 'DIST_WORLD_PLAYER_M_SAVE',
  'DIST_WORLD_PLAYER_F_SAVE', 'DIST_WORLD_PLAYER_M_POKETCH', 'DIST_WORLD_PLAYER_F_POKETCH',
  'PLAYER_M_SAVE_HEARTHOME_GYM', 'PLAYER_F_SAVE_HEARTHOME_GYM',
  'PLAYER_M_POKETCH_HEARTHOME_GYM', 'PLAYER_F_POKETCH_HEARTHOME_GYM',
])

export function castsFootShadow(sprite: NpcSprite): boolean {
  return !NO_SHADOW.has(sprite.name)
}

/** 몸빛 단계의 끝 (`SPRITE_PALETTE_MAX_TINT_LEVEL`, `ov9_02249960.c`) */
const MAX_TINT = 16

/**
 * 몸빛 단계(`Movable.darkness`, 0~16)를 **색 배율**로 (sRGB).
 *
 * 원작은 팔레트 16색을 하나씩 `base + ((0 − base) · level >> 4)`로 검정 쪽에 섞는다
 * (`CalculateTintedColor(…, COLOR_BLACK, level)`). 검정이 0이라 그 식은 곧
 * `base · (1 − level/16)`이고, 5비트 sRGB 값에 거는 것이라 배율도 sRGB다 — 선형
 * 색에 그대로 곱하면 중간 단계가 너무 어둡다. 입체 몬(`NpcMonModels`)과 판때기
 * (`NpcSprites`)가 같은 값을 쓴다.
 *
 * ⚠️ **팔레트 반올림은 안 옮긴다.** 원작은 채널마다 `>> 4`로 내림하므로 한 칸쯤
 * 더 어둡다 — 팔레트를 안 들고 있는 우리는 곱 하나로 건다
 */
export function darknessTint(level: number): number {
  return 1 - Math.min(MAX_TINT, Math.max(0, level)) / MAX_TINT
}

/** `TILE_BEHAVIOR_REFLECTIVE` — 열거형에서 0x2C번째다 (`map_tile_behaviors.h`) */
const REFLECTIVE = 0x2c

/**
 * 그 칸에 서면 그림자를 감추는가 (`map_object_move.c`의 `sub_02063B20`).
 *
 * 풀숲 · 물 · 웅덩이 · 얕은 물 · 눈 · 진흙 · 거울 바닥이다 — 발이 묻히거나
 * 비쳐 보이는 자리다. 물·눈 위 다리는 **위로** 친다: 배치표의 사람은 다리
 * 위에 서 있다 (`actor/ambient`의 `terrainBlocks`와 같다)
 */
export function hidesFootShadow(behavior: number): boolean {
  return isTallGrass(behavior)
    || isVeryTallGrass(behavior)
    || isOnWater(behavior, true)
    || isPuddle(behavior)
    || isShallowWater(behavior)
    || isOnSnow(behavior, true)
    || isMud(behavior)
    || isMudWithGrass(behavior)
    // `TileBehavior_IsReflective` (`map_tile_behavior.c` 721줄)
    || behavior === REFLECTIVE || behavior === Behavior.PUDDLE_NO_SPLASHING
}

// ── 장 고르기 ────────────────────────────────────────────────────────────────

/**
 * 동작 `anim`의 `elapsed`틱째에 쓸 장.
 *
 * 차례표의 틱은 **전체 타임라인 기준**이라(걷기는 0~63) 동작 구간 안으로 접은 뒤
 * 그 값 이하인 마지막 항목을 고른다. 서 있는 사람은 `elapsed`가 0이라 늘 그
 * 방향의 첫 장이다.
 */
export function frameOf(sprite: NpcSprite, anim: number, elapsed: number): number {
  const { anims, seq } = sprite
  if (anims === null || seq === null) return 0
  const a = anims[Math.min(anim, anims.length - 1)]
  if (a === undefined) return 0
  const [from, to, kind] = a
  const span = to - from + 1
  if (span <= 0) return 0
  const e = Math.max(0, Math.floor(elapsed))
  const tick = from + (kind === LOOP ? e % span : Math.min(e, span - 1))

  let pick = 0
  for (let i = 0; i < seq.ticks.length; i++) {
    const t = seq.ticks[i]
    if (t === undefined || t > tick) break
    pick = seq.frames[i] ?? 0
  }
  return Math.min(pick, sprite.frames - 1)
}
