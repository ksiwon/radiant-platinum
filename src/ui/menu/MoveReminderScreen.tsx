// 기술 되살리기 · 기술가르침 (PARITY §5 `move_reminder`)
//
// 하트비늘 아주머니와 기술가르침 노인이 **같은 화면**을 쓴다
// (`FieldSystem_OpenMoveReminderMenu`) — 다른 것은 목록이 학습표에서 오느냐
// 한 줄뿐이냐 하나다.
//
// 넷을 다 알고 있으면 **무엇을 잊을지** 고른다. 그 자리에서 취소하면
// 아무것도 안 배운다 (`keepOldMove`).
import { useEffect, useState } from 'react'
import { loadMoveNames, loadMoves, loadSpeciesNames, type MoveTable } from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './moveReminder.css'

/** 기술 칸 넷 (`LEARNED_MOVES_MAX`) */
const MOVES_MAX = 4

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

/** 바닥 안내. 잊을 기술을 고를 때 X는 새 기술 목록으로 물러난다 */
export function reminderFoot(forgetting: boolean): string {
  return forgetting
    ? '↑↓ 잊을 기술 · Z 결정 · X 뒤로'
    : '↑↓ 고르기 · Z 가르친다 · X 그만둔다'
}

export function MoveReminderScreen() {
  const back = useMenuStore((s) => s.back)
  const ask = useMenuStore((s) => s.reminder)
  const finish = useMenuStore((s) => s.finishReminder)
  const party = useSaveStore((s) => s.party)
  const [names, setNames] = useState<string[]>([])
  const [speciesNames, setSpeciesNames] = useState<string[]>([])
  const [table, setTable] = useState<MoveTable | null>(null)
  const [text, setText] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  /** 넷을 다 알 때 무엇을 잊을지 고르는 자리. null이면 아직 새 기술을 고르는 중 */
  const [forget, setForget] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const locale = gameLocale()
    void Promise.all([
      loadMoveNames(locale), loadMoves(), loadUiText('moveDescriptions', locale), loadSpeciesNames(locale),
    ])
      .then(([list, moves, lines, species]) => {
        if (!alive) return
        setNames(list); setTable(moves); setText(lines); setSpeciesNames(species)
      })
      .catch(() => { /* 이름 없이도 자리는 선다 */ })
    return () => { alive = false }
  }, [])

  const mon = ask ? party[ask.slot] : undefined
  const moves = ask?.moves ?? []

  const close = (learned: boolean): void => {
    finish(learned)
    back()
  }

  /** 새 기술을 그 자리에 넣는다 */
  const learn = (slot: number): void => {
    if (!ask || !mon) { close(false); return }
    const move = moves[cursor]
    if (move === undefined) { close(false); return }
    const pp = table?.byId.get(move)?.pp ?? 5
    const next = mon.moves.map((s) => s)
    if (slot < next.length) next[slot] = { move, pp, ppUps: 0 }
    else next.push({ move, pp, ppUps: 0 })
    useSaveStore.setState({
      party: party.map((m, i) => (i === ask.slot ? { ...m, moves: next } : m)),
    })
    close(true)
  }

  useMenuKeys(forget !== null
    ? {
      up: () => { setForget((f) => clampCursor(f ?? 0, -1, (mon?.moves.length ?? 0) + 1)) },
      down: () => { setForget((f) => clampCursor(f ?? 0, 1, (mon?.moves.length ?? 0) + 1)) },
      confirm: () => {
        // 마지막 줄은 「그만둔다」 — 원작도 잊기 화면에서 물러설 수 있다
        if (forget >= (mon?.moves.length ?? 0)) { close(false); return }
        learn(forget)
      },
      cancel: () => { setForget(null) },
    }
    : {
      up: () => { setCursor((c) => clampCursor(c, -1, moves.length)) },
      down: () => { setCursor((c) => clampCursor(c, 1, moves.length)) },
      confirm: () => {
        if (!mon || !moves.length) { close(false); return }
        // 빈 칸이 있으면 그냥 배운다. 넷을 다 알면 무엇을 잊을지 묻는다
        if (mon.moves.length < MOVES_MAX) { learn(mon.moves.length); return }
        setForget(0)
      },
      cancel: () => { close(false) },
    })

  const shown = forget !== null ? mon?.moves[forget]?.move : moves[cursor]
  const info = shown !== undefined ? table?.byId.get(shown) : undefined

  return (
    <MenuScreen
      title={ask?.tutor === true ? '기술가르침' : '기술 되살리기'}
      note={mon ? reminderNote(mon, speciesNames) : undefined}
      foot={reminderFoot(forget !== null)}
    >
      <div className={css.stage}>
        <div className={css.list}>
          {forget !== null
            ? (
              <>
                {(mon?.moves ?? []).map((slot, i) => (
                  <div key={i} className={i === forget ? css.rowOn : css.row}>
                    {i === forget && <span className={css.caret} aria-hidden />}
                    <span className={css.face}>
                      <span className={css.label}>{names[slot.move] ?? ''}</span>
                    </span>
                  </div>
                ))}
                <div className={forget >= (mon?.moves.length ?? 0) ? css.rowOn : css.row}>
                  <span className={css.face}><span className={css.label}>그만둔다</span></span>
                </div>
              </>
            )
            : moves.length
              ? moves.map((move, i) => (
                <div key={move} className={i === cursor ? css.rowOn : css.row}>
                  {i === cursor && <span className={css.caret} aria-hidden />}
                  <span className={css.face}>
                    <span className={css.label}>{names[move] ?? ''}</span>
                  </span>
                </div>
              ))
              : <div className={css.rowDim}><span className={css.label}>가르칠 기술이 없다</span></div>}
        </div>

        <div className={css.detail}>
          {info && (
            <>
              <div className={own.head}>
                <span className={own.power}>위력 {info.power || '—'}</span>
                <span className={own.power}>명중 {info.alwaysHits ? '필중' : info.accuracy}</span>
                <span className={own.power}>PP {info.pp}</span>
              </div>
              <p className={own.desc}>{shown !== undefined ? text[shown] ?? '' : ''}</p>
            </>
          )}
        </div>
      </div>
    </MenuScreen>
  )
}
