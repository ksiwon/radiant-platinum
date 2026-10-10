// 기술 되살리기 · 기술가르침 (PARITY §5 `move_reminder`)
//
// 하트비늘 아주머니와 기술가르침 노인이 **같은 화면**을 쓴다
// (`FieldSystem_OpenMoveReminderMenu`) — 다른 것은 목록이 학습표에서 오느냐
// 한 줄뿐이냐 하나다.
//
// 배치는 원작(`move_reminder.c`)대로 왼쪽 포켓몬과 고른 기술 · 오른쪽 목록 · 아래 글띠다. 물음은 전부 **롬 글**이다
// (뱅크 645) — 차례는 `moveReminderFlow`에 적어 두었다. 넷을 다 알고 있으면 **무엇을 잊을지** 같은 창 안에서
// 고른다(원작은 요약 화면으로 넘어간다). 그 자리에서 취소하면 아무것도 안 배운다 (`keepOldMove`).
//
// ⚠️ **뱅크가 아직 안 왔으면 글띠가 빈다.** 손 글로 떨어지지 않는다 — 설치본에서 이 뱅크를 싣는 굽는 쪽 둘이
// 갖춰지기 전에는 물음이 비는 것이 맞는 모양이다. 그래도 Z · X는 돈다.
import { useEffect, useState, type CSSProperties } from 'react'
import { loadMoveNames, loadMoves, loadSpeciesNames, type MoveTable } from '../../data/gameData'
import { loadUiText, YES_NO } from '../../data/uiText'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { typeColor } from '../../engine/battle/typeColor'
import { spriteKey } from '../../engine/pokemon/form'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { romLine } from '../battle/romLine'
import { BATTLE_BANK, MSG } from '../battle/romText'
import { useRomLines } from '../battle/useRomLines'
import { MessageDock } from '../common/MessageDock'
import { MonIdentity } from '../common/MonIdentity'
import { MoveFacts } from '../common/MoveFacts'
import { ScrollKnob } from '../common/ScrollKnob'
import { TypeBadge } from '../common/TypeBadge'
import { WaitDial } from '../common/WaitDial'
import { YesNo } from '../common/YesNo'
import { PIXEL } from '../theme/scale'
import { MenuScreen } from './MenuScreen'
import { MOVES_MAX, REMINDER_LABEL, pagesOf, placeMove, reminderLines, windowTop } from './moveReminderFlow'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as own from './moveReminder.css'

/**
 * 머리 오른쪽 — 누구에게 가르치는가.
 *
 * ⚠️ **별명이 없으면 종족 이름이다.** 별명 없는 마리는 `nickname`이 null이라,
 * 별명만 쓰면 이름이 빠지고 「 Lv.15」만 남는다 (다른 화면의 `nickname ?? 종족명`과 같다)
 */
export function reminderNote(
  mon: { nickname: string | null, species: number, level: number },
  speciesNames: readonly string[],
): string {
  return `${mon.nickname ?? speciesNames[mon.species] ?? ''} Lv.${String(mon.level)}`
}

/**
 * 바닥 안내. 잊을 기술을 고를 때 X는 한 단 물러난다 — 「X 닫기」 하나로 모은다(L6).
 * 고르는 단의 X는 일을 버리는 것이라 「그만둔다」로 남긴다
 */
export function reminderFoot(forgetting: boolean): string {
  return forgetting
    ? '↑↓ 잊을 기술 · Z 결정 · X 닫기'
    : '↑↓ 고르기 · Z 가르친다 · X 그만둔다'
}

/** 지금 어느 물음인가 (차례는 `moveReminderFlow` 머리글) */
type Stage =
  | { at: 'pick' }
  | { at: 'giveUp' }
  | { at: 'ask' }
  | { at: 'four', page: number }
  | { at: 'forget' }
  | { at: 'confirm', slot: number }
  | { at: 'wellThen' }
  | { at: 'result', pages: string[], page: number }

export function MoveReminderScreen() {
  const back = useMenuStore((s) => s.back)
  const ask = useMenuStore((s) => s.reminder)
  const finish = useMenuStore((s) => s.finishReminder)
  const party = useSaveStore((s) => s.party)
  const [names, setNames] = useState<string[]>([])
  const [speciesNames, setSpeciesNames] = useState<string[]>([])
  const [table, setTable] = useState<MoveTable | null>(null)
  const [bank, setBank] = useState<string[]>([])
  const [menuText, setMenuText] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [top, setTop] = useState(0)
  /** 잊기 단의 커서 — 아는 기술 넷 + 새 기술(다섯째) */
  const [forget, setForget] = useState(0)
  const [stage, setStage] = useState<Stage>({ at: 'pick' })
  // 「어느 기술을 잊게 하겠습니까?」는 배틀 글 뱅크의 줄이다
  const battleLines = useRomLines(BATTLE_BANK)

  useEffect(() => {
    let alive = true
    const locale = gameLocale()
    void Promise.all([
      loadMoveNames(locale), loadMoves(), loadSpeciesNames(locale),
      // 뱅크가 없는 설치본이어도 화면은 선다 — 물음이 빌 뿐이다
      loadUiText('moveReminder', locale).catch(() => [] as string[]),
      loadUiText('menuEntries', locale).catch(() => [] as string[]),
    ])
      .then(([list, moves, species, lines, entries]) => {
        if (!alive) return
        setNames(list); setTable(moves); setSpeciesNames(species); setBank(lines); setMenuText(entries)
      })
      .catch(() => { /* 이름 없이도 자리는 선다 */ })
    return () => { alive = false }
  }, [])

  const mon = ask ? party[ask.slot] : undefined
  const tutor = ask?.tutor === true
  const lines = reminderLines(tutor)
  const moves = ask?.moves ?? []
  /** 목록의 끝 줄은 「그만둔다」다 — 원작 `MENU_CANCEL` */
  const total = moves.length + 1
  const known = mon?.moves ?? []
  const monName = mon ? mon.nickname ?? speciesNames[mon.species] ?? '' : ''
  const art = useAssetImage(
    mon ? `data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png` : null,
  )

  const nameOf = (id: number): string => names[id] ?? ''
  const maxPp = (id: number): number => table?.byId.get(id)?.pp ?? 0
  const typeOf = (id: number | undefined): number | null =>
    id === undefined ? null : table?.byId.get(id)?.type ?? null
  /** 새로 배울 기술 — 목록에서 고른 것 */
  const fresh = moves[cursor]
  const freshName = fresh === undefined ? '' : nameOf(fresh)
  const onCancelRow = cursor >= moves.length

  /** 롬 줄을 쪽으로 가른다. 칸: 0 마리 · 1 기술. 잊기 확인만 0이 잊을 기술이다 */
  const say = (at: number, ...values: string[]): string[] => pagesOf(bank[at], values)

  const close = (learned: boolean): void => {
    finish(learned)
    back()
  }

  /** 새 기술을 그 자리에 넣고 저장 상태를 고친다 */
  const commit = (slot: number): void => {
    if (!ask || !mon || fresh === undefined) return
    useSaveStore.setState({
      party: party.map((m, i) => (i === ask.slot
        ? { ...m, moves: placeMove(m.moves, slot, fresh, maxPp(fresh)) }
        : m)),
    })
  }

  /** 글 쪽 여럿을 차례로 보인다. 끝나면 `close(true)` */
  const startResult = (pages: string[], slot: number): void => {
    commit(slot)
    setStage({ at: 'result', pages, page: 0 })
  }

  // ── 단마다 보이는 글 ────────────────────────────────────────────────────
  const forgetId = stage.at === 'confirm' ? known[stage.slot]?.move : undefined
  const pages = ((): string[] => {
    switch (stage.at) {
      case 'pick': return say(lines.pick, monName, freshName)
      case 'giveUp': return say(lines.giveUp, monName, freshName)
      case 'ask': return say(lines.ask, monName, freshName)
      case 'four': return say(lines.four, monName, freshName)
      case 'forget': {
        const line = romLine(battleLines, MSG.whichMoveShouldBeForgotten)
        return line === null ? [] : [line]
      }
      case 'confirm': return say(lines.confirm, forgetId === undefined ? '' : nameOf(forgetId))
      case 'wellThen': return say(lines.wellThen, monName, freshName)
      case 'result': return stage.pages
    }
  })()
  const page = stage.at === 'four' || stage.at === 'result' ? stage.page : 0
  const shownText = pages[Math.min(page, Math.max(0, pages.length - 1))] ?? ''
  /** 마지막 쪽이 아니면 Z로 넘긴다 */
  const waiting = (stage.at === 'four' || stage.at === 'result') && page < pages.length - 1
  const lastResult = stage.at === 'result' && !waiting
  const asking = stage.at === 'giveUp' || stage.at === 'ask' || stage.at === 'confirm'
    || stage.at === 'wellThen' || (stage.at === 'four' && !waiting)

  // ── 키 ─────────────────────────────────────────────────────────────────
  const moveList = (d: number) => (): boolean => {
    const n = clampCursor(cursor, d, total)
    setCursor(n)
    setTop((t) => windowTop(t, n, own.VISIBLE_ROWS, total))
    return n !== cursor
  }
  const moveForget = (d: number) => (): boolean => {
    const n = clampCursor(forget, d, known.length + 1)
    setForget(n)
    return n !== forget
  }
  const keys = ((): Parameters<typeof useMenuKeys>[0] => {
    if (waiting || lastResult) {
      // 쪽을 넘긴다. 마지막 쪽에서 한 번 더 누르면 끝난다
      const advance = (): void => {
        if (stage.at === 'four') setStage({ at: 'four', page: stage.page + 1 })
        else if (stage.at === 'result') {
          if (waiting) setStage({ at: 'result', pages: stage.pages, page: stage.page + 1 })
          else close(true)
        }
      }
      return { confirm: advance, cancel: advance }
    }
    if (asking) return {} // 예/아니오가 쥔다
    if (stage.at === 'forget') {
      return {
        up: moveForget(-1),
        down: moveForget(1),
        confirm: () => {
          // 다섯째 칸(새 기술)을 누르면 물러선다 — 원작도 다섯째 칸이 곧 취소다
          if (forget >= known.length) setStage({ at: 'wellThen' })
          else setStage({ at: 'confirm', slot: forget })
        },
        cancel: () => { setStage({ at: 'wellThen' }) },
      }
    }
    return {
      up: moveList(-1),
      down: moveList(1),
      confirm: () => {
        if (!mon || moves.length === 0 || onCancelRow) { setStage({ at: 'giveUp' }); return }
        // 빈 칸이 있으면 그냥 배울지 묻고, 넷을 다 알면 무엇을 잊을지 묻는다
        if (known.length < MOVES_MAX) setStage({ at: 'ask' })
        else { setForget(0); setStage({ at: 'four', page: 0 }) }
      },
      cancel: () => { setStage({ at: 'giveUp' }) },
    }
  })()
  useMenuKeys(keys)

  // ── 예/아니오 ───────────────────────────────────────────────────────────
  const yesNoLabels: readonly [string, string] = [menuText[YES_NO.yes] ?? '', menuText[YES_NO.no] ?? '']
  const answer = (yes: boolean): void => {
    switch (stage.at) {
      case 'giveUp':
        if (yes) close(false)
        else setStage({ at: 'pick' })
        return
      case 'wellThen':
        // 포기하지 않으면 넷을 다 안다는 물음으로 돌아온다
        if (yes) close(false)
        else setStage({ at: 'four', page: Math.max(0, say(lines.four, monName, freshName).length - 1) })
        return
      case 'ask':
        if (yes) startResult(say(lines.learned, monName, freshName), known.length)
        else setStage({ at: 'pick' })
        return
      case 'four':
        setStage(yes ? { at: 'forget' } : { at: 'wellThen' })
        return
      case 'confirm':
        if (yes) {
          const old = known[stage.slot]?.move
          startResult(
            [...say(lines.forgot, monName, old === undefined ? '' : nameOf(old)),
              ...say(lines.learnedAfter, monName, freshName)],
            stage.slot,
          )
        } else setStage({ at: 'forget' })
        return
      default:
    }
  }

  // ── 고른 기술 (왼쪽) ────────────────────────────────────────────────────
  const forgetting = stage.at === 'forget' || stage.at === 'confirm'
  const shownId = forgetting
    ? forget >= known.length ? fresh : known[forget]?.move
    : onCancelRow ? undefined : fresh
  const info = shownId !== undefined ? table?.byId.get(shownId) : undefined

  const cancelLabel = bank[REMINDER_LABEL.cancel] ?? ''
  const ppLabel = bank[REMINDER_LABEL.pp] ?? ''

  return (
    <MenuScreen
      title={tutor ? '기술가르침' : '기술 되살리기'}
      note={mon ? reminderNote(mon, speciesNames) : undefined}
      foot={reminderFoot(forgetting)}
      message={(
        <MessageDock
          lines={shownText}
          when={shownText !== ''}
          {...(waiting || lastResult ? { trailing: <WaitDial /> } : {})}
        />
      )}
    >
      <div className={own.body}>
        <div className={own.stage}>
          <div className={own.mon}>
            <div className={own.portrait}>
              {art !== null && <img className={own.portraitArt} src={art} alt="" />}
            </div>
            <div className={own.monText}>
              {mon && <MonIdentity name={monName} level={mon.level} />}
              <div className={own.known}>
                {known.map((slot, i) => (
                  <span key={i} className={own.knownItem}>
                    {i > 0 && <span aria-hidden>·</span>}
                    <span
                      className={own.knownDot}
                      style={{ '--type': typeColor(typeOf(slot.move) ?? 0) } as CSSProperties}
                      aria-hidden
                    />
                    {nameOf(slot.move)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className={own.picked}>
            {info && (
              <>
                <div className={own.pickedHead}>
                  <TypeBadge type={info.type} scale={PIXEL.x2} />
                  <span>{nameOf(info.id)}</span>
                </div>
                <MoveFacts move={info} layout="column" />
              </>
            )}
          </div>
        </div>

        <div className={own.listBox}>
          <div className={own.list} role="list">
            {forgetting
              ? (
                <>
                  {known.map((slot, i) => (
                    <Line
                      key={i} on={i === forget} name={nameOf(slot.move)} type={typeOf(slot.move)}
                      tail={`${String(slot.pp)}/${String(maxPp(slot.move))}`}
                      onClick={() => { setForget(i) }}
                    />
                  ))}
                  {/* 다섯째 칸은 새 기술이다. 꼬리는 「그만둔다」 — PP 꼴을 안 넣는다 */}
                  <Line
                    on={forget >= known.length} name={freshName} type={typeOf(fresh)} tail={cancelLabel}
                    onClick={() => { setForget(known.length) }}
                  />
                </>
              )
              : (
                <>
                  {moves.slice(top, top + own.VISIBLE_ROWS).map((move, i) => (
                    <Line
                      key={move} on={top + i === cursor} name={nameOf(move)} type={typeOf(move)}
                      tail={`${ppLabel} ${String(maxPp(move))}`}
                      onClick={() => { setCursor(top + i) }}
                    />
                  ))}
                  {top + own.VISIBLE_ROWS >= total && (
                    <Line
                      on={onCancelRow} name={cancelLabel} type={null} tail=""
                      onClick={() => { setCursor(moves.length) }}
                    />
                  )}
                </>
              )}
          </div>
          {!forgetting && <ScrollKnob at={top} visible={own.VISIBLE_ROWS} total={total} />}
        </div>

        {asking && (
          <YesNo
            labels={yesNoLabels}
            initial={1}
            className={own.yesNo}
            onPick={answer}
            onCancel={() => { answer(false) }}
          />
        )}
      </div>
    </MenuScreen>
  )
}

/** 목록 줄 하나 — 타입 그림 · 이름 · 꼬리(PP · 「그만둔다」) */
function Line(
  { on, name, type, tail, onClick }: {
    on: boolean
    name: string
    type: number | null
    tail: string
    onClick: () => void
  },
) {
  return (
    <div className={on ? own.lineOn : own.line} role="listitem" aria-selected={on} onClick={onClick}>
      <span className={own.lineFace}>
        {type !== null && <TypeBadge type={type} scale={PIXEL.x2} />}
        <span className={own.lineName}>{name}</span>
        {tail !== '' && <span className={own.lineTail}>{tail}</span>}
      </span>
    </div>
  )
}
