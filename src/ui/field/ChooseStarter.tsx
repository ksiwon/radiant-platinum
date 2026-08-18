// 파트너를 고르는 화면 (`choose_starter/choose_starter_app.c`).
//
// 스크립트가 아니라 **따로 도는 프로그램**이라 바이트코드가 없다. 그래서 상태
// 기계를 여기 옮긴다 — 원작 단계 이름을 그대로 남겨 두어 나중에 무엇을
// 빠뜨렸는지 대조할 수 있게 한다.
//
// 그림은 **원작 3D 모델**이다(`scene/field/StarterStage`). 여기는 글창·메뉴·
// 미리보기만 그리고, 서류가방과 몬스터볼은 오버월드와 같은 Canvas에서 돈다.
//
// **글은 한 자도 짓지 않는다.** 넷 다 뱅크 360의 줄이다:
//
//   0      "몬스터볼이다! 안에 포켓몬이 들어 있다"
//   1·2·3  고른 볼의 분류와 이름 ("어린잎포켓몬 모부기 / 이 포켓몬으로 하겠느냐?")
//   7      "자! 어떤 포켓몬으로 할지 선택하거라"
//
// ⚠️ **0번은 버튼을 안 기다린다.** 원작이 `Text_IsPrinterActive`만 보고 곧바로
// 7번으로 넘어간다 — 다 찍히면 저절로 갈린다.
//
// ⚠️ **관절 애니는 아직 안 굽는다.** 가방이 열리는 `psel_all`(41프레임)과 고른
// 볼이 흔들리는 `psel_mb_*`(73프레임)가 그것이다. 지금은 그 **길이만큼** 덮인
// 모델을 두었다가 열린 모델로 갈아 끼운다 — 박자는 원작과 같고 도중의 움직임만
// 없다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDialogueBank } from '../../data/gameData'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { fieldScripts } from '../../engine/script/field'
import { SFX } from '../../engine/audio/sfx'
import { setStarterChoice } from '../../scene/fieldServices'
import { resetStarterScene, starterScene } from '../../scene/field/starterRefs'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { STARTER_BANK, STARTER_TEXT as TEXT, STARTERS } from './starterChoice'
import { BAG_NOISE_DELAY, CAMERA_FRAMES, CURSOR_DELAY, FRAME_MS, OPEN_FRAMES } from './starterScene'
import * as css from './chooseStarter.css'

/** `Menu_MakeYesNoChoice` — 위가 "예"다 */
const MENU_YES = 0

/**
 * 원작 `ChoiceStep` · `ChooseStarterStep`을 한 줄로 편 것.
 *
 * 원작은 두 층(큰 단계 여섯 · 그 안의 작은 단계)인데, 실제로 갈라지는 자리는
 * 이 여섯뿐이다. 이름은 원작 것을 그대로 쓴다
 */
type Step =
  /** `CHOICE_STEP_BLEND_BGS` → `PLAY_BAG_NOISE`. 36프레임 기다렸다 소리를 낸다 */
  | 'blend'
  /** `CHOICE_STEP_SHOW_3D_GRAPHICS`. 가방이 열린다 (`psel_all` 41프레임) */
  | 'opening'
  /** 카메라가 6프레임에 옮겨 가고 6프레임 더 쉰다 */
  | 'camera'
  /** 0번 글. 다 찍히면 저절로 넘어간다 */
  | 'intro'
  /** 7번 글 → 커서가 뜨고 고를 수 있다 */
  | 'choose'
  /** 미리보기가 뜨고 "이 포켓몬으로 하겠느냐?" */
  | 'confirm'

/** 글을 찍는 단계인가 — 아니면 창을 비워 둔다 */
const PRINTING: ReadonlySet<Step> = new Set<Step>(['intro', 'choose', 'confirm'])

export function ChooseStarter() {
  const locale = useGameLocale()
  const closeAll = useMenuStore((s) => s.closeAll)
  const [bank, setBank] = useState<readonly string[]>([])
  const [step, setStep] = useState<Step>('blend')
  const [pick, setPick] = useState(0)
  const [answer, setAnswer] = useState(MENU_YES)
  const [text, setText] = useState('')
  /** 지금 글을 다 찍었나. 고를 것은 이때만 뜬다 */
  const [ready, setReady] = useState(false)
  /** 커서를 띄웠나. `choose` 글을 다 찍은 뒤다 */
  const [live, setLive] = useState(false)
  /** 미리보기 그림. 커서를 옮기면 바뀐다 */
  const printer = useRef<MessagePrinter | null>(null)
  const slots = useRef(new MessageSlots())

  useEffect(() => {
    resetStarterScene()
    return () => {
      resetStarterScene()
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadDialogueBank(locale, STARTER_BANK)
      .then((lines) => {
        if (alive) setBank(lines)
      })
      .catch(() => {
        /* 글이 비어도 고를 수는 있다 */
      })
    return () => {
      alive = false
    }
  }, [locale])

  /** 지금 창에 올릴 글 */
  const showing = useMemo((): string => {
    if (!PRINTING.has(step)) return ''
    const at =
      step === 'intro'
        ? TEXT.pokeBalls
        : step === 'confirm'
          ? TEXT.firstChoice + pick
          : TEXT.nowChoose
    // 끝의 새 쪽 표지는 뗀다 — "버튼을 기다렸다 창을 닫아라"는 뜻이라
    // 이 화면에는 해당이 없다
    return (bank[at] ?? '').replace(/[\r\f]+$/, '')
  }, [step, pick, bank])

  useEffect(() => {
    printer.current = new MessagePrinter(showing, slots.current)
    setText('')
    setReady(false)
  }, [showing])

  // 무대(3D)에 지금 상태를 넘긴다. React 상태로 이으면 프레임마다 다시 그린다
  useEffect(() => {
    starterScene.pick = pick
  }, [pick])
  useEffect(() => {
    starterScene.cursorShown = live
  }, [live])
  useEffect(() => {
    starterScene.confirming = step === 'confirm'
  }, [step])

  /**
   * 기다리는 단계를 굴린다.
   *
   * 원작 프레임 수를 그대로 쓴다 — 가방 소리가 36프레임 뒤에 나고, 가방이
   * 41프레임에 걸쳐 열리고, 카메라가 6프레임에 옮겨 간 뒤 6프레임을 더 쉰다
   */
  useEffect(() => {
    if (step === 'blend') {
      const id = setTimeout(() => {
        fieldScripts.services.sound?.playEffect(SFX.BAG_OPEN)
        setStep('opening')
      }, BAG_NOISE_DELAY * FRAME_MS)
      return () => {
        clearTimeout(id)
      }
    }
    if (step === 'opening') {
      const id = setTimeout(() => {
        starterScene.opened = true
        starterScene.camera = 'choose'
        starterScene.cameraSince = 0
        setStep('camera')
      }, OPEN_FRAMES * FRAME_MS)
      return () => {
        clearTimeout(id)
      }
    }
    if (step === 'camera') {
      const id = setTimeout(
        () => {
          setStep('intro')
        },
        (CAMERA_FRAMES + CURSOR_DELAY) * FRAME_MS,
      )
      return () => {
        clearTimeout(id)
      }
    }
    return undefined
  }, [step])

  useEffect(() => {
    let raf = 0
    let last = ''
    let before = performance.now()
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const now = performance.now()
      if (starterScene.camera === 'choose') starterScene.cameraSince += now - before
      before = now
      const p = printer.current
      if (p === null) return
      p.tick({ pressed: false, held: false })
      const shown = printedText(p)
      if (shown !== last) {
        last = shown
        setText(shown)
      }
      // ⚠️ **이 화면은 인쇄기에 누름을 안 넘긴다.** 그래서 `finished`만 보면
      // 끝에서 기다리는 상태에서 영영 안 열린다 — 다 보여 준 것도 「다 됐다」다
      const done = p.finished || p.waiting === 'end'
      setReady((r) => (r === done ? r : done))
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])

  // 0번은 **다 찍히면 저절로** 7번으로 갈린다 (`CHOOSE_STARTER_STEP_DELETE_…`)
  useEffect(() => {
    if (step === 'intro' && ready && showing !== '') setStep('choose')
  }, [step, ready, showing])

  // 7번을 다 찍으면 커서가 뜬다 (`CHOOSE_STARTER_STEP_SHOW_CURSOR`)
  useEffect(() => {
    if (step === 'choose' && ready) setLive(true)
  }, [step, ready])

  /** 볼을 골랐다. 원작은 미리보기가 다 뜬 뒤에 그 포켓몬이 운다 */
  const choose = useCallback((at: number): void => {
    setPick(at)
    setAnswer(MENU_YES)
    setLive(false)
    setStep('confirm')
    fieldScripts.services.sound?.playCry(STARTERS[at] ?? 0)
  }, [])

  const move = useCallback(
    (by: number): void => {
      if (step !== 'choose' || !live) return
      setPick((c) => {
        const next = clampCursor(c, by, STARTERS.length)
        // `ChangePokeballChoice` — 끝에서 더 밀면 소리가 안 난다
        if (next !== c) fieldScripts.services.sound?.playEffect(SFX.MENU)
        return next
      })
    },
    [step, live],
  )

  const confirm = useCallback((): void => {
    if (step === 'choose') {
      if (!live) return
      fieldScripts.services.sound?.playEffect(SFX.MENU)
      choose(pick)
      return
    }
    if (step !== 'confirm' || !ready) return
    if (answer !== MENU_YES) {
      setStep('choose')
      setLive(true)
      return
    }
    setStarterChoice(STARTERS[pick] ?? 0)
    closeAll()
  }, [step, live, ready, pick, answer, choose, closeAll])

  useMenuKeys({
    left: () => {
      move(-1)
    },
    right: () => {
      move(1)
    },
    up: () => {
      if (step === 'confirm') setAnswer(0)
    },
    down: () => {
      if (step === 'confirm') setAnswer(1)
    },
    confirm,
    // ⚠️ **물러날 자리가 없다.** 원작도 이 화면에서는 안 고르고 나갈 수 없다 —
    // 스크립트가 고른 결과를 기다리며 서 있기 때문이다. 확인 창에서만 되돌아간다
    cancel: () => {
      if (step === 'confirm') {
        setStep('choose')
        setLive(true)
      }
    },
  })

  return (
    <div className={css.wrap}>
      {/*
        미리보기 창 (`StarterPreviewWindow`). 확인을 물을 때만 열린다 —
        커서를 옮기는 동안에는 볼만 보인다
      */}

      {text !== '' && (
        <div className={css.box} role="status">
          {stripTags(text)}
          {step === 'confirm' && ready && (
            <div className={css.menu} role="radiogroup" aria-label="예 아니오">
              {['예', '아니오'].map((label, at) => (
                <div
                  key={label}
                  role="radio"
                  aria-checked={answer === at}
                  className={answer === at ? css.itemOn : css.item}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * `{COLOR n}` 같은 제어 표시를 뗀다.
 *
 * 이 뱅크의 1~3번이 분류와 이름에 색을 입히는데, 우리 창은 한 색이라 표시만
 * 남으면 글자로 보인다. 색은 **아직 안 쓴다** — 원작 팔레트 번호라 그대로
 * 옮길 수 없고, 잘못된 색을 지어내느니 안 칠하는 쪽이 낫다
 */
function stripTags(s: string): string {
  return s.replace(/\{[^}]*\}/g, '')
}
