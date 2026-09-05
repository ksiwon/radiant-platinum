// 알 부화의 마디 (PARITY §3.2) — `cutscenes/egg_hatch/main.c` · `graphics.c`
//
// 진화와 같은 짜임이다 — 상태 기계가 흔들고, 흔들림 한가운데에서 입자를 세우고,
// **살아 있는 이미터가 0이 될 때까지** 기다렸다 다음으로 간다
// (`EggHatchParticleSystem_EmittersActive`).
//
// 흔들림 한 벌은 열 걸음이고 **여섯째 걸음**에 입자가 선다
// (`IncrementShakeAnimation`이 `shakeProgress >= 10`에서 끝나고
// `EggHatch_ShakeEgg`가 6에서 `EGG_SHAKE_HALF_OVER`를 돌려준다).
//
// ⚠️ **알 그림은 우리 것이다.** 원작은 2D 스프라이트를 여섯 칸으로 갈아 끼운다
// (온전함 → 금 하나 → 금 둘 → 큰 금 → 뚫림 → 깨지기 직전). 우리 무대는 3D라
// 그 칸이 없어서 흔들림과 **입자만** 원작 것을 쓴다 (`scene/CinematicStage`).
import { splLifeFrames } from '../battle/spl/emitter'
import type { SplFile } from '../battle/spl/resource'

/** `egg` 묶음의 멤버 — 0이 보통 알, 1이 마나피다 (`epsArgs.narcIdx`) */
export const EGG_MEMBER = 0

/**
 * 마디마다 세우는 이미터 (`enum EggNormalEmitter`).
 *
 * 0 첫 조각 · 1 더 깨진 조각 · 2 터짐 · 3 반짝임
 */
export const EGG_EMITTERS = { first: 0, more: 1, burst: 2, sparkle: 3 } as const

/** `InitializeEggAnimation`이 `subStateTimer >= 25`를 센다 */
const HOLD = 25
/** 흔들림 한 벌 (`shakeProgress >= 10`) */
const SHAKE = 10
/** 그 한가운데 (`EGG_SHAKE_HALF_OVER`) */
const HALF = 6
/** `StartBreakingEgg`이 잔 흔들림을 두 번 한다 */
const MINOR = 2
/** 알을 감춘 뒤 `subStateTimer >= 10`을 세고 흰색으로 민다 */
const AFTER = 10
/** `PaletteData_StartFade(..., 0, 0, 16, ...)` — 열여섯 걸음 */
const FADE = 16

interface HatchCue {
  readonly frame: number
  readonly res: number
}

export interface HatchBeats {
  /** 첫 조각이 떨어지는 프레임 */
  readonly first: number
  /** 조각이 더 깨지는 프레임 */
  readonly more: number
  /** 알이 터지는 프레임 — 여기서 반짝임도 같이 선다 */
  readonly burst: number
  /** 알이 사라지는 프레임 */
  readonly hide: number
  /** 연출이 끝나는 프레임 */
  readonly end: number
  readonly cues: readonly HatchCue[]
}

/**
 * 자료를 아직 못 받았을 때 쓰는 값.
 *
 * ⚠️ **롬 실측이다** (`.audit/eggBeat.mjs`, 미국판). 자원 넷의 수명이
 * 22·26·27·27프레임이라 「이미터가 다 죽는」 자리가 87프레임에 온다
 */
export const EGG_BEATS: HatchBeats = beatsFrom([22, 26, 27, 27])

/** 마디를 **자료에서** 뽑는다 */
export function hatchBeats(file: SplFile | null): HatchBeats {
  if (file === null) return EGG_BEATS
  const life = (res: number): number => {
    const at = file.resources[res]
    return at === undefined ? 0 : splLifeFrames(at) ?? 0
  }
  return beatsFrom([life(0), life(1), life(2), life(3)])
}

function beatsFrom(life: readonly number[]): HatchBeats {
  // 잔 흔들림 둘이 끝난 자리에서 큰 흔들림 둘이 이어진다
  const shards = HOLD + SHAKE * MINOR
  const first = shards + HALF
  const more = shards + SHAKE + HALF
  // `CompleteEggAnimation`은 **이미터가 다 죽어야** 시작한다
  const idle = Math.max(first + (life[0] ?? 0), more + (life[1] ?? 0))
  const burst = idle + HALF
  const hide = idle + SHAKE
  const end = Math.max(
    hide + AFTER + FADE,
    burst + Math.max(life[2] ?? 0, life[3] ?? 0),
  )
  return {
    first,
    more,
    burst,
    hide,
    end,
    cues: [
      { frame: first, res: EGG_EMITTERS.first },
      { frame: more, res: EGG_EMITTERS.more },
      { frame: burst, res: EGG_EMITTERS.burst },
      { frame: burst, res: EGG_EMITTERS.sparkle },
    ],
  }
}

/**
 * 이 프레임에 알이 얼마나 흔들리나 (라디안).
 *
 * ⚠️ **원작 표를 그대로 옮길 수 없다.** 원작은 스프라이트를 픽셀로 밀고
 * (`sXOffsets`) 아핀으로 눌러 2D 칸 안에서 흔든다 — 우리 알은 3D 구라 옮길
 * 좌표가 없다. 지킨 것은 **박자**다: 흔들림 한 벌이 열 프레임이고 그 안에서
 * 한 번 오간다. 잔 흔들림 둘보다 큰 흔들림 둘이 더 크게 흔든다
 */
export function hatchShake(frame: number, beats: HatchBeats): number {
  if (frame < HOLD || frame >= beats.hide) return 0
  const step = (frame - HOLD) % SHAKE
  const wave = Math.sin((step / SHAKE) * Math.PI * 2)
  const big = frame >= beats.first - HALF
  return wave * (big ? 0.22 : 0.09)
}

/** 알이 아직 보이나 */
export function hatchEggVisible(frame: number, beats: HatchBeats): boolean {
  return frame < beats.hide
}

/** 알이 사라진 뒤 화면을 덮는 흰 막 (0~1) */
export function hatchVeil(frame: number, beats: HatchBeats): number {
  const from = beats.hide + AFTER
  if (frame < from) return 0
  return Math.min(1, (frame - from) / FADE)
}
