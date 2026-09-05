// 진화 연출의 마디 (PARITY §3.1) — `src/evolution.c` · `src/unk_0207C63C.c`
//
// ⚠️ **원작 진화는 입자로 돈다.** 오래 「2D라 입자가 없다」고 적혀 있었는데
// 틀렸다 — 로더가 NARC를 이름이 아니라 **번호**로 부르고 그 자리가 이름 없는
// 파일이라 `shinka`로 훑으면 한 건도 안 나온다:
//
//     evolution.c  sub_0207C894(...)                       → unk_0207C63C.c
//                  ParticleSystem_LoadResourceFromNARC(124, 0)   ← 124가 이 NARC다
//                  sub_0207C8C4(obj, N)
//                    = ParticleSystem_CreateEmitterWithCallback(ps, N, ...)
//
// `evolution.c`가 세우는 `N`이 **0~12 열셋**이고 그 `.spa`의 자원도 **열셋**이다.
//
// ⚠️ **길이가 상수가 아니다.** 교대는 시간으로 끝나지 않고 「살아 있는 이미터가
// 0이 될 때」 끝난다 (`sub_0207C8E0`). 열셋이 다 자기유지라 그 길이가
// **결정적**이고, `splLifeFrames`로 재면 자원 9(202프레임)가 40프레임째에 서서
// 242프레임을 정한다. 그래서 이 파일은 길이를 적어 두지 않고 **자료에서 뽑는다**.
import { splLifeFrames } from '../battle/spl/emitter'
import type { SplFile } from '../battle/spl/resource'

/** `evolve` 묶음의 멤버. 원작이 `LoadResourceFromNARC(124, **0**)` */
export const EVO_MEMBER = 0

/**
 * 마디마다 세우는 이미터 (자원 번호).
 *
 * ⚠️ **열셋을 하나도 안 남기고 쓴다.** 번호가 곧 `.spa`의 자원 번호라
 * 하나라도 빼면 그 연출이 통째로 빈다
 */
export const EVO_EMITTERS = {
  /** `EVOLUTION_STATE_START_FADE` — 몸이 하얘지기 시작할 때 */
  start: [0],
  /** `EVOLUTION_STATE_CLAMP_IN`이 끝나며 — 교대가 여기서 시작한다 */
  clampIn: [1, 2, 7, 8, 9, 11],
  /** 교대가 끝나며 */
  swap: [3, 4, 5, 6, 10],
  /** `EVOLUTION_STATE_CLAMP_OUT_AND_FADE` */
  clampOut: [12],
} as const

/**
 * `START_FADE`가 `delay = 40`을 걸고 `CLAMP_IN`이 그것을 센다.
 *
 * 교대는 이 프레임에 시작하고, 취소 창도 여기서 열린다
 */
export const EVO_CLAMP_FRAMES = 40
/** 창이 위아래로 이만큼 닫힌다 (`windowTop < 40`). 원작 화면이 192줄이다 */
const CLAMP_ROWS = 40
const SCREEN_ROWS = 192
/** 프레임마다 2줄 (`windowTop += 2`) */
const CLAMP_STEP = 2

/** `PaletteData_StartFade(..., 2, 0, 16, 0x7FFF)` — 흰 막이 서는 데 */
const SWAP_FADE = 16 * (2 + 1)
/** 그 뒤 `delay = 8` */
const SWAP_HOLD = 8
/** `PaletteData_StartFade(..., 4, 16, 0, 0x7FFF)` — 흰 막이 걷히는 데 */
const END_FADE = 16 * (4 + 1)
/** `PokemonSprite_StartFade(sprite, 0, 16, 4, 0x7FFF)` — 몸이 하얘지는 데 */
const WHITEN = 16 * (4 + 1)
/** `PokemonSpriteManager_StartFadeAll(man, 16, 0, 3, 0x7FFF)` — 되돌아오는 데 */
const UNWHITEN = 16 * (3 + 1)

/** 이미터 하나를 언제 세우는가 */
interface EvoCue {
  readonly frame: number
  /** `.spa` 안의 자원 번호 */
  readonly res: number
}

export interface EvolutionBeats {
  /** 교대가 끝나고 새 몸으로 확정되는 프레임 */
  readonly swap: number
  /** 창이 다시 열리고 마지막 이미터가 서는 프레임 */
  readonly clampOut: number
  /** 연출이 끝나는 프레임 (울음소리와 축하 글이 여기서) */
  readonly end: number
  readonly cues: readonly EvoCue[]
}

/**
 * 자료를 아직 못 받았을 때 쓰는 값.
 *
 * ⚠️ **지어낸 수가 아니라 롬 실측이다** (`.audit/evoBeat.mjs`, 미국판). 입자
 * 묶음이 오기 전에도 화면은 돌아야 하는데, 그때 길이가 0이 되면 진화가
 * 한 프레임에 끝난다. 자료가 오면 `evolutionBeats`가 같은 수를 다시 낸다
 */
export const EVO_BEATS: EvolutionBeats = {
  swap: 242,
  clampOut: 298,
  end: 378,
  cues: [
    ...EVO_EMITTERS.start.map((res) => ({ frame: 0, res })),
    ...EVO_EMITTERS.clampIn.map((res) => ({ frame: EVO_CLAMP_FRAMES, res })),
    ...EVO_EMITTERS.swap.map((res) => ({ frame: 242, res })),
    ...EVO_EMITTERS.clampOut.map((res) => ({ frame: 298, res })),
  ],
}

/**
 * 마디를 **자료에서** 뽑는다.
 *
 * @param file 진화 입자 묶음의 멤버 0. 아직 없으면 `null`이고 실측값으로 간다
 */
export function evolutionBeats(file: SplFile | null): EvolutionBeats {
  if (file === null) return EVO_BEATS
  const life = (res: number): number => {
    const at = file.resources[res]
    // 스스로 안 끝나는 자원은 원작도 마디를 안 늘린다 — 대본 끝에서 걷어 간다
    return at === undefined ? 0 : splLifeFrames(at) ?? 0
  }
  const longest = (list: readonly number[], from: number): number =>
    Math.max(...list.map((res) => from + life(res)))

  // 교대는 START_FADE와 CLAMP_IN이 세운 것이 **다** 죽어야 끝난다
  const swap = Math.max(longest(EVO_EMITTERS.start, 0), longest(EVO_EMITTERS.clampIn, EVO_CLAMP_FRAMES))
  // CLAMP_OUT은 흰 막이 다 선 뒤에야 `delay`를 세기 시작한다
  const clampOut = swap + SWAP_FADE + SWAP_HOLD
  // 마지막은 막이 걷히고 이미터도 죽어야 끝난다
  const end = clampOut + Math.max(END_FADE, life(EVO_EMITTERS.clampOut[0]!))
  return {
    swap,
    clampOut,
    end,
    cues: [
      ...EVO_EMITTERS.start.map((res) => ({ frame: 0, res })),
      ...EVO_EMITTERS.clampIn.map((res) => ({ frame: EVO_CLAMP_FRAMES, res })),
      ...EVO_EMITTERS.swap.map((res) => ({ frame: swap, res })),
      ...EVO_EMITTERS.clampOut.map((res) => ({ frame: clampOut, res })),
    ],
  }
}

/** `MON_AFFINE_SCALE(1)` */
const FULL = 256
/** `evolutionData->attributeDelta = 8` */
const FIRST_DELTA = 8
/** `if (attributeDelta < 64) attributeDelta *= 2` */
const TOP_DELTA = 64

/**
 * 한 번 오가는 데 쓰는 걸음 폭.
 *
 * 왕복 **한 벌마다** 배로 붙는다 — `shrinkAndGrowState`의 홀수 갈래가 0에 닿을
 * 때만 `*= 2`이므로 짝수·홀수 두 번이 같은 폭을 쓴다
 */
function swingDelta(swing: number): number {
  return Math.min(TOP_DELTA, FIRST_DELTA << Math.floor(swing / 2))
}

interface EvolutionScales {
  /** 진화 전 몸의 크기 (0~1) */
  readonly before: number
  /** 진화 뒤 몸의 크기 (0~1) */
  readonly after: number
}

/**
 * 교대가 시작하고 `frame`째의 두 몸 크기 (`Evolution_Main`).
 *
 * ⚠️ **사인파가 아니다.** 원작은 크기를 프레임마다 `delta`씩 **선형으로**
 * 주고받다가 0에 닿으면 방향을 뒤집고, 왕복 한 벌마다 `delta`가 배로 붙는다.
 * 그래서 오가는 데 드는 프레임이 **32·32·16·16·8·8·4·4·4…** 로 점점 짧아진다 —
 * 「점점 빨라지는 깜빡임」이 이 연출의 서명이고, 사인파로는 안 나온다
 */
export function evolutionScales(frame: number): EvolutionScales {
  if (!Number.isFinite(frame) || frame <= 0) return { before: 1, after: 0 }
  let at = 0
  for (let swing = 0; ; swing++) {
    const delta = swingDelta(swing)
    const span = FULL / delta
    if (frame < at + span) {
      const t = ((frame - at) * delta) / FULL
      return swing % 2 === 0 ? { before: 1 - t, after: t } : { before: t, after: 1 - t }
    }
    at += span
  }
}

/**
 * 위아래를 가리는 띠의 두께 (화면 높이의 비, 0~`40/192`).
 *
 * `CLAMP_IN`이 프레임마다 두 줄씩 닫고 `CLAMP_OUT_AND_FADE`가 같은 속도로 연다
 */
export function evolutionClamp(frame: number, beats: EvolutionBeats): number {
  const rows = frame < beats.swap
    ? Math.min(CLAMP_ROWS, CLAMP_STEP * frame)
    : Math.max(0, CLAMP_ROWS - CLAMP_STEP * (frame - beats.swap))
  return rows / SCREEN_ROWS
}

/**
 * 화면 전체를 덮는 흰 막 (0~1).
 *
 * 원작은 팔레트를 통째로 흰색으로 민다 (`PLTTBUF_MAIN_BG_F | ... | SUB_OBJ_F`) —
 * 배경도 몸도 같이 하얘지므로 우리 쪽 대응물은 **무대를 덮는 막**이다
 */
export function evolutionVeil(frame: number, beats: EvolutionBeats): number {
  if (frame < beats.swap) return 0
  if (frame < beats.clampOut) return Math.min(1, (frame - beats.swap) / SWAP_FADE)
  return Math.max(0, 1 - (frame - beats.clampOut) / END_FADE)
}

/**
 * 두 몸이 얼마나 하얗게 지워졌나 (0~1).
 *
 * `START_FADE`에서 둘 다 흰색으로 밀고(`PokemonSprite_StartFade`), 다 끝나고
 * 되돌린다 — 교대하는 동안 화면에 있는 것은 **흰 실루엣 둘**이다
 */
export function evolutionBodyWhite(frame: number, beats: EvolutionBeats): number {
  if (frame < beats.clampOut) return Math.min(1, frame / WHITEN)
  return Math.max(0, 1 - (frame - beats.clampOut) / UNWHITEN)
}

/**
 * 지금 멈출 수 있나.
 *
 * 원작은 `state == EVOLUTION_STATE_ANIMATION_ALTERNATE_POKEMON`일 때만 B를
 * 받는다 — 곧 **교대하는 동안만**이다 (그리고 `flags & 1`, 레벨업 진화만)
 */
export function evolutionCanCancel(frame: number, beats: EvolutionBeats): boolean {
  return frame >= EVO_CLAMP_FRAMES && frame < beats.swap
}
