// 호수의 셋이 바위 넣는 법을 보여 준다 (`EVENT_CMD_SHOW_*_BOULDER_TUTO`) — PARITY §6.10
//
// B5F의 바위 셋 앞에서 한 번씩 돈다. 셋 다 뼈대가 같다:
//
//   ① B5F의 그 마리(#131~133)를 세우고 운다
//   ② 판 아래에서 **솟아오른다** — 그림 어긋남 y만 올린다
//   ③ 바위를 가리킨다 (셋이 다르다 · 아래)
//   ④ 도로 가라앉고, 다 가라앉으면 지우고, 퍼즐 표식 둘을 세운다
//      (`*_TUTO_SEEN` · `*_IN_B6F`) — 그러면 B6F에 그 마리가 선다
//
// ③이 셋이 다르다 — 유크시는 그림만 z로 바위 위까지 갔다가 오르내리고 물러나고,
// 아그놈과 엠라이트는 **이동 동작 목록**으로 실제로 걷는다. 엠라이트는 주인공
// 둘레를 돌고, 그동안 주인공도 제자리에서 따라 돈다.
//
// ⚠️ **이게 없으면 B6F의 셋이 영영 안 선다.** B6F의 #131~133은 조건이
// `boulderTrue` 15·13·14(`*_IN_B6F`)인데 그 표식을 세우는 자리가 여기뿐이다.
// 그러면 웅덩이를 채울 때 도는 B6F 스크립트 5·6·7이 없는 마리에게
// `ApplyMovement`를 걸고 지운다 — 사라지는 연출이 통째로 빈다.
//
// 값은 전부 `ov9_02249960.c`의 상수이고, 판정도 원작의 정수 산술 그대로다
// (`(offset >> 4) / FX32_ONE`은 **0 쪽으로 자른다**).
import { EVENT_CMD } from './distortion'
import { PUZZLE_FLAG } from './distortionBoulder'
import { DIST_OBJ } from './distortionElevator'

const FX32_ONE = 4096

/** 한 칸이 고정소수점으로 얼마인가 (`MAP_OBJECT_TILE_SIZE` = `FX32_ONE << 4`) */
export const TUTO_TILE_FX = FX32_ONE * 16

/** 그림 어긋남을 칸으로 — 원작의 `(v >> 4) / FX32_ONE` (C 나눗셈은 0 쪽으로 자른다) */
export function fxTiles(v: number): number {
  return Math.trunc((v >> 4) / FX32_ONE)
}

/** `constants/species.h` */
const SPECIES = { uxie: 480, mesprit: 481, azelf: 482 } as const

/** 솟을 때 한 프레임 (`*_BOULDER_TUTO_ASCEND_Y_DELTA`, 셋 다 `FX32_ONE * 2`) */
const ASCEND_Y_DELTA = FX32_ONE * 2

/** 가라앉는 속도가 프레임마다 붙는 만큼 (`*_DESCEND_Y_DELTA_INCREMENT`, 셋 다 0x200) */
const DESCEND_Y_DELTA_INCREMENT = 0x200

/** 가라앉는 속도의 끝 (`*_DESCEND_Y_DELTA_TARGET`, 셋 다 `FX32_ONE * 2`) */
const DESCEND_Y_DELTA_TARGET = FX32_ONE * 2

/** 유크시가 바위 쪽으로 가는 한 프레임 (`UXIE_BOULDER_TUTO_MOVE_TO_BOULDER_Z_DELTA`) */
const UXIE_TO_BOULDER_Z_DELTA = FX32_ONE
/** 거기까지 (`..._MOVE_TO_BOULDER_Z_TARGET`, 칸) — 북쪽으로 두 칸, 바위 #130 위다 */
const UXIE_TO_BOULDER_Z_TARGET = -2
/** 물러나는 한 프레임 (`..._MOVE_AWAY_Z_DELTA`) */
const UXIE_AWAY_Z_DELTA = FX32_ONE
/** 물러나는 끝 (`..._MOVE_AWAY_Z_TARGET`, 칸). **같을 때** 멈춘다 */
const UXIE_AWAY_Z_TARGET = 1
/** 오르내림 표의 칸 수 (`..._HOVER_STEP_COUNT`) */
const UXIE_HOVER_STEP_COUNT = 8
/** 몇 번 오르내리는가 (`..._HOVER_REPEAT_COUNT`) */
const UXIE_HOVER_REPEAT_COUNT = 3
/** 오르내림 높이 (`EventCmdShowUxieBoulderTuto_Hover`의 `yOffsets`) */
const UXIE_HOVER_Y: readonly number[] = [0, 2048, 4096, 8192, 16384, 24576, 28672, 32768]

/** 이동 동작 하나 (`MapObjectAnimCmd`). 동작은 **이름**으로 적는다 — 번호는 표가 준다 */
export type TutoAnimCmd = readonly [action: string, count: number]

/** 아그놈 (`sAzelfBoulderTutoAnimation`) — 동쪽 두 칸이 바위 #129 위다 */
export const AZELF_ANIM: readonly TutoAnimCmd[] = [
  ['DELAY_32', 1],
  ['WALK_SLOWER_EAST', 1],
  ['WALK_SLOWER_EAST', 1],
  ['WALK_SLOW_WEST', 1],
  ['WALK_SLOWER_WEST', 1],
  ['DELAY_16', 1],
]

/** 엠라이트 — 주인공이 z 67에 섰을 때 (`sMespritBoulderTutoAnimationPokemonTop`) */
export const MESPRIT_ANIM_POKEMON_TOP: readonly TutoAnimCmd[] = [
  ['DELAY_32', 1],
  ['WALK_NORMAL_EAST', 2],
  ['WALK_FAST_NORTH', 2],
  ['WALK_FAST_EAST', 2],
  ['WALK_FAST_SOUTH', 2],
  ['WALK_FAST_WEST', 2],
  ['WALK_FAST_NORTH', 2],
  ['WALK_FAST_EAST', 2],
  ['WALK_FAST_SOUTH', 2],
  ['WALK_FAST_WEST', 2],
  ['WALK_FAST_WEST', 2],
  ['WALK_NORMAL_WEST', 1],
  ['WALK_SLOW_WEST', 1],
  ['DELAY_32', 1],
  ['WALK_SLOW_EAST', 2],
  ['WALK_SLOWER_EAST', 1],
  ['DELAY_16', 1],
]

/**
 * 엠라이트 — 그 밖 (`sMespritBoulderTutoAnimationPokemonBottom`).
 *
 * 주인공이 한 칸 아래(z 68)에 서 있으므로 북쪽 첫 걸음과 마지막 걸음이 한 칸씩이다
 */
export const MESPRIT_ANIM_POKEMON_BOTTOM: readonly TutoAnimCmd[] = [
  ['DELAY_32', 1],
  ['WALK_NORMAL_EAST', 2],
  ['WALK_FAST_NORTH', 1],
  ['WALK_FAST_EAST', 2],
  ['WALK_FAST_SOUTH', 2],
  ['WALK_FAST_WEST', 2],
  ['WALK_FAST_NORTH', 2],
  ['WALK_FAST_EAST', 2],
  ['WALK_FAST_SOUTH', 2],
  ['WALK_FAST_WEST', 2],
  ['WALK_FAST_NORTH', 1],
  ['WALK_FAST_WEST', 2],
  ['WALK_NORMAL_WEST', 1],
  ['WALK_SLOW_WEST', 1],
  ['DELAY_32', 1],
  ['WALK_SLOW_EAST', 2],
  ['WALK_SLOWER_EAST', 1],
  ['DELAY_16', 1],
]

/**
 * 주인공이 제자리에서 두 바퀴 돈다 (`sMespritBoulderTutoAnimationPlayerTop`).
 *
 * ⚠️ **Top과 Bottom이 한 줄도 안 다르다.** 원작이 표를 둘 두었을 뿐이라 우리도
 * 둘로 둔다 — 엠라이트 쪽 표와 짝을 맞춰 고르는 자리가 원작과 같아야 한다
 */
export const MESPRIT_ANIM_PLAYER_TOP: readonly TutoAnimCmd[] = [
  ['DELAY_32', 1],
  ['DELAY_8', 2],
  ['FACE_WEST', 1], ['DELAY_1', 3],
  ['FACE_NORTH', 1], ['DELAY_1', 3],
  ['FACE_EAST', 1], ['DELAY_1', 3],
  ['FACE_SOUTH', 1], ['DELAY_1', 3],
  ['FACE_WEST', 1], ['DELAY_1', 3],
  ['FACE_NORTH', 1], ['DELAY_1', 3],
  ['FACE_EAST', 1], ['DELAY_1', 3],
  ['FACE_SOUTH', 1], ['DELAY_1', 3],
  ['FACE_WEST', 1],
]

/** `sMespritBoulderTutoAnimationPlayerBottom` — Top과 같다 */
export const MESPRIT_ANIM_PLAYER_BOTTOM: readonly TutoAnimCmd[] = [...MESPRIT_ANIM_PLAYER_TOP]

/** 엠라이트가 Top 표를 고르는 주인공의 세계 z (`EventCmdShowMespritBoulderTuto_Ascend`) */
const MESPRIT_TOP_PLAYER_Z = 67

/** 두 표를 고른다. 주인공의 **세계** z가 67이면 Top, 아니면 Bottom */
export function mespritAnims(playerWorldZ: number): {
  pokemon: readonly TutoAnimCmd[]; player: readonly TutoAnimCmd[]; top: boolean
} {
  const top = playerWorldZ === MESPRIT_TOP_PLAYER_Z
  return top
    ? { pokemon: MESPRIT_ANIM_POKEMON_TOP, player: MESPRIT_ANIM_PLAYER_TOP, top }
    : { pokemon: MESPRIT_ANIM_POKEMON_BOTTOM, player: MESPRIT_ANIM_PLAYER_BOTTOM, top }
}

interface TutoSpec {
  /** 어느 마리의 갈래인가. 바위를 가리키는 ③이 셋 다 다르다 */
  who: 'uxie' | 'azelf' | 'mesprit'
  species: number
  /** 솟아서 세우는 B5F의 그 마리 */
  b5f: number
  /** 다 끝나면 B6F에 서는 그 마리 (조건 `boulderTrue inB6F`) */
  b6f: number
  /** `DIST_WORLD_PUZZLE_FLAG_*_TUTO_SEEN` — 사건 칸의 조건이 이걸 본다 */
  seen: number
  /** `DIST_WORLD_PUZZLE_FLAG_*_IN_B6F` */
  inB6F: number
  /** 얼마나 솟는가 (칸, `*_ASCEND_Y_TARGET`) */
  ascendTarget: number
}

/** 사건 명령 → 그 마리 */
export const TUTO_SPECS: Readonly<Record<number, TutoSpec>> = {
  [EVENT_CMD.showUxieBoulderTuto]: {
    who: 'uxie', species: SPECIES.uxie,
    b5f: DIST_OBJ.b5fUxie, b6f: DIST_OBJ.b6fUxie,
    seen: PUZZLE_FLAG.uxieTutoSeen, inB6F: PUZZLE_FLAG.uxieInB6F,
    ascendTarget: 17,
  },
  [EVENT_CMD.showAzelfBoulderTuto]: {
    who: 'azelf', species: SPECIES.azelf,
    b5f: DIST_OBJ.b5fAzelf, b6f: DIST_OBJ.b6fAzelf,
    seen: PUZZLE_FLAG.azelfTutoSeen, inB6F: PUZZLE_FLAG.azelfInB6F,
    ascendTarget: 13,
  },
  [EVENT_CMD.showMespritBoulderTuto]: {
    who: 'mesprit', species: SPECIES.mesprit,
    b5f: DIST_OBJ.b5fMesprit, b6f: DIST_OBJ.b6fMesprit,
    seen: PUZZLE_FLAG.mespritTutoSeen, inB6F: PUZZLE_FLAG.mespritInB6F,
    ascendTarget: 9,
  },
}

/** 원작 상태 번호의 이름 (`EventCmdShow*BoulderTutoState`). `init`은 세울 때 끝난다 */
export type TutoState =
  'ascend' | 'moveToBoulder' | 'hover' | 'moveAway' | 'waitForAnimation' | 'descend' | 'done'

/** 한 사건의 상태 (`CmdRunDataShow*BoulderTuto`) */
export interface TutoRun {
  readonly spec: TutoSpec
  state: TutoState
  /** 그림 어긋남 (고정소수점, `*SpritePosOffset`) */
  offset: { x: number; y: number; z: number }
  hoverStep: number
  hoverStepDelta: number
  hoverRepeat: number
  finalY: number
  descendYDelta: number
}

/**
 * `EventCmdShow*BoulderTuto_Init`이 끝난 자리.
 *
 * 세우고 우는 것은 부르는 쪽이 한다. 여기서는 버퍼를 0으로 비우고
 * (`ResetLoadedEventDataBuffer`) 유크시만 `hoverStepDelta = 1`을 넣는다
 */
export function newTutoRun(spec: TutoSpec): TutoRun {
  return {
    spec,
    state: 'ascend',
    offset: { x: 0, y: 0, z: 0 },
    hoverStep: 0,
    hoverStepDelta: spec.who === 'uxie' ? 1 : 0,
    hoverRepeat: 0,
    finalY: 0,
    descendYDelta: 0,
  }
}

/**
 * 한 프레임 (`sShow*BoulderTutoHandlers` 한 번).
 *
 * · `continue` — 이 프레임은 여기까지다 (`EVENT_CMD_HANDLER_RES_CONTINUE`)
 * · `startAnim` — 다 솟았다. 부르는 쪽이 이동 동작 목록을 건다
 *   (`MapObject_StartAnimation`). 이 프레임도 여기까지다
 * · `finish` — 다 가라앉았다. 부르는 쪽이 지우고 표식을 세운다
 *
 * @param animDone 걸어 둔 목록이 다 끝났는가 (`MapObject_HasAnimationEnded`).
 *   아그놈·엠라이트만 본다 — 엠라이트는 **자기와 주인공 둘 다** 끝나야 한다
 */
export function tutoFrame(run: TutoRun, animDone: boolean): 'continue' | 'startAnim' | 'finish' {
  const o = run.offset
  for (;;) {
    switch (run.state) {
      case 'ascend': {
        // 목표 한 칸 전까지는 두 배로 솟는다 (`ascendYDelta <<= 1`)
        let delta = ASCEND_Y_DELTA
        if (fxTiles(o.y) < run.spec.ascendTarget - 1) delta <<= 1
        o.y += delta
        if (fxTiles(o.y) < run.spec.ascendTarget) return 'continue'
        if (run.spec.who === 'uxie') {
          run.state = 'moveToBoulder'
          return 'continue'
        }
        run.state = 'waitForAnimation'
        return 'startAnim'
      }
      case 'moveToBoulder':
        o.z -= UXIE_TO_BOULDER_Z_DELTA
        if (fxTiles(o.z) <= UXIE_TO_BOULDER_Z_TARGET) {
          run.finalY = o.y
          run.state = 'hover'
        }
        return 'continue'
      case 'hover':
        o.y = run.finalY + UXIE_HOVER_Y[run.hoverStep >> 1]!
        run.hoverStep += run.hoverStepDelta
        if (run.hoverStep >= UXIE_HOVER_STEP_COUNT * 2 - 1 || run.hoverStep <= 0) {
          run.hoverStepDelta = -run.hoverStepDelta
          if (run.hoverStep === 0) {
            run.hoverRepeat += 1
            if (run.hoverRepeat >= UXIE_HOVER_REPEAT_COUNT) {
              o.y = run.finalY + UXIE_HOVER_Y[run.hoverStep >> 1]!
              run.state = 'moveAway'
            }
          }
        }
        return 'continue'
      case 'moveAway':
        o.z += UXIE_AWAY_Z_DELTA
        if (fxTiles(o.z) === UXIE_AWAY_Z_TARGET) run.state = 'descend'
        return 'continue'
      case 'waitForAnimation':
        if (!animDone) return 'continue'
        // `EVENT_CMD_HANDLER_RES_LOOP` — 같은 프레임에 가라앉기 시작한다
        run.state = 'descend'
        continue
      case 'descend':
        if (run.descendYDelta < DESCEND_Y_DELTA_TARGET) {
          run.descendYDelta += DESCEND_Y_DELTA_INCREMENT
        }
        o.y -= run.descendYDelta
        if (fxTiles(o.y) > 0) return 'continue'
        run.state = 'done'
        return 'finish'
      case 'done':
        return 'finish'
    }
  }
}

/** 다 끝난 퍼즐 표식 (`SetPersistedBoulderPuzzleFlag` 둘) */
export function tutoFinishedFlags(flags: number, spec: TutoSpec): number {
  return flags | (1 << spec.seen) | (1 << spec.inB6F)
}
