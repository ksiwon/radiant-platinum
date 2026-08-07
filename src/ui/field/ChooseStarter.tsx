// 파트너를 고르는 화면 (`choose_starter/choose_starter_app.c`).
//
// 스크립트가 아니라 **따로 도는 프로그램**이라 바이트코드가 없다. 그래서 상태
// 기계를 여기 옮긴다 — 원작 단계 이름을 그대로 남겨 두어 나중에 무엇을
// 빠뜨렸는지 대조할 수 있게 한다.
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
// ⚠️ **그림이 원작과 다르다.** 원작은 `EV_POKESELECT`의 3D 모델과 NSBCA인데
// 우리는 그것을 아직 못 뽑았다. 대신 롬에서 이미 뽑아 둔 것만 쓴다 —
// 서류가방은 오버월드 스프라이트 174번, 볼은 도구 아이콘 4번, 미리보기는
// 포켓몬 앞모습. 배치와 순서·소리·글은 원작 그대로다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDialogueBank, loadItemIcons } from '../../data/gameData'
import type { ItemIcons } from '../../data/schema'
import { MessagePrinter, printedText } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'
import { fieldScripts } from '../../engine/script/field'
import { setStarterChoice } from '../../scene/fieldServices'
import { textSpeedFrames, useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { itemIcon } from '../menu/itemIcon'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { STARTER_BANK, STARTER_TEXT as TEXT, STARTERS } from './starterChoice'
import * as css from './chooseStarter.css'

/** `generated/items.txt` — 볼 그림은 몬스터볼 아이콘이다 */
const ITEM_POKE_BALL = 4

/** 오버월드 스프라이트 174번 `BRIEFCASE`. 마박사가 두고 간 그 가방이다 */
const BRIEFCASE_GFX = 174

/** `Menu_MakeYesNoChoice` — 위가 "예"다 */
const MENU_YES = 0

type Step =
  /** 0번 글을 찍는 중. 다 찍히면 저절로 넘어간다 */
  | { kind: 'intro' }
  /** 볼을 고른다 */
  | { kind: 'choose' }
  /** 미리보기가 뜨고 "이 포켓몬으로 하겠느냐?" */
  | { kind: 'confirm' }

export function ChooseStarter() {
  const locale = useGameLocale()
  const closeAll = useMenuStore((s) => s.closeAll)
  const [bank, setBank] = useState<readonly string[]>([])
  const [icons, setIcons] = useState<ItemIcons>()
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [pick, setPick] = useState(0)
  const [answer, setAnswer] = useState(MENU_YES)
  const [text, setText] = useState('')
  /** 지금 글을 다 찍었나. 고를 것은 이때만 뜬다 */
  const [ready, setReady] = useState(false)
  const printer = useRef<MessagePrinter | null>(null)
  const slots = useRef(new MessageSlots())

  useEffect(() => {
    let alive = true
    void loadDialogueBank(locale, STARTER_BANK)
      .then((lines) => { if (alive) setBank(lines) })
      .catch(() => { /* 글이 비어도 고를 수는 있다 */ })
    void loadItemIcons()
      .then((v) => { if (alive) setIcons(v) })
      .catch(() => { /* 볼 그림만 빈다 */ })
    return () => { alive = false }
  }, [locale])

  /** 지금 창에 올릴 글 */
  const showing = useMemo((): string => {
    const at = step.kind === 'intro' ? TEXT.pokeBalls
      : step.kind === 'confirm' ? TEXT.firstChoice + pick
        : TEXT.nowChoose
    // 끝의 새 쪽 표지는 뗀다 — "버튼을 기다렸다 창을 닫아라"는 뜻이라
    // 이 화면에는 해당이 없다
    return (bank[at] ?? '').replace(/[\r\f]+$/, '')
  }, [step.kind, pick, bank])

  useEffect(() => {
    printer.current = new MessagePrinter(showing, slots.current, {
      speed: textSpeedFrames(), canSkip: true, autoScroll: false,
    })
    setText('')
    setReady(false)
  }, [showing])

  // 0번은 **다 찍히면 저절로** 7번으로 갈린다 (`CHOOSE_STARTER_STEP_DELETE_…`)
  useEffect(() => {
    if (step.kind === 'intro' && ready && showing !== '') setStep({ kind: 'choose' })
  }, [step.kind, ready, showing])

  useEffect(() => {
    let raf = 0
    let last = ''
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const p = printer.current
      if (p === null) return
      p.tick({ pressed: false, held: false })
      const now = printedText(p)
      if (now !== last) { last = now; setText(now) }
      setReady((r) => (r === p.finished ? r : p.finished))
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  /** 볼을 골랐다. 원작은 이때 그 포켓몬이 운다 */
  const choose = useCallback((at: number): void => {
    setPick(at)
    setAnswer(MENU_YES)
    setStep({ kind: 'confirm' })
    fieldScripts.services.sound?.playCry(STARTERS[at] ?? 0)
  }, [])

  const confirm = useCallback((): void => {
    if (step.kind === 'intro') return
    if (step.kind === 'choose') { choose(pick); return }
    if (answer !== MENU_YES) { setStep({ kind: 'choose' }); return }
    setStarterChoice(STARTERS[pick] ?? 0)
    closeAll()
  }, [step.kind, pick, answer, choose, closeAll])

  useMenuKeys({
    left: () => {
      if (step.kind === 'choose') setPick((c) => clampCursor(c, -1, STARTERS.length))
    },
    right: () => {
      if (step.kind === 'choose') setPick((c) => clampCursor(c, 1, STARTERS.length))
    },
    up: () => { if (step.kind === 'confirm') setAnswer(0) },
    down: () => { if (step.kind === 'confirm') setAnswer(1) },
    confirm,
    // ⚠️ **물러날 자리가 없다.** 원작도 이 화면에서는 안 고르고 나갈 수 없다 —
    // 스크립트가 고른 결과를 기다리며 서 있기 때문이다. 확인 창에서만 되돌아간다
    cancel: () => { if (step.kind === 'confirm') setStep({ kind: 'choose' }) },
  })

  const previewAt = step.kind === 'confirm' ? pick : null

  return (
    <div className={css.wrap}>
      <div className={css.stage}>
        <div
          className={css.briefcase}
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}data/npc/${String(BRIEFCASE_GFX)}.png)` }}
          aria-hidden
        />
        <div className={css.balls}>
          {STARTERS.map((species, at) => (
            <div key={species} className={at === pick && step.kind !== 'intro' ? css.ballOn : css.ball}>
              <div style={itemIcon(icons, ITEM_POKE_BALL, 64)} aria-hidden />
              {at === pick && step.kind === 'choose' && <div className={css.cursor} aria-hidden>▼</div>}
            </div>
          ))}
        </div>
        {previewAt !== null && (
          <div
            className={css.preview}
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}data/pokemon/${String(STARTERS[previewAt])}_front.png)`,
            }}
            aria-hidden
          />
        )}
      </div>

      <div className={css.box} role="status">
        {stripTags(text)}
        {step.kind === 'confirm' && ready && (
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
