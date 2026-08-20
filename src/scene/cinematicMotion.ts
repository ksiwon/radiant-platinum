import type { EvolutionPhase, HatchPhase, TradePhase } from '../state/cinematicStore'

interface EvolutionPose {
  beforeVisible: boolean
  afterVisible: boolean
  beforeScale: number
  afterScale: number
  light: number
}

/** 원작의 두 실루엣 교대 수축을 3D 몸 두 벌에 적용한다. */
export function evolutionPose(phase: EvolutionPhase, elapsed: number): EvolutionPose {
  if (phase === 'done') {
    return { beforeVisible: false, afterVisible: true, beforeScale: 0, afterScale: 1, light: 0.45 }
  }
  if (phase === 'canceled') {
    return { beforeVisible: true, afterVisible: false, beforeScale: 1, afterScale: 0, light: 0.12 }
  }
  const wave = (Math.sin(elapsed * Math.PI * 3.6) + 1) / 2
  return {
    beforeVisible: wave < 0.56,
    afterVisible: wave >= 0.44,
    beforeScale: 0.58 + (1 - wave) * 0.42,
    afterScale: 0.58 + wave * 0.42,
    light: 0.35 + wave * 1.3,
  }
}

interface HatchPose { rock: number; lift: number; shellVisible: boolean }

export function hatchPose(phase: HatchPhase, elapsed: number): HatchPose {
  if (phase === 'born') return { rock: 0, lift: 0, shellVisible: false }
  const beat = Math.sin(elapsed * 11)
  return {
    rock: beat * 0.13 * (0.55 + 0.45 * Math.sin(elapsed * 2.8) ** 2),
    lift: Math.max(0, Math.sin(elapsed * 5.5)) * 0.08,
    shellVisible: true,
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
