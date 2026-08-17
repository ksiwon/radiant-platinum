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
  INFO_CHOICES,
  infoLines,
  INTRO,
  RIVAL_NAME_CHOICES,
  type IntroStep,
} from '../../engine/intro/beats'
import { introWelcome } from '../../engine/intro/welcomeText'
import { music } from '../../engine/audio/music'
import { OPENING_SONG } from '../../engine/audio/songIds'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { useSessionStore } from '../../state/sessionStore'
import { useIntroStageStore } from '../../state/introStageStore'
import { textSpeedFrames, useGameLocale } from '../../state/optionsStore'
import { startNewGame } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import * as css from './intro.css'

/** 원작 이름 칸이 7글자다 (`TrainerInfo`의 이름 버퍼) */
const NAME_MAX = 7

/**
 * 라이벌이 화면에 서기 시작하는 박자.
 *
 * 「…라고 하는가! 여기 있는 이 소년은 자네의 친구였지?」(`soYoure`)가 그 자리라
 * 번호가 아니라 **그 줄을 찾아서** 정한다
 */
const RIVAL_ENTERS = INTRO.findIndex(
  (s) => s.kind === 'say' && s.line === INTRO_TEXT.soYoure,
)

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
  const mountStage = useSessionStore((state) => state.mountStage)
  const [bank, setBank] = useState<string[]>([])
  const [naming, setNaming] = useState<string[]>([])
  const [generic, setGeneric] = useState<string[]>([])
  // 설정의 언어. 인트로 도중에 바꾸는 일은 없지만, 타이틀에서 바꿔 두고
  // 새 모험을 시작하면 그 언어로 시작해야 한다
  const locale = useGameLocale()
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
  useEffect(() => {
    mountStage()
    useIntroStageStore.getState().start()
    return () => {
      useIntroStageStore.getState().clear()
    }
  }, [mountStage])

  useEffect(() => {
    const visual = useIntroStageStore.getState()
    const selectedGender =
      stage.kind === 'gender' ? (cursor === 0 ? 'boy' : 'girl') : boy ? 'boy' : 'girl'
    visual.setGender(selectedGender)
    if (stage.kind === 'pokeBall') visual.show(stage.opened ? 'buneary' : 'ball')
    else if (stage.kind === 'gender' || stage.kind === 'genderConfirm') visual.show('gender')
    else if ((stage.kind === 'nameEntry' || stage.kind === 'nameConfirm') && stage.who === 'player')
      visual.show('player')
    else if (
      stage.kind === 'rivalChoice' ||
      ((stage.kind === 'nameEntry' || stage.kind === 'nameConfirm') && stage.who === 'rival') ||
      // ⚠️ **자리 번호로 세지 않는다.** 「자네 친구인 이 소년은…」(`soYoure`)부터
      // 라이벌이 서는데, 그 앞에 박자를 하나라도 끼우면 번호가 통째로 밀린다 —
      // 실제로 우리 인사(`ours`)를 맨 앞에 넣으면서 한 칸 밀렸다. 무엇을 찍는
      // 박자인지로 판정하면 순서를 바꿔도 안 깨진다
      (stage.kind === 'say' && stage.at >= RIVAL_ENTERS)
    )
      visual.show('rival')
    else visual.show('rowan')
  }, [stage, cursor, boy])
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
  /**
   * A를 **누르고 있는가.** 누른 순간과 따로 봐야 한다.
   *
   * 원작은 누르고 있는 동안 글자 사이 대기를 0으로 만든다(`speedUp`). 눌린
   * 순간만 넘기면 그 길이 영영 안 열려서, 다 읽은 글을 넘기려고 연타하는
   * 수밖에 없다. `useMenuKeys`는 keydown만 듣기 때문에 여기서 따로 잡는다
   */
  const holding = useRef(false)

  /**
   * 마박사의 인트로 곡 (`SEQ_OPENING`).
   *
   * 원작 `rowan_intro_app.c`가 `Sound_SetSceneAndPlayBGM(SOUND_SCENE_2,
   * SEQ_OPENING, 1)`을 부른다. **여기서 안 갈아타면 타이틀 곡이 그대로
   * 흘러 들어온다** — 타이틀이 나갈 때 곡을 안 끄기 때문이다(끄면 필드로
   * 들어갈 때 사이가 정적이 된다)
   */
  useEffect(() => {
    void music.play(OPENING_SONG)
  }, [])

  useEffect(() => {
    const CONFIRM = new Set(['Space', 'KeyZ', 'Enter'])
    const down = (e: KeyboardEvent): void => {
      if (CONFIRM.has(e.code)) holding.current = true
    }
    const up = (e: KeyboardEvent): void => {
      if (CONFIRM.has(e.code)) holding.current = false
    }
    // 창 밖으로 나가면 뗀 것으로 친다 — 안 그러면 돌아왔을 때 계속 눌린 상태다
    const blur = (): void => {
      holding.current = false
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadDialogueBank(locale, UI_BANK.intro),
      loadDialogueBank(locale, UI_BANK.naming),
      loadGenericNames(locale),
    ])
      .then(([intro, name, names]) => {
        if (!alive) return
        setBank(intro)
        setNaming(name)
        setGeneric(names)
      })
      .catch(() => {
        /* 글을 못 받으면 빈 화면이 뜬다 */
      })
    return () => {
      alive = false
    }
  }, [locale])

  /**
   * 뱅크 한 줄을 이름까지 채워서.
   *
   * 끝의 새 쪽 표지(CR·FF)는 떼어 낸다. 그것은 "버튼을 기다렸다가 창을 닫아라"는
   * 뜻이지 새 쪽이 아니다 — 그대로 두면 마지막에 빈 창이 한 번 더 뜬다
   */
  const line = useCallback(
    (at: number): string => fillMenuText(bank[at] ?? '', [player, rival]).replace(/[\r\f]+$/, ''),
    [bank, player, rival],
  )

  // ── 인쇄기 ────────────────────────────────────────────────────────────────
  /** 지금 창에 올릴 글. 없으면 null */
  const showing = useMemo((): string | null => {
    switch (stage.kind) {
      case 'say': {
        const step = INTRO[stage.at]
        // 첫 박자만 우리 글이다 (`engine/intro/welcomeText`). 뱅크가 fetch로
        // 오는 것과 달리 이건 묶음 안에 있어서 **글을 기다리지 않고 바로 뜬다**
        if (step?.kind === 'ours') return introWelcome(locale)
        return step?.kind === 'say' ? line(step.line) : null
      }
      case 'infoMenu':
        return line(INTRO_TEXT.anythingElse)
      case 'infoLines':
        return line(stage.lines[stage.index] ?? INTRO_TEXT.anythingElse)
      // 볼이 열린 뒤의 말("우리 인간은 포켓몬과…")은 **다음 박자**가 찍는다.
      // 여기서 같이 띄우면 같은 줄이 두 번 나온다
      case 'pokeBall':
        return line(stage.nagged ? INTRO_TEXT.wrongButton : INTRO_TEXT.havePokeBall)
      case 'gender':
        return line(INTRO_TEXT.genderAsk)
      case 'genderConfirm':
        return line(stage.boy ? INTRO_TEXT.confirmBoy : INTRO_TEXT.confirmGirl)
      case 'rivalChoice':
        return line(INTRO_TEXT.rivalNameAsk)
      case 'nameEntry':
        return stage.who === 'player'
          ? (naming[NAMING_TEXT.player] ?? line(INTRO_TEXT.nameAsk))
          : line(INTRO_TEXT.rivalNameAsk)
      case 'nameConfirm':
        return stage.who === 'player'
          ? line(boy ? INTRO_TEXT.confirmNameMale : INTRO_TEXT.confirmNameFemale)
          : line(INTRO_TEXT.confirmRivalName)
    }
    // `locale`은 우리 인사가 본다 — 뱅크 쪽은 `line`이 이미 그 언어로 받아 온다
  }, [stage, line, naming, boy, locale])

  useEffect(() => {
    if (showing === null) {
      printer.current = null
      setText('')
      setReady(true)
      return
    }
    printer.current = new MessagePrinter(showing, slots.current, {
      speed: textSpeedFrames(),
      canSkip: true,
      autoScroll: false,
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
      p.tick({ pressed: hit, held: holding.current })
      const now = printedText(p)
      if (now !== last) {
        last = now
        setText(now)
      }
      setReady((r) => (r === p.finished ? r : p.finished))
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
    }
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
  const step = useCallback(
    (at: number): void => {
      const next = INTRO[at + 1]
      if (!next) {
        finish()
        return
      }
      setCursor(0)
      setDraft('')
      switch (next.kind) {
        // 우리 글도 창에 올리는 방식이 같다 — 뱅크 대신 `welcomeText`에서 온다
        case 'ours':
        case 'say':
          setStage({ kind: 'say', at: at + 1 })
          break
        case 'infoMenu':
          setStage({ kind: 'infoMenu', at: at + 1 })
          break
        case 'pokeBall':
          setStage({ kind: 'pokeBall', at: at + 1, opened: false, nagged: false })
          break
        case 'gender':
          setStage({ kind: 'gender', at: at + 1 })
          break
        case 'name':
          // 라이벌은 후보 여덟 중에서 고르거나 직접 짓는다. 주인공은 바로 자판이다
          setStage(
            next.who === 'rival'
              ? { kind: 'rivalChoice', at: at + 1 }
              : { kind: 'nameEntry', at: at + 1, who: 'player' },
          )
          break
        case 'done':
          finish()
          break
      }
    },
    [finish],
  )

  const advance = (): void => {
    if (rush()) return
    switch (stage.kind) {
      case 'say':
        step(stage.at)
        break
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
        // ⚠️ **키로도 열린다.** 원작은 터치 화면이라 볼을 눌러야 하고, 키를
        // 누르면 "그 버튼이 아니고"라고 나무란다 — 그 말은 그대로 두되 거기서
        // 막지는 않는다. 여기서 막으면 마우스 없이는 게임을 **시작조차** 못 한다
        if (stage.opened) step(stage.at)
        else if (!stage.nagged) setStage({ ...stage, nagged: true })
        else setStage({ ...stage, opened: true })
        break
      default:
        break
    }
  }

  const pick = (): void => {
    if (rush()) return
    switch (stage.kind) {
      case 'infoMenu': {
        const choice = INFO_CHOICES[cursor]?.value ?? 2
        const lines = infoLines(choice)
        if (lines.length === 0) {
          step(stage.at)
          return
        }
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
        else {
          setStage({ kind: 'gender', at: stage.at })
          setCursor(0)
        }
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
        else if (stage.who === 'player') {
          setDraft(player)
          setStage({ kind: 'nameEntry', at: stage.at, who: 'player' })
        } else {
          setStage({ kind: 'rivalChoice', at: stage.at })
          setCursor(0)
        }
        break
      default:
        advance()
    }
  }

  /** 이름을 확정한다. 비면 원작이 제안하는 이름을 쓴다 */
  const commitName = (who: 'player' | 'rival', at: number): void => {
    const trimmed = draft.trim().slice(0, NAME_MAX)
    const fallback =
      generic.length === 0
        ? ''
        : pickName(generic, who === 'rival' ? 'rival' : boy ? 'playerMale' : 'playerFemale', 0)
    const value = trimmed || fallback
    if (who === 'player') setPlayer(value)
    else setRival(value)
    setStage({ kind: 'nameConfirm', at, who })
    setCursor(0)
  }

  const typing = stage.kind === 'nameEntry' && ready
  const choices = ready ? choiceLabels(stage, bank) : null

  useMenuKeys(
    {
      // ⚠️ **고르는 줄은 가로다.** 칸이 옆으로 늘어서 있는데 위아래 키로만
      // 움직였다 — 화면 생김새와 손이 어긋난다. 좌우가 임자고, 위아래는 같은
      // 일을 하는 딴 이름으로 남긴다(십자키·WASD를 쓰는 사람이 있다)
      up: () => {
        if (choices) setCursor((c) => clampCursor(c, -1, choices.length))
      },
      down: () => {
        if (choices) setCursor((c) => clampCursor(c, 1, choices.length))
      },
      left: () => {
        if (choices) setCursor((c) => clampCursor(c, -1, choices.length))
      },
      right: () => {
        if (choices) setCursor((c) => clampCursor(c, 1, choices.length))
      },
      confirm: () => {
        if (choices) pick()
        else advance()
      },
    },
    !typing,
  )

  const step_ = INTRO[stageAt(stage)]
  const ballStep: IntroStep | undefined = step_

  return (
    <div className={css.wrap}>
      <div className={css.stage}>
        {stage.kind === 'pokeBall' && ready && ballStep?.kind === 'pokeBall' && (
          <button
            className={css.ballHit}
            onClick={() => {
              if (rush()) return
              if (!stage.opened) setStage({ ...stage, opened: true })
              else step(stage.at)
            }}
            aria-label="몬스터볼"
          />
        )}
      </div>

      <div
        className={css.box}
        onClick={() => {
          if (!typing && !choices) advance()
        }}
      >
        <div className={css.text}>{text}</div>

        {typing && (
          <form
            className={css.nameRow}
            onSubmit={(e) => {
              e.preventDefault()
              commitName(stage.who, stage.at)
            }}
          >
            <input
              className={css.input}
              value={draft}
              maxLength={NAME_MAX}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              aria-label="이름"
            />
            <button className={css.ok} type="submit">
              결정
            </button>
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

      {/*
        ⚠️ **무엇을 누를지가 화면에 있어야 한다.** 한 줄로 「↑↓ 고르기 · Z·Enter
        넘기기」만 띄웠더니 볼 앞에서 「뭘 눌러야 할지 감도 안 온다」는 말을
        들었다. 지금 화면이 무엇을 기다리는지에 따라 다르게 적는다
      */}
      <div className={css.hint}>
        {typing
          ? `${String(NAME_MAX)}글자까지 · Enter 결정`
          : stage.kind === 'pokeBall' && !stage.opened
            ? '볼 가운데의 버튼을 누른다 — 클릭 · Z·Enter'
            : choices
              ? '←→ 고르기 · Z·Enter 결정'
              : 'Z·Enter 넘기기'}
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
    case 'infoMenu':
      return INFO_CHOICES.map((c) => at(c.line))
    // 원작은 성별을 그림으로 고르게 한다. 우리는 아직 초상이 없어서 글로 묻는다
    case 'gender':
      return ['남자', '여자']
    case 'genderConfirm':
    case 'nameConfirm':
      return [at(INTRO_TEXT.yes), at(INTRO_TEXT.no)]
    case 'rivalChoice':
      return [...RIVAL_NAME_CHOICES.map(at), at(INTRO_TEXT.rivalChoiceOwn)]
    default:
      return null
  }
}
