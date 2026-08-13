import type { EvolutionPhase, HatchPhase } from '../state/cinematicStore'

export interface EvolutionPose {
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

export interface HatchPose { rock: number; lift: number; shellVisible: boolean }

export function hatchPose(phase: HatchPhase, elapsed: number): HatchPose {
  if (phase === 'born') return { rock: 0, lift: 0, shellVisible: false }
  const beat = Math.sin(elapsed * 11)
  return {
    rock: beat * 0.13 * (0.55 + 0.45 * Math.sin(elapsed * 2.8) ** 2),
    lift: Math.max(0, Math.sin(elapsed * 5.5)) * 0.08,
    shellVisible: true,
  }
}

/** 아주 큰 포켓몬도 화면을 넘지 않게 하되 작은 종을 과장하지 않는다. */
export function cinematicScale(tall: number): number {
  if (!Number.isFinite(tall) || tall <= 0) return 1
  return Math.min(1.65, 2.45 / tall)
}
