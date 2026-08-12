// 기술을 고르기 **전에** 보이는 상성 (PARITY §2.22)
//
// ⚠️ **이건 플래티넘에 없다.** 두 화면짜리 DS에서는 아래 화면이 기술 넷과 PP로
// 꽉 차 있어서 넣을 자리가 없었다 — 7세대에서 처음 붙었고 BDSP가 그대로 들고
// 있다. 우리는 화면이 하나이므로 BDSP 쪽을 따른다.
//
// 판정 자체는 여기서 안 한다. 실제 배틀은 @pkmn/sim이 재고, 여기 있는 것은
// **명령을 고르는 동안 보여 줄 어림**이다. 그래서 sim을 안 부른다 — 기술 칸
// 네 개를 그리자고 심판을 돌릴 수는 없다.
import { effectivenessOf } from './ai/typeChart'
import type { Move, Stats } from '../../data/schema'

/** 화면에 뜨는 네 가지. 1배는 아무 말도 안 한다 */
export type MoveMatch = 'super' | 'resisted' | 'immune'

/** 잠재파워 (`BtlCmd_CalcHiddenPowerParams`). 개체값 여섯의 **끝자리**만 본다 */
const MOVE_HIDDEN_POWER = 237
/** 발버둥은 타입이 없다 — 4세대에서는 상성을 아예 안 탄다 */
const MOVE_STRUGGLE = 165

/**
 * 잠재파워의 타입. 0~15가 노말과 ???를 뺀 열여섯 타입에 그대로 얹힌다.
 *
 * 자릿수 차례가 HP·공격·방어·**스피드**·특공·특방이다 — 능력치를 적는 흔한
 * 차례(특공이 스피드보다 앞)와 달라서, 그대로 옮겨 적으면 얼음이 전기로 나온다
 */
export function hiddenPowerType(ivs: Stats): number {
  const bit = (v: number, at: number): number => (v & 1) << at
  const n = bit(ivs.hp, 0) + bit(ivs.atk, 1) + bit(ivs.def, 2)
    + bit(ivs.spe, 3) + bit(ivs.spa, 4) + bit(ivs.spd, 5)
  const at = Math.floor((n * 15) / 63)
  // 롬 타입 번호에는 9번(???)이 끼어 있다. 여덟째부터 한 칸 건너뛴다
  return at < 8 ? at + 1 : at + 2
}

/**
 * 그 기술이 **화면에 어떤 타입으로 보이는가**.
 *
 * 지금 갈라지는 것은 잠재파워 하나다. 날씨공·자연의은혜·심판처럼 그 자리의
 * 무엇을 더 봐야 하는 기술은 적힌 타입 그대로 둔다 — 원작 데이터의 타입이고,
 * 틀린 값이 아니라 **아직 안 접은 값**이다
 */
export function shownType(move: Move, ivs: Stats | null): number {
  if (move.id === MOVE_HIDDEN_POWER && ivs) return hiddenPowerType(ivs)
  return move.type
}

/**
 * 지금 이 기술을 저 상대에게 쓰면 어떤가. 1배거나 보여 줄 수 없으면 null.
 *
 * `known`이 거짓이면 아무것도 안 돌려준다 — BDSP는 **잡았거나 쓰러뜨려 본**
 * 종에게만 알려 준다. 처음 보는 포켓몬의 약점을 공짜로 주지 않는다
 */
export function moveMatch(
  move: Move | undefined,
  defenderTypes: readonly number[] | null,
  ivs: Stats | null,
  known: boolean,
): MoveMatch | null {
  if (!move || !defenderTypes || !known) return null
  // 변화 기술은 상성을 안 탄다. 원작도 저 칸을 비운다
  if (move.category === 'status') return null
  if (move.id === MOVE_STRUGGLE) return null
  const mult = effectivenessOf(shownType(move, ivs), defenderTypes)
  if (mult === 0) return 'immune'
  if (mult > 1) return 'super'
  if (mult < 1) return 'resisted'
  return null
}

/** 기술 칸 밑에 적히는 말. BDSP 한국어판 그대로다 */
export const MATCH_LABEL: Record<MoveMatch, string> = {
  super: '효과가 굉장함',
  resisted: '효과가 별로임',
  immune: '효과가 없음',
}
