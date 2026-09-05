// 비전기술 컷인 (`HMCutIn_StartTask` · `overlay006/hm_cut_in.c`)
//
// 「○○의 파도타기!」 다음에 그 포켓몬이 화면을 가로질러 지나가는 그 연출이다.
// 원작 스크립트가 `PlayHMCutIn`으로 부르고(`scripts_field_moves.s`), 그동안
// 스크립트가 선다 — 그래서 **여기가 몇 프레임인지가 곧 대사와 행동 사이의
// 간격**이다.
//
// ⚠️ **단계와 프레임 수는 원작에서 잰 것이다.** `sCutInTaskFuncs` 열넷이
// 차례로 도는데, 그중 자리와 시간을 정하는 여섯을 옮겼다:
//
//   HMCutIn_WindowExpandY   반높이가 0 → 40px. 늘어나는 몫이 2씩 커지고 32에서
//                           멈춘다 (2·4·6·8·10·12 = 42 ≥ 40 → **6프레임**)
//   HMCutIn_SlideInSpeedUp  `subState >= 15` — **15프레임**을 그냥 선다
//   HMCutIn_SlideMonIn      한 프레임에 64px씩 왼쪽으로. 160px 아래로 내려오면
//                           192px로 되돌려 놓는다
//   HMCutIn_SlideMonToCenter 몫이 절반씩 준다: 32·16·8·4·2·2 = 64px —
//                           192에서 **정확히 128(한가운데)**이다. 여기서 운다
//   HMCutIn_SlideOutSpeedUp `subState >= 8` — **8프레임**을 한가운데 선다
//   HMCutIn_SlideMonOut     몫이 두 배씩 는다 (2·4·8·16·32·64…, 64에서 멈춘다).
//                           −40px 아래로 나가면 끝이다
//   HMCutIn_WindowShrinkY   반높이가 40 → 8px. 몫이 1에서 4씩 큰다
//                           (1·5·9·13 = 28, +17 → **5프레임**)
//
// ⚠️ **가로로 벌어지는 대목(`WindowExpandX`)만 우리 값이다.** 원작은 창의
// 시작 폭을 `HMCutIn_InitWindowAndPlayerSprite`가 정하는데 그 값이 코드에
// 안 드러난다 — 우리 밴드는 어차피 화면 폭을 다 쓰므로 짧게 연다.

/** 원작 화면. 자리 계산이 전부 이 좌표계다 */
const SCREEN_W = 256
const SCREEN_H = 192

/** 밴드가 다 벌어졌을 때의 반높이 (px). `FX32_ONE * (96 ± 40)` */
const BAND_OPEN = 40
/** 닫힌 뒤 남는 반높이 (px). `FX32_ONE * (96 ± 8)` */
const BAND_SHUT = 8

/** 가로로 벌어지는 데 쓰는 프레임. **우리 값이다** (위 머리말) */
const OPEN_X_FRAMES = 4

/** 몸이 화면 밖 오른쪽 어디서 출발하는가 (px). **우리 값이다** */
const START_X = SCREEN_W + 64
/** 여기 아래로 내려오면 되돌려 놓는다 (`128 + 32`) */
const SNAP_AT = SCREEN_W / 2 + 32
/** 되돌려 놓는 자리 (`128 + 64`) */
const SNAP_TO = SCREEN_W / 2 + 64
/** 여기 아래로 나가면 끝이다 (`-40`) */
const GONE_X = -40

type HmCutInPhase =
  'openX' | 'openY' | 'wait' | 'slideIn' | 'toCenter' | 'hold' | 'slideOut' | 'shut' | 'done'

export interface HmCutInState {
  /** 파티 자리 (`PlayHMCutIn`의 인자) */
  readonly slot: number
  phase: HmCutInPhase
  /** 이 단계에서 지난 프레임 */
  step: number
  /** 밴드 반높이 (px) */
  half: number
  /** 밴드가 가로로 벌어진 정도 0~1 */
  wide: number
  /** 몸이 선 자리 (px). 화면 한가운데가 128이다 */
  x: number
  /** 이번 프레임에 옮길 몫 (px). 부호는 왼쪽이 음수다 */
  dx: number
  /** 이 프레임에 울음소리를 낼 것인가. 한 번만 참이다 */
  cry: boolean
}

export function startHmCutIn(slot: number): HmCutInState {
  return {
    slot, phase: 'openX', step: 0,
    half: 0, wide: 0, x: START_X, dx: 0, cry: false,
  }
}

/**
 * 한 프레임 (60Hz).
 *
 * 원작의 각 단계가 프레임마다 한 번 돌던 것을 그대로 옮겼다. 상태를 제자리에서
 * 고치고 끝났는지 돌려준다
 */
export function tickHmCutIn(s: HmCutInState): boolean {
  s.cry = false
  switch (s.phase) {
    case 'openX':
      s.step++
      s.wide = Math.min(1, s.step / OPEN_X_FRAMES)
      // `windowDelta = 0x2000` — 2px에서 시작해 프레임마다 2씩 는다
      if (s.step >= OPEN_X_FRAMES) { s.phase = 'openY'; s.step = 0; s.dx = 2 }
      return false
    case 'openY':
      // `windowY1 -= delta; windowY2 += delta; delta += 0x2000` (32에서 멈춘다)
      s.half = Math.min(BAND_OPEN, s.half + s.dx)
      s.dx = Math.min(32, s.dx + 2)
      if (s.half >= BAND_OPEN) { s.phase = 'wait'; s.step = 0 }
      return false
    case 'wait':
      // `HMCutIn_SlideInSpeedUp` — 열다섯 프레임을 그냥 선다
      s.step++
      if (s.step >= SLIDE_IN_WAIT) { s.phase = 'slideIn'; s.step = 0; s.dx = -64 }
      return false
    case 'slideIn':
      s.x += s.dx
      if (s.x <= SNAP_AT) { s.x = SNAP_TO; s.phase = 'toCenter' }
      return false
    case 'toCenter': {
      // `pokemonSpriteDeltaX /= 2` — 몫이 절반씩 준다. −2를 넘어서면 한가운데다
      s.dx = Math.trunc(s.dx / 2)
      if (s.dx > -2) {
        s.dx = -2
        s.phase = 'hold'
        s.step = 0
        // `Pokemon_PlayCry(cutIn->mon)` — 한가운데 서는 그 프레임이다
        s.cry = true
      }
      s.x += s.dx
      return false
    }
    case 'hold':
      // `HMCutIn_SlideOutSpeedUp` — 여덟 프레임을 한가운데 선다
      s.step++
      if (s.step >= HOLD_FRAMES) { s.phase = 'slideOut'; s.step = 0; s.dx = -1 }
      return false
    case 'slideOut':
      // `pokemonSpriteDeltaX *= 2` (−64에서 멈춘다)
      s.dx = Math.max(-64, s.dx * 2)
      s.x += s.dx
      if (s.x <= GONE_X) { s.phase = 'shut'; s.dx = 1 }
      return false
    case 'shut':
      // `windowY1 += delta; windowY2 -= delta; delta += 0x4000`
      s.half = Math.max(BAND_SHUT, s.half - s.dx)
      s.dx = Math.min(32, s.dx + 4)
      if (s.half <= BAND_SHUT) { s.phase = 'done'; s.half = 0; s.wide = 0 }
      return false
    default:
      return true
  }
}

/** `HMCutIn_SlideInSpeedUp`의 `subState >= 15` */
const SLIDE_IN_WAIT = 15
/** `HMCutIn_SlideOutSpeedUp`의 `subState >= 8` */
const HOLD_FRAMES = 8

/** 밴드가 남기는 가운데 띠의 높이 비율 0~1. 화면 쪽이 이걸로 가린다 */
export function bandFraction(s: HmCutInState): number {
  return (s.half * 2) / SCREEN_H
}

/**
 * 몸이 선 가로 자리를 −1~1로. 0이 한가운데고 1이 오른쪽 끝이다.
 *
 * 화면 폭이 원작과 다르므로 비율로 넘긴다 — 그래야 어느 폭에서도 한가운데에서
 * 울고 양옆으로 사라진다
 */
export function bodyOffset(s: HmCutInState): number {
  return (s.x - SCREEN_W / 2) / (SCREEN_W / 2)
}
