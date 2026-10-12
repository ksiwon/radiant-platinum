// 볼캡슐 씰이 볼이 열릴 때 터뜨리는 입자 (PARITY §4.11) — `battle_anim/ov12_02235E94.c` · `ov12_02237E54.c`
//
// 씰마다 입자계 하나가 선다. 어느 입자인가는 씰 표의 한 칸이고(`SEAL_FX_RES` = `sub_02098188`, `ball.bin`의 멤버 번호),
// 언제 터지는가는 **캡슐에서 그 씰의 자리**가 정한다 — 가운데 (190, 70)에서 멀수록 늦다(`ov12_02237EA0`):
//
//     거리 r = √(dx² + dy²)        r ≥ 56 → 넷째 구간 · 아니면 ⌊(r + 1) / 20⌋ (최대 3)
//     늦춤(프레임) = {0, 8, 14, 20}[구간]
//
// ⚠️ **「고정」 깃발이 선 씰은 자리를 안 본다** (`sub_020981AC` = `SEAL_FX_FIXED`) — 늘 8프레임이다.
// ⚠️ **터지는 자리는** 볼이 열린 곳에서 씰 좌표만큼 떨어진 곳이다 (`ov12_022365D4`): `(x − 190, 70 − y + 30) × 172/4096` DS 단위.
// 가운데 +30은 볼 그림의 가운데를 맞추는 보정이라 우리 몸통 높이 기준으로는 뺀다 (몸통이 이미 가운데다).
import { SEAL_FX_FIXED, SEAL_FX_RES, SEAL_KINDS } from '../../world/sealTables'
import { SLOT_CENTER, type BallSeal } from '../../world/ballCapsule'

/** 시차 표 (`ov12_02237EA0`의 `v5`) */
const DELAY_BY_RING = [0, 8, 14, 20] as const

/** 원작이 좌표 한 칸을 DS 단위로 환산하는 값 (`172 / 4096` — `FX32` 고정소수) */
const FX_PER_PIXEL = 172 / 4096

/** 이 씰이 터뜨리는 입자 (`ball.bin`의 멤버 번호). 번호 밖이면 `null` */
export function sealParticle(type: number): number | null {
  if (type < 1 || type > SEAL_KINDS) return null
  return SEAL_FX_RES[type - 1] ?? null
}

/** 입자가 터지기까지 늦춤(프레임, 60Hz) */
export function sealDelayFrames(seal: BallSeal): number {
  if ((SEAL_FX_FIXED[seal.type - 1] ?? 0) !== 0) return DELAY_BY_RING[1]
  const r = Math.hypot(seal.x - SLOT_CENTER.x, seal.y - SLOT_CENTER.y)
  const ring = r >= 56 ? 3 : Math.min(3, Math.floor((r + 1) / 20))
  return DELAY_BY_RING[ring]
}

/** 볼이 열린 자리에서 얼마나 떨어져 터지는가 — DS 단위 (오른쪽, 위) */
export function sealOffset(seal: BallSeal): readonly [number, number] {
  return [(seal.x - SLOT_CENTER.x) * FX_PER_PIXEL, (SLOT_CENTER.y - seal.y) * FX_PER_PIXEL]
}

/** 터지는 씰만 — 종류가 있고 입자가 있는 것 (`type == 0`은 건너뛴다) */
export function burstSeals(seals: readonly BallSeal[]): BallSeal[] {
  return seals.filter((s) => sealParticle(s.type) !== null)
}
