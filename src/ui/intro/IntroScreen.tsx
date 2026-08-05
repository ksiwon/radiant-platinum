// 인트로 — 마박사의 말부터 라이벌 이름까지.
//
// 순서와 글은 `engine/intro/beats.ts`가 갖고 있고 여기는 그것을 화면에 올린다.
// 글자 인쇄기는 필드 대사창이 쓰는 것을 그대로 쓴다 — 설정의 글자 속도가
// 여기서도 먹는다.
//
// 끝나면 세이브에 이름·성별·라이벌 이름을 적고 새 게임 상태를 세운 뒤 필드로
// 넘긴다. 시작 자리는 원작이 `location.c`에 적어 둔 그대로다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { loadDialogueBank } from '../../data/gameData'
import { loadGenericNames, pickName } from '../../data/genericNames'
import { fillMenuText, INTRO_TEXT, NAMING_TEXT, UI_BANK } from '../../data/uiText'
import {
  INFO_CHOICES, infoLines, INTRO, RIVAL_NAME_CHOICES, type IntroStep,
} from '../../engine/intro/beats'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { textSpeedFrames } from '../../state/optionsStore'
import { startNewGame } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import * as css from './intro.css'

/** 원작 이름 칸이 7글자다 (`TrainerInfo`의 이름 버퍼) */
const NAME_MAX = 7

type Stage =
  | { kind: 'say'; at: number }
  /** 되묻는 자리. `at`은 `INTRO`의 위치 */
  | { kind: 'infoMenu'; at: number }
  | { kind: 'infoLines'; at: number; lines: readonly number[]; index: number }
  /** `nagged`는 볼 대신 버튼을 눌렀을 때다 — 원작도 그때 따로 말한다 */
  | { kind: 'pokeBall'; at: number; opened: boolean; nagged: boolean }
  | { kind: 'gender'; at: number }
  | { kind: 'genderConfirm'; at: number; boy: boolean }
  | { kind: 'rivalChoice'; at: number }
  | { kind: 'nameEntry'; at: number; who: 'player' | 'rival' }
  | { kind: 'nameConfirm'; at: number; who: 'player' | 'rival' }

export function IntroScreen() {
  const navigate = useNavigate()
  const [bank, setBank] = useState<string[]>([])
  const [naming, setNaming] = useState<string[]>([])
  const [generic, setGeneric] = useState<string[]>([])
  const [stage, setStage] = useState<Stage>({ kind: 'say', at: 0 })
  const [player, setPlayer] = useState('')
  const [rival, setRival] = useState('')
  const [boy, setBoy] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [draft, setDraft] = useState('')
  const [text, setText] = useState('')
  /** 지금 글을 다 찍었나. 고를 것은 이때만 뜬다 */
  const [ready, setReady] = useState(false)
  const printer = useRef<MessagePrinter | null>(null)
  const slots = useRef(new MessageSlots())
  /**
   * 이번 프레임에 A를 눌렀는가.
   *
   * ⚠️ 인쇄기에 **진짜 누름을 먹여야 한다.** 인트로 글에는 `
`(창 비우고 새 쪽)이
   * 잔뜩 들어 있는데 그 자리는 버튼을 기다린다 — 늘 `pressed: false`로 돌리면
   * 첫 쪽에서 영영 멈춘다. `finish()`로 밀어 버리면 반대로 여섯 쪽이 한 프레임에
   * 지나간다
   */
  const pressed = useRef(false)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadDialogueBank('ko', UI_BANK.intro),
      loadDialogueBank('ko', UI_BANK.naming),
      loadGenericNames('ko'),
    ]).then(([intro, name, names]) => {
      if (!alive) return
      setBank(intro)
      setNaming(name)
      setGeneric(names)
    }).catch(() => { /* 글을 못 받으면 빈 화면이 뜬다 */ })
    return () => { alive = false }
  }, [])

  /**
   * 뱅크 한 줄을 이름까지 채워서.
   *
   * 끝의 새 쪽 표지(CR·FF)는 떼어 낸다. 그것은 "버튼을 기다렸다가 창을 닫아라"는
   * 뜻이지 새 쪽이 아니다 — 그대로 두면 마지막에 빈 창이 한 번 더 뜬다
   */
  const line = useCallback((at: number): string =>
    fillMenuText(bank[at] ?? '', [player, rival]).replace(/[\r\f]+$/, ''),
  [bank, player, rival])

  // ── 인쇄기 ────────────────────────────────────────────────────────────────
  /** 지금 창에 올릴 글. 없으면 null */
  const showing = useMemo((): string | null => {
    switch (stage.kind) {
      case 'say': {
        const step = INTRO[stage.at]
        return step?.kind === 'say' ? line(step.line) : null
      }
      case 'infoMenu': return line(INTRO_TEXT.anythingElse)
      case 'infoLines': return line(stage.lines[stage.index] ?? INTRO_TEXT.anythingElse)
      // 볼이 열린 뒤의 말("우리 인간은 포켓몬과…")은 **다음 박자**가 찍는다.
      // 여기서 같이 띄우면 같은 줄이 두 번 나온다
      case 'pokeBall': return line(stage.nagged ? INTRO_TEXT.wrongButton : INTRO_TEXT.havePokeBall)
      case 'gender': return line(INTRO_TEXT.genderAsk)
      case 'genderConfirm': return line(stage.boy ? INTRO_TEXT.confirmBoy : INTRO_TEXT.confirmGirl)
      case 'rivalChoice': return line(INTRO_TEXT.rivalNameAsk)
      case 'nameEntry':
        return stage.who === 'player'
          ? (naming[NAMING_TEXT.player] ?? line(INTRO_TEXT.nameAsk))
          : line(INTRO_TEXT.rivalNameAsk)
      case 'nameConfirm':
        return stage.who === 'player'
          ? line(boy ? INTRO_TEXT.confirmNameMale : INTRO_TEXT.confirmNameFemale)
          : line(INTRO_TEXT.confirmRivalName)
    }
  }, [stage, line, naming, boy])

  useEffect(() => {
    if (showing === null) { printer.current = null; setText(''); setReady(true); return }
    printer.current = new MessagePrinter(showing, slots.current, {
      speed: textSpeedFrames(), canSkip: true, autoScroll: false,
    })
    setText('')
    setReady(false)
  }, [showing])

  useEffect(() => {
    let raf = 0
    let last = ''
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const p = printer.current
      if (p === null) return
      const hit = pressed.current
      pressed.current = false
      p.tick({ pressed: hit, held: hit })
      const now = printedText(p)
      if (now !== last) { last = now; setText(now) }
      setReady((r) => (r === p.finished ? r : p.finished))
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  /**
   * 아직 읽을 것이 남았으면 A를 인쇄기에 넘기고 true.
   *
   * 다 찍혔으면 false — 그때야 다음 박자로 간다
   */
  const rush = (): boolean => {
    const p = printer.current
    if (p === null || p.finished) return false
    pressed.current = true
    return true
  }

  // ── 흐름 ──────────────────────────────────────────────────────────────────
  const finish = useCallback((): void => {
    startNewGame({ name: player, gender: boy ? 'boy' : 'girl', rivalName: rival })
    navigate('/play')
  }, [player, boy, rival, navigate])

  /** 곧게 흐르는 자리에서 다음 박자로 */
  const step = useCallback((at: number): void => {
    const next = INTRO[at + 1]
    if (!next) { finish(); return }
    setCursor(0)
    setDraft('')
    switch (next.kind) {
      case 'say': setStage({ kind: 'say', at: at + 1 }); break
      case 'infoMenu': setStage({ kind: 'infoMenu', at: at + 1 }); break
      case 'pokeBall': setStage({ kind: 'pokeBall', at: at + 1, opened: false, nagged: false }); break
      case 'gender': setStage({ kind: 'gender', at: at + 1 }); break
      case 'name':
        // 라이벌은 후보 여덟 중에서 고르거나 직접 짓는다. 주인공은 바로 자판이다
        setStage(next.who === 'rival'
          ? { kind: 'rivalChoice', at: at + 1 }
          : { kind: 'nameEntry', at: at + 1, who: 'player' })
        break
      case 'done': finish(); break
    }
  }, [finish])

  const advance = (): void => {
    if (rush()) return
    switch (stage.kind) {
      case 'say': step(stage.at); break
      case 'infoLines':
        if (stage.index + 1 < stage.lines.length) {
          setStage({ ...stage, index: stage.index + 1 })
        } else {
          // 다 듣고 나면 "그 밖에 알고 싶은 건 무엇인가?"로 되돌아온다
          setCursor(0)
          setStage({ kind: 'infoMenu', at: stage.at })
        }
        break
      case 'pokeBall':
        // 볼을 눌러야 열린다. 키를 누르면 원작처럼 "그 버튼이 아니고"라고 한다
        if (stage.opened) step(stage.at)
        else if (!stage.nagged) setStage({ ...stage, nagged: true })
        break
      default: break
    }
  }

  const pick = (): void => {
    if (rush()) return
    switch (stage.kind) {
      case 'infoMenu': {
        const choice = INFO_CHOICES[cursor]?.value ?? 2
        const lines = infoLines(choice)
        if (lines.length === 0) { step(stage.at); return }
        setStage({ kind: 'infoLines', at: stage.at, lines, index: 0 })
        break
      }
      case 'gender':
        setBoy(cursor === 0)
        setStage({ kind: 'genderConfirm', at: stage.at, boy: cursor === 0 })
        setCursor(0)
        break
      case 'genderConfirm':
        if (cursor === 0) step(stage.at)
        else { setStage({ kind: 'gender', at: stage.at }); setCursor(0) }
        break
      case 'rivalChoice': {
        // 마지막 칸이 "스스로 결정한다!"다
        if (cursor >= RIVAL_NAME_CHOICES.length) {
          setDraft('')
          setStage({ kind: 'nameEntry', at: stage.at, who: 'rival' })
          return
        }
        setRival(bank[RIVAL_NAME_CHOICES[cursor]!] ?? '')
        setStage({ kind: 'nameConfirm', at: stage.at, who: 'rival' })
        setCursor(0)
        break
      }
      case 'nameConfirm':
        if (cursor === 0) step(stage.at)
        else if (stage.who === 'player') { setDraft(player); setStage({ kind: 'nameEntry', at: stage.at, who: 'player' }) }
        else { setStage({ kind: 'rivalChoice', at: stage.at }); setCursor(0) }
        break
      default:
        advance()
    }
  }

  /** 이름을 확정한다. 비면 원작이 제안하는 이름을 쓴다 */
  const commitName = (who: 'player' | 'rival', at: number): void => {
    const trimmed = draft.trim().slice(0, NAME_MAX)
    const fallback = generic.length === 0 ? ''
      : pickName(generic, who === 'rival' ? 'rival' : boy ? 'playerMale' : 'playerFemale', 0)
    const value = trimmed || fallback
    if (who === 'player') setPlayer(value)
    else setRival(value)
    setStage({ kind: 'nameConfirm', at, who })
    setCursor(0)
  }

  const typing = stage.kind === 'nameEntry' && ready
  const choices = ready ? choiceLabels(stage, bank) : null

  useMenuKeys({
    up: () => { if (choices) setCursor((c) => clampCursor(c, -1, choices.length)) },
    down: () => { if (choices) setCursor((c) => clampCursor(c, 1, choices.length)) },
    left: () => { if (choices && choices.length === 2) setCursor(0) },
    right: () => { if (choices && choices.length === 2) setCursor(1) },
    confirm: () => { if (choices) pick(); else advance() },
  }, !typing)

  const step_ = INTRO[stageAt(stage)]
  const ballStep: IntroStep | undefined = step_

  return (
    <div className={css.wrap}>
      <div className={css.stage}>
        {stage.kind === 'pokeBall' && ready && ballStep?.kind === 'pokeBall' && (
          <button
            className={stage.opened ? css.ballOpen : css.ball}
            onClick={() => {
              if (rush()) return
              if (!stage.opened) setStage({ ...stage, opened: true })
              else step(stage.at)
            }}
            aria-label="몬스터볼"
          />
        )}
      </div>

      <div className={css.box} onClick={() => { if (!typing && !choices) advance() }}>
        <div className={css.text}>{text}</div>

        {typing && (
          <form
            className={css.nameRow}
            onSubmit={(e) => { e.preventDefault(); commitName(stage.who, stage.at) }}
          >
            <input
              className={css.input}
              value={draft}
              maxLength={NAME_MAX}
              autoFocus
              onChange={(e) => { setDraft(e.target.value) }}
              aria-label="이름"
            />
            <button className={css.ok} type="submit">결정</button>
          </form>
        )}

        {choices && (
          <div className={css.choices}>
            {choices.map((label, i) => (
              <span key={label + String(i)} className={i === cursor ? css.choiceOn : css.choice}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={css.hint}>
        {typing ? `${String(NAME_MAX)}글자까지 · Enter 결정` : '↑↓ 고르기 · Z·Enter 넘기기'}
      </div>
    </div>
  )
}

/** 이 단계가 `INTRO`의 어디인가 */
function stageAt(stage: Stage): number {
  return stage.at
}

/** 지금 고를 것이 있으면 그 글 목록. 없으면 null */
function choiceLabels(stage: Stage, bank: string[]): string[] | null {
  const at = (i: number): string => bank[i] ?? ''
  switch (stage.kind) {
    case 'infoMenu': return INFO_CHOICES.map((c) => at(c.line))
    // 원작은 성별을 그림으로 고르게 한다. 우리는 아직 초상이 없어서 글로 묻는다
    case 'gender': return ['남자', '여자']
    case 'genderConfirm':
    case 'nameConfirm': return [at(INTRO_TEXT.yes), at(INTRO_TEXT.no)]
    case 'rivalChoice': return [...RIVAL_NAME_CHOICES.map(at), at(INTRO_TEXT.rivalChoiceOwn)]
    default: return null
  }
}
