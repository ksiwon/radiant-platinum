import type { EvolutionPhase, HatchPhase, TradePhase } from '../state/cinematicStore'
import {
  EVO_CLAMP_FRAMES, evolutionBodyWhite, evolutionScales, type EvolutionBeats,
} from '../engine/pokemon/evolutionBeat'
import { hatchEggVisible, hatchShake, type HatchBeats } from '../engine/pokemon/hatchBeat'

interface EvolutionPose {
  beforeVisible: boolean
  afterVisible: boolean
  beforeScale: number
  afterScale: number
  /** 두 몸이 얼마나 하얗게 지워졌나 (0~1) */
  white: number
  light: number
}

/**
 * 진화 무대의 자세 (`evolution.c`의 `Evolution_Main`).
 *
 * ⚠️ **여기 숫자는 하나도 우리 것이 아니다.** 크기 곡선도 흰색도 마디도 다
 * `engine/pokemon/evolutionBeat`이 롬 자료에서 뽑는다 — 한동안 이 자리가
 * `Math.sin(elapsed × π × 3.6)`이었는데 원작은 사인파가 아니라 **왕복마다 배로
 * 빨라지는 선형**이다(32·32·16·16·8·8·4…). 그리고 길이가 2,200ms로 굳어 있어
 * 교대가 원작 242프레임의 55%에서 잘렸다.
 *
 * @param frame 장면이 시작하고 몇 프레임째인가 (60Hz)
 */
export function evolutionPose(
  phase: EvolutionPhase, frame: number, beats: EvolutionBeats,
): EvolutionPose {
  if (phase === 'canceled') {
    // 원작이 크기를 (1, 0)으로 되돌리고 새 몸을 숨긴다 (`CANCEL_EVOLUTION`)
    return {
      beforeVisible: true, afterVisible: false,
      beforeScale: 1, afterScale: 0, white: 0, light: 0.12,
    }
  }
  // 교대가 끝나면 원작이 크기를 (0, 1)로 딱 앉힌다 — 흔들리다 멈추지 않는다
  if (phase === 'done' || frame >= beats.swap) {
    const white = evolutionBodyWhite(frame, beats)
    return {
      beforeVisible: false, afterVisible: true,
      beforeScale: 0, afterScale: 1, white,
      // 흰 막이 설 때 무대도 같이 밝아진다
      light: 0.45 + white * 1.2,
    }
  }
  const scales = evolutionScales(Math.max(0, frame - EVO_CLAMP_FRAMES))
  return {
    // 원작은 둘 다 세워 두고 크기로만 주고받는다 — 크기가 0이면 안 보인다
    beforeVisible: scales.before > 0,
    afterVisible: scales.after > 0,
    beforeScale: scales.before,
    afterScale: scales.after,
    white: evolutionBodyWhite(frame, beats),
    light: 0.35 + evolutionBodyWhite(frame, beats) * 1.3,
  }
}

interface HatchPose { rock: number; lift: number; shellVisible: boolean }

/**
 * 알이 흔들리는 자세 (`cutscenes/egg_hatch`).
 *
 * ⚠️ **여기 박자는 원작 것이다.** 흔들림 한 벌이 열 프레임이고 여섯째에 조각이
 * 떨어진다 — 스물다섯 프레임을 가만히 있다가 잔 흔들림 둘, 큰 흔들림 둘이다
 * (`engine/pokemon/hatchBeat`). 한동안 `Math.sin(elapsed × 11)`이었다.
 *
 * ⚠️ **흔드는 폭만 우리 것이다** — 원작은 2D 스프라이트를 픽셀로 밀고 아핀으로
 * 누르는데 우리 알은 3D라 옮길 좌표가 없다
 *
 * @param frame 장면이 시작하고 몇 프레임째인가 (60Hz)
 */
export function hatchPose(phase: HatchPhase, frame: number, beats: HatchBeats): HatchPose {
  if (phase === 'born') return { rock: 0, lift: 0, shellVisible: false }
  return {
    rock: hatchShake(frame, beats),
    // 흔들릴 때 살짝 뜬다 — 원작이 아핀으로 누르는 자리다
    lift: Math.abs(hatchShake(frame, beats)) * 0.22,
    shellVisible: hatchEggVisible(frame, beats),
  }
}

interface TradePose {
  sendingVisible: boolean
  receivingVisible: boolean
  /** 무대 위 높이. 보내는 마리는 올라가고 받는 마리는 내려앉는다 */
  lift: number
  scale: number
  light: number
}

/**
 * 교환 세 마디의 자세.
 *
 * ⚠️ **여기 숫자는 우리 것이다.** 원작의 대응물은 2D 통신관 애니메이션이라
 * 옮길 좌표가 없다 — 지킨 것은 **마디의 차례와 길이**고(글 두 줄 사이가
 * 60프레임, `overlay095`), 오르내리는 폭은 무대 크기에 맞춰 정했다
 */
export function tradePose(phase: TradePhase, elapsed: number): TradePose {
  if (phase === 'transit') {
    return { sendingVisible: false, receivingVisible: false, lift: 0, scale: 1, light: 2.4 }
  }
  if (phase === 'arriving') {
    // 위에서 내려앉으며 커진다. 0.6초면 제자리다
    const t = Math.min(1, elapsed / 0.6)
    return {
      sendingVisible: false, receivingVisible: true,
      lift: (1 - t) * 2.6, scale: 0.45 + t * 0.55, light: 1.6 - t * 1.1,
    }
  }
  // 보내는 마리. 글 두 줄을 읽는 동안은 가만히 서 있고 마지막에 떠오른다
  const t = Math.max(0, elapsed - TRADE_SENDING_HOLD)
  return {
    sendingVisible: true, receivingVisible: false,
    lift: t * t * 3.4, scale: Math.max(0.2, 1 - t * 0.7), light: 0.45 + t * 1.6,
  }
}

/** 보내는 마리가 떠오르기 전까지 서 있는 시간(초) */
const TRADE_SENDING_HOLD = 1.6

/** 아주 큰 포켓몬도 화면을 넘지 않게 하되 작은 종을 과장하지 않는다. */
export function cinematicScale(tall: number): number {
  if (!Number.isFinite(tall) || tall <= 0) return 1
  return Math.min(1.65, 2.45 / tall)
}
