// 우유마시기 · 알낳기 — 파티 화면에서 체력을 나눠 준다 (`party_menu/main.c`의 `PartyMenu_UseHPTransferFieldMove`)
//
//   PartyMenu_StartFieldMoveHPTransfer  줄 몫은 **쓰는 마리의 최대 체력 ÷ 5**(정수)다. 지금 체력이 그 몫
//                                       **이하**면 「HP가 모자란다」(뱅크 453의 138)로 끝난다
//   CheckCanUseHPTransferFieldMove      알이면 삑(`SEQ_SE_DP_CUSTOM06`)만 · 자기 자신 · 쓰러진 마리 · 가득 찬
//                                       마리는 「그 포켓몬에게는 쓸 수 없습니다」(131)
//   HP_TRANSFER_STATE_DONATE_HP         받을 마리가 덜 비었으면 몫을 **빈 만큼으로** 줄이고, 쓰는 마리를 한
//                                       프레임에 1씩 깎는다 → 받는 마리를 한 프레임에 1씩 채운다
//   HP_TRANSFER_STATE_RECEIVE_HP        다 채우면 「○○의 HP가 n 회복되었다」(64)와 노트

/** 파티 화면이 보는 한 마리 */
interface HpSlot {
  hp: number
  maxHp: number
  isEgg: boolean
}

/** 줄 몫. 모자라면 null (`PartyMenu_Text_NotEnoughHP`) */
export function hpTransferAmount(donor: HpSlot): number | null {
  const amount = Math.trunc(donor.maxHp / 5)
  return donor.hp <= amount ? null : amount
}

/** 받을 마리를 골랐다 — 알 · 못 받음 · 받음 (`CheckCanUseHPTransferFieldMove`) */
export function hpTransferTarget(
  donorSlot: number, targetSlot: number, target: HpSlot,
): 'egg' | 'invalid' | 'ok' {
  if (target.isEgg) return 'egg'
  if (targetSlot === donorSlot || target.hp === 0 || target.hp === target.maxHp) return 'invalid'
  return 'ok'
}

/** 실제로 옮겨 갈 양 — 받는 마리가 빈 만큼보다 많이 주지 않는다 */
export function hpTransferGiven(amount: number, target: HpSlot): number {
  return Math.min(amount, target.maxHp - target.hp)
}

/** 원작 소리 — 받는 마리를 고를 때와 다 줬을 때 `SEQ_SE_DP_KAIFUKU` · 알을 고르면 `SEQ_SE_DP_CUSTOM06` */
export const HP_TRANSFER_SE = { heal: 1516, buzz: 1522 } as const
