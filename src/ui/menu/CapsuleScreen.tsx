// PC의 볼캡슐 (PARITY §4.11) — `overlay076/ov76_0223B870.c` · `ov76_0223D338.c`
//
// 캡슐 열둘 가운데 하나를 골라 씰을 붙이고 떼고, 포켓몬에게 달고 떼고, 캡슐끼리 자리를 맞바꾼다.
//
// ⚠️ **끌어 놓기가 없다.** 원작은 터치로 씰을 끌어 놓지만 우리는 칸 여덟(`CAPSULE_SLOTS`)에서 칸을 고르고 목록에서 씰을 고른다.
// 글은 전부 롬이다 — 단추 일곱과 말 열은 `unk_0008` 뱅크, 씰 이름은 뱅크 12, 달기 말은 파티 뱅크다.
//
// ⚠️ **고치는 동안은 사본이다.** 원작도 캡슐을 복사해 놓고 만지다가 「결정」에서만 쓴다 (`BallCapsule_Copy` · `unk_68`) —
// 「취소」는 바꾼 것이 있으면 「그만둘까요?」를 묻는다. 달기 · 떼기 · 맞바꾸기는 한 번에 끝나는 일이라 바로 쓴다.
// ⚠️ **캡슐이 한 마리에 달려 있으면 바꾼 모양이 그 마리에게도 간다** — 결정에서 사본을 새로 맞춘다 (`syncCarriers`).
import { useEffect, useMemo, useState } from 'react'
import { loadDialogueBankOrNull, loadItemNames, loadSpeciesNames } from '../../data/gameData'
import { CAPSULE_TEXT, loadUiText, PARTY_CAPSULE, UI_BANK, YES_NO } from '../../data/uiText'
import {
  attachCapsule, carrierOf, CAPSULE_SLOTS, detachCapsule, hasSeals, placeSeal, removeSeal, sealsOf, swapCapsules,
  syncCarriers, TOTAL_CAPSULES, type BallSeal,
} from '../../engine/world/ballCapsule'
import { SEAL_KINDS } from '../../engine/world/sealTables'
import { ITEM_TABLE } from '../../import/platinum/itemTable'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { ChoiceMenu, type ChoiceItem } from '../common/ChoiceMenu'
import { MessageDock } from '../common/MessageDock'
import { YesNo } from '../common/YesNo'
import { LINE } from '../theme/scale'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './capsuleScreen.css'

/** 캡슐 하나에서 고르는 갈래 (롬 단추의 차례) */
const ACTIONS = ['edit', 'set', 'remove', 'shift', 'quit'] as const
type Action = typeof ACTIONS[number]
const ACTION_LINE: Readonly<Record<Action, number>> = {
  edit: CAPSULE_TEXT.edit, set: CAPSULE_TEXT.set, remove: CAPSULE_TEXT.remove, shift: CAPSULE_TEXT.shift, quit: CAPSULE_TEXT.quit,
}

const ITEM_SEAL_CASE = ITEM_TABLE.findIndex((r) => r[0] === 'ITEM_SEAL_CASE')

/** 화면의 단계 */
type Mode = 'list' | 'menu' | 'party' | 'shift' | 'slots' | 'seals' | 'quitAsk'

/** 칸 여덟 + 결정 · 취소 — 고치는 목록의 줄 수 */
const EDIT_ROWS = CAPSULE_SLOTS.length + 2

/** 3×3 격자에서 칸의 자리 (가운데 (190, 70)에서 30씩) */
function cellOf(slot: number): { gridColumn: number, gridRow: number } {
  const s = CAPSULE_SLOTS[slot]
  return { gridColumn: s ? (s.x - 160) / 30 + 1 : 1, gridRow: s ? (s.y - 40) / 30 + 1 : 1 }
}

export function CapsuleScreen() {
  const back = useMenuStore((s) => s.back)
  const locale = useGameLocale()
  const sealCase = useSaveStore((s) => s.sealCase)
  const capsules = useSaveStore((s) => s.capsules)
  const party = useSaveStore((s) => s.party)
  const [text, setText] = useState<readonly string[]>([])
  const [partyText, setPartyText] = useState<readonly string[]>([])
  const [menuText, setMenuText] = useState<readonly string[]>([])
  const [sealNames, setSealNames] = useState<readonly string[]>([])
  const [titleName, setTitleName] = useState('')
  const [speciesNames, setSpeciesNames] = useState<readonly string[]>([])
  const [mode, setMode] = useState<Mode>('list')
  const [at, setAt] = useState(0)
  const [menuAt, setMenuAt] = useState(0)
  const [slotAt, setSlotAt] = useState(0)
  const [notice, setNotice] = useState('')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  /** 고치는 사본 — 칸 여덟과 그에 맞춘 케이스 */
  const [work, setWork] = useState<{ seals: number[], capsule: BallSeal[], changed: boolean } | null>(null)
  /** 맞바꿀 캡슐을 고르는 동안의 처음 캡슐 */
  const [shiftFrom, setShiftFrom] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([
      loadUiText('capsuleEditor', locale), loadUiText('partyMenu', locale), loadUiText('menuEntries', locale),
      loadDialogueBankOrNull(locale, UI_BANK.ballSealNames), loadItemNames(locale), loadSpeciesNames(locale),
    ])
      .then(([lines, partyLines, menuLines, seals, items, species]) => {
        if (!live) return
        setText(lines)
        setPartyText(partyLines)
        setMenuText(menuLines)
        setSealNames(seals ?? [])
        setTitleName(items[ITEM_SEAL_CASE] ?? '')
        setSpeciesNames(species)
      })
      .catch(() => { /* 글이 없어도 목록은 뜬다 */ })
    return () => { live = false }
  }, [locale])

  const say = (line: number): string => (text[line] ?? '').replace(/[\r\f]/g, '\n')
  const sealName = (type: number): string => sealNames[type] ?? ''
  const monName = (i: number): string => {
    const m = party[i]
    return m === undefined ? '' : m.nickname ?? speciesNames[m.species] ?? ''
  }

  const capsule = capsules[at]
  const shownCapsule: readonly BallSeal[] = mode === 'slots' || mode === 'seals' || mode === 'quitAsk'
    ? work?.capsule ?? capsule ?? []
    : capsule ?? []
  const carrier = carrierOf(party, at)

  /** 칸에 붙일 수 있는 씰 — 고치는 사본의 케이스에 남은 것 */
  const available = useMemo(() => {
    const out: number[] = []
    if (work === null) return out
    for (let id = 1; id <= SEAL_KINDS; id++) if ((work.seals[id - 1] ?? 0) > 0) out.push(id)
    return out
  }, [work])
  const slotFilled = (work?.capsule[slotAt]?.type ?? 0) !== 0

  const startEdit = (): void => {
    if (capsule === undefined) return
    setWork({ seals: [...sealCase], capsule: capsule.map((s) => ({ ...s })), changed: false })
    setSlotAt(0)
    setMode('slots')
    setNotice('')
  }

  /** 사본의 칸 하나를 바꾼다. 케이스 장수도 같이 오르내린다 */
  const edit = (slot: number, type: number): void => {
    if (work === null) return
    const caps = [work.capsule]
    const done = type === 0
      ? removeSeal(work.seals, caps, 0, slot)
      : placeSeal(work.seals, caps, 0, slot, type)
    if (done === null) return
    setWork({ seals: done.seals, capsule: done.capsules[0] ?? work.capsule, changed: true })
  }

  const commit = (): void => {
    if (work === null) return
    const next = capsules.map((c, i) => (i === at ? work.capsule : c))
    useSaveStore.setState({ sealCase: work.seals, capsules: next, party: syncCarriers(party, next) })
    setWork(null)
    setMode('list')
    setNotice(say(CAPSULE_TEXT.finished))
  }

  const leaveEdit = (): void => {
    if (work?.changed === true) { setMode('quitAsk'); return }
    setWork(null)
    setMode('list')
    setNotice('')
  }

  const runAction = (action: Action): void => {
    switch (action) {
      case 'edit': startEdit(); return
      case 'set': setMode('party'); setMenuAt(0); setNotice(''); return
      case 'remove':
        useSaveStore.setState({ party: detachCapsule(party, carrier) })
        setMode('list')
        setNotice(say(CAPSULE_TEXT.removed))
        return
      case 'shift': setShiftFrom(at); setMode('shift'); setMenuAt(at); setNotice(''); return
      case 'quit': setMode('list'); setNotice('')
    }
  }

  const pickParty = (slot: number): void => {
    const mon = party[slot]
    if (mon === undefined) return
    if (mon.capsule !== undefined) { setMode('list'); setNotice(partyText[PARTY_CAPSULE.two] ?? ''); return }
    const next = attachCapsule(party, capsules, at, slot)
    if (next === null) { setMode('list'); return }
    useSaveStore.setState({ party: next })
    setMode('list')
    setNotice(partyText[PARTY_CAPSULE.wasSet] ?? '')
  }

  const pickShift = (to: number): void => {
    setMode('list')
    if (to === shiftFrom) return
    const got = swapCapsules(capsules, party, shiftFrom, to)
    useSaveStore.setState({ capsules: got.capsules, party: got.party })
    setAt(to)
    setNotice(say(CAPSULE_TEXT.switched))
  }

  const confirm = (): void => {
    if (mode === 'list') { setMode('menu'); setMenuAt(0); setNotice(''); return }
    if (mode !== 'slots') return
    if (slotAt === CAPSULE_SLOTS.length) { commit(); return }
    if (slotAt === CAPSULE_SLOTS.length + 1) { leaveEdit(); return }
    if (!slotFilled && available.length === 0) { setNotice(say(CAPSULE_TEXT.noSeals)); return }
    setMode('seals')
    setMenuAt(0)
    setNotice('')
  }

  const cancel = (): void => {
    if (mode === 'list') { back(); return }
    if (mode === 'slots') { leaveEdit(); return }
    setMode('list')
  }

  const move = (d: number): boolean => {
    if (mode === 'list') {
      const next = clampCursor(at, d, TOTAL_CAPSULES)
      if (next === at) return false
      setAt(next)
      setNotice('')
      return true
    }
    if (mode === 'slots') {
      const next = clampCursor(slotAt, d, EDIT_ROWS)
      if (next === slotAt) return false
      setSlotAt(next)
      setNotice('')
      return true
    }
    return false
  }

  const popup = mode !== 'list' && mode !== 'slots'
  useMenuKeys({
    up: () => move(-1),
    down: () => move(1),
    confirm,
    cancel,
  }, !popup)

  const actionItems: ChoiceItem[] = ACTIONS.map((a) => ({
    key: a,
    label: say(ACTION_LINE[a]),
    disabled: (a === 'set' && (carrier >= 0 || !hasSeals(capsule ?? []))) || (a === 'remove' && carrier < 0),
  }))
  const partyItems: ChoiceItem[] = party.map((_, i) => ({ key: String(i), label: monName(i) }))
  const shiftItems: ChoiceItem[] = capsules.map((_, i) => ({ key: String(i), label: String(i + 1) }))
  const sealItems: ChoiceItem[] = [
    ...(slotFilled ? [{ key: 'remove', label: say(CAPSULE_TEXT.remove) }] : []),
    ...available.map((id) => ({ key: String(id), label: `${sealName(id)} ×${String(work?.seals[id - 1] ?? 0)}` })),
  ]
  const pickSeal = (i: number): void => {
    if (slotFilled && i === 0) edit(slotAt, 0)
    else {
      const id = available[i - (slotFilled ? 1 : 0)]
      if (id !== undefined) edit(slotAt, id)
    }
    setMode('slots')
  }

  // 고른 줄이 보이게 — 목록이 창보다 길 수 있다
  useEffect(() => { anchor?.scrollIntoView({ block: 'nearest' }) }, [anchor])

  const dock = ((): string => {
    if (notice !== '') return notice
    switch (mode) {
      case 'list': return say(CAPSULE_TEXT.choose)
      case 'menu': return say(CAPSULE_TEXT.ask)
      case 'shift': return say(CAPSULE_TEXT.shiftWith)
      case 'quitAsk': return say(CAPSULE_TEXT.quitAsk)
      default: return ''
    }
  })()

  const rows = mode === 'slots' || mode === 'seals' || mode === 'quitAsk'
    ? [
      ...shownCapsule.map((s, i) => ({ key: `s${String(i)}`, head: String(i + 1), name: s.type === 0 ? '' : sealName(s.type), aside: '' })),
      { key: 'ok', head: '', name: say(CAPSULE_TEXT.confirm), aside: '' },
      { key: 'no', head: '', name: say(CAPSULE_TEXT.cancel), aside: '' },
    ]
    : capsules.map((c, i) => {
      const who = carrierOf(party, i)
      return {
        key: `c${String(i)}`, head: String(i + 1), name: '',
        aside: `${String(sealsOf(c).length)}/${String(CAPSULE_SLOTS.length)}${who >= 0 ? ` ${monName(who)}` : ''}`,
      }
    })
  const picked = mode === 'slots' || mode === 'seals' || mode === 'quitAsk' ? slotAt : at

  return (
    <MenuScreen
      title={titleName}
      note={mode === 'slots' || mode === 'seals' || mode === 'quitAsk' ? String(at + 1) : ''}
      foot="↑↓ 고르기 · Z 결정 · X 그만둔다"
      message={<MessageDock lines={dock} when={dock !== ''} />}
    >
      <div className={css.body}>
        <div className={css.listBox}>
          <div className={css.scroller}>
            {rows.map((r, i) => (
              <div
                key={r.key}
                ref={i === picked ? setAnchor : undefined}
                className={i === picked ? css.rowPicked : css.row}
                style={{ minHeight: LINE.rowTall }}
              >
                <span>{r.head}</span>
                <span className={css.label}>{r.name}</span>
                <span className={css.aside}>{r.aside}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={css.detail}>
          <div className={css.grid}>
            {CAPSULE_SLOTS.map((_, i) => {
              const type = shownCapsule[i]?.type ?? 0
              const on = (mode === 'slots' || mode === 'seals') && slotAt === i
              return (
                <div key={i} className={on ? css.slotPicked : css.slot} style={cellOf(i)}>
                  {type === 0 ? '' : sealName(type)}
                </div>
              )
            })}
            <div className={css.ball} style={{ gridColumn: 2, gridRow: 2 }}>{carrier >= 0 && mode !== 'slots' ? monName(carrier) : ''}</div>
          </div>
        </div>

        {mode === 'menu' && (
          <ChoiceMenu
            items={actionItems}
            at={menuAt}
            anchor={anchor}
            onAt={setMenuAt}
            onPick={(i) => { const a = ACTIONS[i]; if (a !== undefined) runAction(a) }}
            onCancel={() => { setMode('list') }}
          />
        )}
        {mode === 'party' && (
          <ChoiceMenu
            items={partyItems}
            at={Math.min(menuAt, Math.max(0, partyItems.length - 1))}
            anchor={anchor}
            onAt={setMenuAt}
            onPick={pickParty}
            onCancel={() => { setMode('list') }}
          />
        )}
        {mode === 'shift' && (
          <ChoiceMenu
            items={shiftItems}
            at={menuAt}
            anchor={anchor}
            scroll={8}
            onAt={setMenuAt}
            onPick={pickShift}
            onCancel={() => { setMode('list') }}
          />
        )}
        {mode === 'seals' && (
          <ChoiceMenu
            items={sealItems}
            at={Math.min(menuAt, Math.max(0, sealItems.length - 1))}
            anchor={anchor}
            scroll={8}
            onAt={setMenuAt}
            onPick={pickSeal}
            onCancel={() => { setMode('slots') }}
          />
        )}
        {mode === 'quitAsk' && (
          <YesNo
            labels={[menuText[YES_NO.yes] ?? '', menuText[YES_NO.no] ?? '']}
            initial={1}
            anchor={anchor}
            onPick={(yes) => {
              if (yes) { setWork(null); setMode('list'); setNotice('') } else setMode('slots')
            }}
            onCancel={() => { setMode('slots') }}
          />
        )}
      </div>
    </MenuScreen>
  )
}
