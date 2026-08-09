// 배틀 가방 (PLAN §7.8 · DATA.md §2.12)
//
// 필드 가방과 갈래가 다르다. 원작은 배틀에서 **`battlePocket` 비트마스크**로
// 다시 나눈다 — 도구 하나가 여러 갈래에 걸릴 수 있다(회복약은 HP와 상태 둘 다다).
//
// ⚠️ **주머니는 넷이다.** 다섯이 아니다 — 비트는 다섯인데 화면 갈래는 넷이고,
// PP 도구는 회복 칸에 같이 들어간다 (`battle_bag_utils.c`의 `sBattlePocketIndexes`
// 가 PP 비트를 `RECOVER_HP_PP`로 보낸다).
//
// 무엇을 고른 다음에 무엇이 뜨는지도 주머니가 정한다 (`battle_bag.c`의 `TryUseItem`):
//
//   배틀용 → 나와 있는 한 마리에게 **그 자리에서** 먹인다 (대상을 안 묻는다)
//   볼     → 던진다
//   회복·상태·PP → **파티 화면**을 연다. 그중 한 칸짜리 PP 도구만 기술까지 묻는다
//
// 못 쓰는 도구를 미리 잠그지 않는다. 원작도 고르게 두고, 아무 일도 안 일어나면
// 그제서야 "효과가 없을 것 같다"를 띄우고 턴을 안 쓴다 — 우리는 대상 칸에서
// 그것을 미리 보여 준다(`planFor`가 화면과 규칙 양쪽의 정본이다).
import { useEffect, useMemo, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, loadMoveNames,
  type ItemTable,
} from '../../data/gameData'
import type { ItemIcons } from '../../data/schema'
import type { PartySlot } from '../../engine/battle/choice'
import { BATTLE_POCKET, isEscapeItem, needsMoveSlot, needsTarget, type ItemPlan }
  from '../../engine/battle/meta/bagItem'
import { Ball, type BallId } from '../../engine/battle/meta/capture'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useBattleStore, type RosterEntry } from '../../state/battleStore'
import { clampCursor, useMenuKeys, wrapCursor } from '../menu/useMenuKeys'
import { itemIcon } from '../menu/itemIcon'
import type { BattleNames } from './messages'
import { PartyCards, type PartyCard } from './PartyCards'
import * as css from './battleBag.css'

/** 목록의 아이콘. 줄 높이를 안 넘는다 */
const LIST_ICON = 28
/** 설명칸의 아이콘. 이 화면에서 제일 큰 그림이어야 한다 */
const BIG_ICON = 72

/**
 * 한 쪽에 놓는 개수. `BATTLE_POCKET_ITEMS_PER_PAGE` 그대로다.
 *
 * 주머니 하나는 최대 36칸(`BATTLE_POCKET_SIZE`)이라 여섯 쪽까지 나온다
 */
const PER_PAGE = 6

/** `enum BattlePocketIndex` — 이 순서가 원작 배틀 가방의 탭 순서다 */
const CATEGORY = [
  { name: '회복', mask: BATTLE_POCKET.hp | BATTLE_POCKET.pp },
  { name: '상태', mask: BATTLE_POCKET.status },
  { name: '볼', mask: BATTLE_POCKET.ball },
  { name: '배틀용', mask: BATTLE_POCKET.battle },
] as const

/** 볼 번호는 도구 번호와 같다 (`capture.ts`의 Ball) */
const BALL_IDS = new Set<number>(Object.values(Ball))

const STATUS_NOUN: Record<string, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}
const STAT_NOUN: Record<string, string> = {
  atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어',
  spe: '스피드', accuracy: '명중률', evasion: '회피율',
}

/** 지금 어느 단인가. 원작의 화면 전환과 같은 셋이다 */
type Step = 'item' | 'target' | 'move'

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  moves: string[]
}

interface Props {
  /** 야생전이 아니면 볼도 도망 도구도 못 쓴다 */
  wild: boolean
  party: readonly PartySlot[]
  roster: Record<string, RosterEntry>
  /** 종족 이름. 별명이 없는 애를 부를 때 쓴다 */
  names: BattleNames | null
  onThrow: (ball: BallId) => void
  onUse: (item: number, key: string, moveSlot?: number) => void
  onBack: () => void
}

/** 계획 하나를 사람이 읽을 한 줄로. 대상 카드 옆에 그대로 붙는다 */
function planSummary(plan: ItemPlan): string {
  const parts: string[] = []
  if (plan.revive) parts.push('되살아난다')
  if (plan.heal > 0) parts.push(`체력 ${String(plan.heal)} 회복`)
  for (const s of plan.cure) parts.push(`${STATUS_NOUN[s] ?? s} 낫는다`)
  for (const v of plan.clear) parts.push(v === 'confusion' ? '혼란이 풀린다' : '헤롱헤롱이 풀린다')
  if (plan.mist) parts.push('능력이 안 떨어진다')
  for (const b of plan.boosts) parts.push(`${STAT_NOUN[b] ?? b} 올라간다`)
  if (plan.focusEnergy) parts.push('급소에 잘 맞는다')
  const pp = plan.pp.reduce((sum, one) => sum + one.amount, 0)
  if (pp > 0) parts.push(`PP ${String(pp)} 회복`)
  return parts.join(' · ')
}

export function BattleBag({ wild, party, roster, names, onThrow, onUse, onBack }: Props) {
  const [data, setData] = useState<Loaded | null>(null)
  // 원작도 회복 칸에서 시작한다 (`bag.c`의 `BagCursor_SetBattleCurrentCategory`)
  const [tab, setTab] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [step, setStep] = useState<Step>('item')
  const [target, setTarget] = useState(0)
  const [slot, setSlot] = useState(0)
  const bag = useSaveStore((s) => s.bag)
  const plan = useBattleStore((s) => s.plan)
  const moveSlotsOf = useBattleStore((s) => s.moveSlotsOf)
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadMoveNames(locale),
    ])
      .then(([items, itemNames, descriptions, icons, moves]) => {
        if (alive) setData({ items, names: itemNames, descriptions, icons, moves })
      })
      .catch(() => { /* 빈 목록 */ })
    return () => { alive = false }
  }, [locale])

  // 갈래는 주머니가 아니라 비트마스크다. 가방 전체를 훑어 걸리는 것만 모은다
  const mask = CATEGORY[tab]?.mask ?? 0
  const list = useMemo(
    () => bag.flat().filter((s) => ((data?.items.all[s.item]?.battlePocket ?? 0) & mask) !== 0),
    [bag, data, mask],
  )
  const at = Math.min(cursor, Math.max(0, list.length - 1))
  const chosen = list[at]
  const item = chosen && data ? data.items.get(chosen.item) : null
  const page = Math.floor(at / PER_PAGE)
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const shown = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  const isBall = chosen !== undefined && BALL_IDS.has(chosen.item)
  const escapes = item !== null && isEscapeItem(item)
  /** 그 도구를 지금 이 배틀에서 고를 수 있는가. 이유는 아래 `why`가 말한다 */
  const pickable = !isBall && !escapes ? true : wild

  const slots = useMemo(
    () => (step === 'move' ? moveSlotsOf(party[target]?.key ?? '') : []),
    [step, target, party, moveSlotsOf],
  )

  /** 이 마리에게 쓰면 무슨 일이 일어나는가. 못 쓰면 null */
  const planAt = (i: number, moveSlot?: number): ItemPlan | null => {
    const key = party[i]?.key
    if (chosen === undefined || key === undefined) return null
    return plan(chosen.item, key, moveSlot)
  }

  /**
   * 그 마리를 고를 수 있는가. 고를 수 있으면 무슨 일이 일어나는지까지.
   *
   * ⚠️ **기술 칸을 묻는 도구는 칸 하나로 재면 안 된다.** PP에이드는 어느 한 칸이라도
   * 채울 데가 있으면 쓸 수 있는데, 0번 칸만 보고 잠그면 1번이 비어 있어도 못 고른다
   */
  const planForCard = (i: number): ItemPlan | null => {
    if (step === 'move') return planAt(i, slot)
    if (item === null || !needsMoveSlot(item)) return planAt(i)
    const key = party[i]?.key
    const n = key === undefined ? 0 : moveSlotsOf(key).length
    for (let s = 0; s < n; s++) {
      const made = planAt(i, s)
      if (made) return made
    }
    return null
  }

  /** 도구 하나를 확정한다. 여기부터는 되돌릴 수 없다 */
  const commit = (i: number, moveSlot?: number): void => {
    const key = party[i]?.key
    if (chosen === undefined || key === undefined) return
    onUse(chosen.item, key, moveSlot)
  }

  const pickItem = (): void => {
    if (chosen === undefined || item === null || !pickable) return
    if (isBall) { onThrow(chosen.item as BallId); return }
    // 배틀용·도망 도구는 대상을 안 묻는다. 나와 있는 한 마리에게 바로 간다
    if (!needsTarget(item)) {
      const out = party.findIndex((p) => p.active)
      if (escapes) { onUse(chosen.item, party[out]?.key ?? '') } else if (out >= 0) commit(out)
      return
    }
    setTarget(Math.max(0, party.findIndex((p) => p.active)))
    setStep('target')
  }

  const pickTarget = (): void => {
    if (item === null || !planForCard(target)) return
    if (needsMoveSlot(item)) { setSlot(0); setStep('move'); return }
    commit(target)
  }

  useMenuKeys(
    step === 'item' ? {
      up: () => { setCursor((c) => clampCursor(c, -1, list.length)) },
      down: () => { setCursor((c) => clampCursor(c, 1, list.length)) },
      left: () => { setTab((t) => wrapCursor(t, -1, CATEGORY.length)); setCursor(0) },
      right: () => { setTab((t) => wrapCursor(t, 1, CATEGORY.length)); setCursor(0) },
      confirm: pickItem,
      cancel: onBack,
    } : step === 'target' ? {
      up: () => { setTarget((t) => clampCursor(t, -1, party.length)) },
      down: () => { setTarget((t) => clampCursor(t, 1, party.length)) },
      confirm: pickTarget,
      cancel: () => { setStep('item') },
    } : {
      up: () => { setSlot((s) => clampCursor(s, -1, slots.length)) },
      down: () => { setSlot((s) => clampCursor(s, 1, slots.length)) },
      confirm: () => { if (planAt(target, slot)) commit(target, slot) },
      cancel: () => { setStep('target') },
    },
  )

  // ── 누구에게 ──────────────────────────────────────────────────────────────
  if (item !== null && (step === 'target' || step === 'move')) {
    const cards = party.map((one, i): PartyCard => {
      const it = roster[one.key]
      const made = planForCard(i)
      return {
        slot: one,
        label: it?.nickname ?? (it ? names?.species[it.species] : null) ?? one.key,
        level: it?.level ?? '?',
        can: made !== null,
        note: made === null ? null : planSummary(made),
      }
    })
    const here = cards[target]
    return (
      <div className={css.sheet}>
        <PartyCards
          cards={cards} cursor={target}
          onHover={setTarget}
          onPick={(i) => { setTarget(i); if (step === 'target') pickTarget() }}
        />
        <div className={css.detail}>
          <div className={`${css.banner} ${here?.can ? css.bannerKind.ok : css.bannerKind.none}`}>
            {/* `BattleParty_Text_ItemWontHaveAnyEffect` */}
            {here?.can ? here.note : '이 도구로는 효과가 없을 것 같다'}
          </div>
          <div className={css.hero}>
            <span
              className={css.icon}
              style={itemIcon(data?.icons, chosen?.item ?? 0, BIG_ICON)}
              aria-hidden
            />
            <span>
              <div className={css.heroName}>{data?.names[chosen?.item ?? 0] ?? ''}</div>
              <div className={css.heroSub}>{here?.label ?? ''}에게 쓴다</div>
            </span>
          </div>
          {step === 'move' && (
            <div className={css.moves}>
              {slots.map((m, i) => {
                const full = m.pp >= m.maxPp
                return (
                  <button
                    key={`${String(m.move)}-${String(i)}`}
                    className={`${css.move} ${i === slot ? css.moveOn : ''}`}
                    onPointerEnter={() => { setSlot(i) }}
                    onClick={() => { setSlot(i); if (planAt(target, i)) commit(target, i) }}
                    disabled={full}
                  >
                    <span>{(m.move !== null ? data?.moves[m.move] : null) ?? '―'}</span>
                    <span className={css.pp}>{m.pp}/{m.maxPp}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className={css.foot}>
          {step === 'move' ? '↑↓ 기술 · Z 결정 · X 뒤로' : '↑↓ 고르기 · Z 결정 · X 뒤로'}
        </div>
      </div>
    )
  }

  // ── 무엇을 쓸까 ───────────────────────────────────────────────────────────
  const why = !pickable
    ? (isBall ? '트레이너의 포켓몬에게는 못 쓴다' : '지금은 그럴 때가 아니다')
    : null
  return (
    <div className={css.sheet}>
      <div className={css.left}>
        <div className={css.tabs}>
          {CATEGORY.map((c, i) => (
            <button
              key={c.name}
              className={i === tab ? css.tab.on : css.tab.off}
              onPointerDown={() => { setTab(i); setCursor(0) }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className={css.list}>
          {list.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {shown.map((one, i) => {
            const index = page * PER_PAGE + i
            return (
              <button
                key={one.item}
                className={`${css.row} ${index === at ? css.rowOn : ''}`}
                onPointerEnter={() => { setCursor(index) }}
                onClick={() => { setCursor(index); pickItem() }}
              >
                <span
                  className={css.icon}
                  style={itemIcon(data?.icons, one.item, LIST_ICON)}
                  aria-hidden
                />
                <span className={css.label}>{data?.names[one.item] ?? ''}</span>
                <span className={css.count}>×{one.count}</span>
              </button>
            )
          })}
        </div>
        {list.length > PER_PAGE && (
          <div className={css.pager}>
            <span>{page + 1} / {pages}쪽</span>
            <span>{list.length}종</span>
          </div>
        )}
      </div>

      {chosen && (
        <div className={css.detail}>
          <div className={`${css.banner} ${why ? css.bannerKind.none : css.bannerKind.ok}`}>
            {why ?? (isBall ? '던져서 잡는다'
              : escapes ? '반드시 도망칠 수 있다'
                : item && !needsTarget(item) ? '나와 있는 포켓몬에게 쓴다' : '누구에게 쓸지 고른다')}
          </div>
          <div className={css.hero}>
            <span
              className={css.icon}
              style={itemIcon(data?.icons, chosen.item, BIG_ICON)}
              aria-hidden
            />
            <span>
              <div className={css.heroName}>{data?.names[chosen.item] ?? ''}</div>
              <div className={css.heroSub}>{chosen.count}개 남았다</div>
            </span>
          </div>
          <div className={css.text}>{data?.descriptions[chosen.item] ?? ''}</div>
        </div>
      )}
      <div className={css.foot}>←→ 주머니 · ↑↓ 고르기 · Z 결정 · X 뒤로</div>
    </div>
  )
}
