// 트레이너가 쓰는 도구 (PLAN §7.7) — `TrainerAI_ShouldUseItem`을 그대로 옮긴다.
//
// **개수는 우리가 안 정한다.** 롬의 트레이너 기록이 도구 칸 넷을 들고 있고
// (`trainers.json`의 `items`), 928명 중 88명이 채워져 있다. 라이벌은 상처약,
// 관장은 좋은상처약, 사천왕·챔피언은 회복약 — 그 수도 그 종류도 자료에 적혀 있다.
//
// 언제 쓰는지가 이 파일이다. 원본은 `src/battle/trainer_ai/trainer_ai.c`의
// `TrainerAI_ShouldUseItem`이고, 문턱값(¼)과 칸 잠금 규칙을 손대지 않았다.
//
// sim을 import 하지 않는다 — 숫자와 상태만 보고 판단한다.
import type { Item } from '../../../data/schema'
import type { Status } from '../../pokemon/instance'

/** 트레이너 하나가 들 수 있는 도구 칸. `MAX_TRAINER_ITEMS` */
const MAX_TRAINER_ITEMS = 4

/**
 * 무엇을 쓰기로 했는가 (`ITEM_AI_CATEGORY_*`).
 *
 * `kind`는 **조건이 걸린 칸**이 정하고 `item`은 **마지막으로 지운 칸**이 정한다.
 * 원본이 그 둘을 따로 들고 있어서다 (`decide` 참조)
 */
interface ItemUse {
  /** 회복약 · 상처약 계열 · 상태이상 치료 */
  kind: 'fullRestore' | 'hp' | 'status'
  item: number
}

/** 판단에 필요한 지금 상태. 나와 있는 한 마리 것이다 */
export interface ItemTarget {
  hp: number
  maxHp: number
  status: Status
  confused: boolean
}

/** `ITEM_PARAM_HP_RESTORE` — 체력을 채우는 도구인가 */
function healsHp(item: Item): boolean {
  return (item.param?.hpRestore ?? 0) !== 0
}

/** 그 상태이상을 푸는 도구인가. 없는 칸은 0이라 안 푼다 */
function cures(item: Item, target: ItemTarget): boolean {
  const p = item.param
  if (!p) return false
  if (p.healSleep && target.status === 'slp') return true
  if (p.healPoison && (target.status === 'psn' || target.status === 'tox')) return true
  if (p.healBurn && target.status === 'brn') return true
  if (p.healFreeze && target.status === 'frz') return true
  if (p.healParalysis && target.status === 'par') return true
  return Boolean(p.healConfusion) && target.confused
}

/** 회복약. 도구 번호가 아니라 자료로 가른다 — 다 채우고 다 푸는 것이 그 표시다 */
function isFullRestore(item: Item): boolean {
  return item.constant === 'ITEM_FULL_RESTORE'
}

/**
 * 트레이너 하나가 이번 배틀에서 들고 있는 도구.
 *
 * 쓴 칸은 0으로 지운다 — 그래서 **같은 도구를 배틀당 적힌 개수만큼만** 쓴다.
 * 챔피언이 회복약을 넷 들고 있으면 네 번이고, 그 이상은 없다
 */
export class TrainerItems {
  private readonly slots: number[]
  /** 자료에 적힌 칸 수. 잠금 규칙이 이 값을 본다 — 쓴 뒤에도 안 줄어든다 */
  private readonly count: number
  private readonly table: { get(id: number): Item }

  constructor(items: readonly number[], table: { get(id: number): Item }) {
    this.slots = [...items.slice(0, MAX_TRAINER_ITEMS)]
    this.count = this.slots.filter((i) => i !== 0).length
    this.table = table
  }

  /** 아직 안 쓴 것이 남았는가 */
  get left(): number {
    return this.slots.filter((i) => i !== 0).length
  }

  /**
   * 이번 턴에 도구를 쓸 것인가. 쓰기로 하면 그 칸을 지우고 무엇을 쓸지 돌려준다.
   *
   * ⚠️ **칸마다 잠금이 다르다.** 원본의 `i == 0 || aliveMons <= count - i + 1`은
   * "뒤 칸일수록 남은 마리가 적어야 열린다"는 뜻이다 — 회복약 넷을 든 챔피언은
   * 첫 개는 언제든 쓰지만 넷째는 두 마리 남았을 때부터 쓴다. 이게 없으면
   * 첫 마리에서 네 개를 다 쏟아붓는다.
   *
   * ⚠️ **찾자마자 안 멈춘다.** 원본도 네 칸을 끝까지 돈다. 그래서 앞 칸이
   * 걸린 뒤에 열린 칸이 또 있으면 그 칸까지 같이 지워지고 **뒤엣것을 쓴다**.
   * 원작 그대로다 — 고치면 관장이 자료보다 더 오래 버틴다
   */
  decide(target: ItemTarget, aliveMons: number): ItemUse | null {
    if (target.hp <= 0) return null
    // 원본의 `usedItemType`과 `usedItem`이다. **따로 움직인다** — 아래 참조
    let kind: ItemUse['kind'] | null = null
    let id = 0

    for (let i = 0; i < MAX_TRAINER_ITEMS; i++) {
      if (i !== 0 && aliveMons > this.count - i + 1) continue
      const here = this.slots[i] ?? 0
      if (here === 0) continue
      const item = this.table.get(here)
      const quarter = Math.floor(target.maxHp / 4)

      if (isFullRestore(item)) {
        // 체력이 ¼ 아래일 때만. 상태이상만 보고는 안 쓴다 (원본이 그렇다)
        if (target.hp < quarter) kind = 'fullRestore'
      } else if (healsHp(item)) {
        const fill = item.param?.hpRestored ?? 0
        // ¼ 아래이거나, 깎인 양이 이 도구가 채울 양보다 많으면 — 즉 버려지는 게
        // 없으면 쓴다. 상처약 스무 칸짜리를 스무 칸 넘게 깎였을 때 쓰는 것이다
        if (fill !== 0 && (target.hp < quarter || target.maxHp - target.hp > fill)) kind = 'hp'
      } else if (cures(item, target)) {
        kind = 'status'
      }

      // 원본의 `if (result == TRUE)`는 루프 **안**에 있고 `result`는 앞 칸에서
      // 세운 값을 그대로 이어받는다. 그래서 앞 칸이 걸린 뒤에 열린 칸이 또
      // 있으면 그 칸도 같이 지워지고 **쓸 도구가 뒤엣것으로 바뀐다**.
      // 4세대 그대로다 — 고치면 챔피언이 자료보다 오래 버틴다
      if (kind !== null) {
        id = here
        this.slots[i] = 0
      }
    }
    return kind === null ? null : { kind, item: id }
  }
}

/**
 * 실제로 채울 양. `hpRestored` 255는 "전부"다 (`ITEM_HP_RESTORE_ALL`).
 *
 * 회복약도 여기로 온다 — 원작 회복약의 `hpRestored`가 255다
 */
export function healAmount(use: ItemUse, target: ItemTarget, item: Item): number {
  if (use.kind === 'status') return 0
  const missing = target.maxHp - target.hp
  if (use.kind === 'fullRestore') return missing
  const fill = item.param?.hpRestored ?? 0
  return fill >= 255 ? missing : Math.min(fill, missing)
}
