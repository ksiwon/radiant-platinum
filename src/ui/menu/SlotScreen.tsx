// 게임코너 슬롯머신 (PARITY §7.6)
//
// 원작은 두 화면이다 — 위가 기계(릴 · CREDIT · PAYOUT), 아래가 달밤과 삐삐. 한 화면에서는 **나란히** 놓는다
// (왼쪽 기계 · 오른쪽 달밤). 기계는 원작 256×192를 **정수 2배**로, 달밤은 1배로 둔다(결정). 배수는 창 본문의 크기에서
// 거꾸로 정한다 (`slotScale`) — 한때 창 크기에서 식을 세워 960×640에서 1배로 떨어졌고 화면의 70%가 빈 검정이었다.
//
// 창은 `MenuScreen`이 그린다(머리 · 바닥 안내). 기계 그림은 엔진이 그리는 원작 도트라 건드리지 않는다.
//
// 동전 · 지불 · 보너스 숫자는 기계 그림이 스스로 그린다(CREDIT · PAYOUT · 보너스 칸). 글로 또 적지 않는다 — 머리의 동전 수만
// `ref`로 직접 쓴다. 값은 엔진이 60Hz로 바꾸는데 React 상태에 올리면 프레임이 떨어진다 (`markSlot`이 문서 표식을 다는 것과 같은 방식).
//
// 자판은 우리 약속을 따른다 (`engine/input/keys`) — A Space·Z · B X · Y F · DS의 X는 C · 아래 S·↓ · START Esc.
// 원작 기계 앞면의 「Ⓧ INSERT COINS · ✚ SPIN · START EXIT」과 릴 아래 Y · B · A가 그 단추다. 키 안내는 바닥 줄 하나다.
//
// 한 프레임 = 원작 한 프레임(60Hz). 엔진 → 무대 → 그리기 차례로 돈다
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  loadDialogueBank, loadLocationNames, loadSlotSprites, SLOT_BG_ATLAS, SLOT_SPRITE_ATLAS,
} from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'
import type { SlotSprites } from '../../data/schema'
import { music } from '../../engine/audio/music'
import { fieldBgm } from '../../engine/audio/songs'
import {
  SLOT_BGM, SlotMachine, SlotMusic, type SlotButton, type SlotMessage,
} from '../../engine/gameCorner/slotMachine'
import { markSlot } from '../../app/sceneMark'
import { gameLocale, useGameLocale } from '../../state/optionsStore'
import { useSlotStore } from '../../state/slotStore'
import { slotFoot, slotScale } from './facilitiesText'
import { MenuScreen } from './MenuScreen'
import { SCREEN_H, SCREEN_W, SlotStage } from './slot/slotStage'
import * as css from './slotScreen.css'

/** `TEXT_BANK_UNK_0544` — 슬롯의 말 셋 */
const BANK_SLOT = 544
/** `MAP_HEADER_GAME_CORNER`의 지명 번호 — 제목이 이 이름이다 */
const LOCATION_GAME_CORNER = 102
const FRAME_MS = 1000 / 60

/** 자판 → DS 단추 */
const KEYS: Record<string, SlotButton> = {
  Space: 'a', KeyZ: 'a', Enter: 'a',
  KeyX: 'b', Backspace: 'b',
  KeyF: 'y',
  KeyC: 'x',
  KeyS: 'down', ArrowDown: 'down',
  Escape: 'start',
}

interface Assets {
  data: SlotSprites
  bg: Uint8ClampedArray
  atlas: HTMLCanvasElement
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { resolve(img) }
    img.onerror = () => { reject(new Error(`${url}을 못 읽었다`)) }
    img.src = url
  })
}

async function loadAssets(): Promise<Assets> {
  const data = await loadSlotSprites()
  const [bgImg, atlasImg] = await Promise.all([loadImage(atlasUrl(SLOT_BG_ATLAS)), loadImage(atlasUrl(SLOT_SPRITE_ATLAS))])
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = bgImg.width; bgCanvas.height = bgImg.height
  const bctx = bgCanvas.getContext('2d', { willReadFrequently: true })!
  bctx.drawImage(bgImg, 0, 0)
  const atlas = document.createElement('canvas')
  atlas.width = atlasImg.width; atlas.height = atlasImg.height
  atlas.getContext('2d')!.drawImage(atlasImg, 0, 0)
  return { data, bg: bctx.getImageData(0, 0, bgImg.width, bgImg.height).data, atlas }
}

export function SlotScreen() {
  const locale = useGameLocale()
  const session = useSlotStore((s) => s.session)
  const mainRef = useRef<HTMLCanvasElement>(null)
  const subRef = useRef<HTMLCanvasElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** 판독부 — 값이 바뀔 때만 글자를 갈아 끼운다 (60Hz `setState` 금지) */
  const coinsNote = useRef<HTMLSpanElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [scale, setScale] = useState(2)
  const [failed, setFailed] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const open = session !== null

  useEffect(() => {
    let alive = true
    void loadLocationNames(locale)
      .then((places) => { if (alive) setTitle(places[LOCATION_GAME_CORNER] ?? '') })
      .catch(() => { /* 이름 없이도 화면은 돈다 */ })
    return () => { alive = false }
  }, [locale])

  // 정수배로 키운다 — **본문 칸**에서 거꾸로 정한다 (창은 `SCREEN`을 넘지 않으므로 화면 크기가 아니다)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!open || !body) return undefined
    const fit = (): void => { setScale(slotScale(body.clientWidth, body.clientHeight)) }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(body)
    return () => { watch.disconnect() }
  }, [open])

  useEffect(() => {
    if (!session) return
    let alive = true
    let raf = 0
    const pressed = new Set<SlotButton>()
    const held = new Set<SlotButton>()
    const onDown = (e: KeyboardEvent): void => {
      const b = KEYS[e.code]
      if (b === undefined) return
      e.preventDefault(); e.stopPropagation()
      if (!e.repeat) pressed.add(b)
      held.add(b)
    }
    const onUp = (e: KeyboardEvent): void => {
      const b = KEYS[e.code]
      if (b === undefined) return
      e.preventDefault(); e.stopPropagation()
      held.delete(b)
    }
    // ⚠️ **창을 떠나면 손을 뗀 것으로 친다.** 창 밖에서 뗀 키는 `keyup`이 안 와서
    // `held`에 남고, 그러면 지불이 빨라진 채로 돈다(`held` 마스크). 필드 키도 같은
    // 자리에서 비운다 (`engine/input/keys`의 `attachKeyboard`)
    const release = (): void => { held.clear(); pressed.clear() }
    const onHide = (): void => { if (document.hidden) release() }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', onHide)

    // 머리의 동전 수 — 마지막으로 쓴 값과 다를 때만 글자를 갈아 끼운다. 기계의 CREDIT · PAYOUT · 보너스 숫자는
    // 기계 그림이 스스로 그린다(`slotStage`) — 같은 값을 글로 또 적지 않는다
    let shownCoins = NaN
    const paint = (coins: number): void => {
      if (coins === shownCoins) return
      shownCoins = coins
      if (coinsNote.current) coinsNote.current.textContent = String(coins)
    }
    paint(session.coins)

    void Promise.all([loadAssets(), loadDialogueBank(gameLocale(), BANK_SLOT)]).then(([assets, lines]) => {
      if (!alive) return
      const mainCtx = mainRef.current?.getContext('2d')
      const subCtx = subRef.current?.getContext('2d')
      if (!mainCtx || !subCtx) return
      const reelLayer = document.createElement('canvas')
      reelLayer.width = SCREEN_W; reelLayer.height = SCREEN_H
      const stage = new SlotStage(assets.data, {
        sound: (seq) => { void music.playEffect(seq) },
        cry: (species) => { void music.playCry(species) },
        music: (which) => {
          // 원작은 필드 곡을 멈춰 두고 보너스 곡을 튼다 — 끝나면 필드 곡을 다시 (`ov101_021D18F4`)
          fieldBgm.override = which === SlotMusic.PRE_BONUS ? SLOT_BGM.preBonus
            : which === SlotMusic.BONUS ? SLOT_BGM.bonus : null
        },
        message: (which: SlotMessage) => { setMessage(lines[which] ?? '') },
        closeMessage: () => { setMessage(null) },
      })
      const machine = new SlotMachine(session.coins, session.setting, () => Math.floor(Math.random() * 0x10000), stage)
      stage.pointing = {
        order: [],
        stopped: () => machine.stoppedCount(),
      }
      let last = performance.now()
      let acc = 0
      const loop = (now: number): void => {
        if (!alive) return
        raf = requestAnimationFrame(loop)
        acc += Math.min(now - last, 100)
        last = now
        while (acc >= FRAME_MS) {
          acc -= FRAME_MS
          const input = { pressed: new Set(pressed), held: ['a', 'b', 'x', 'y'].some((b) => held.has(b as SlotButton)) }
          pressed.clear()
          machine.tick(input)
          stage.pointing = { order: machine.bonusOrderKeys(), stopped: () => machine.stoppedCount() }
          stage.credit = machine.coins
          stage.payoutShown = machine.payout
          stage.spinsLeft = machine.spinsLeft
          stage.bonusCoins = machine.bonusCoins
          stage.tick(machine.streak)
          paint(machine.coins)
          markSlot({ state: machine.state, coins: machine.coins, streak: machine.inBonus ? machine.streak : 0 })
          if (machine.finished) {
            markSlot(null)
            fieldBgm.override = null
            useSlotStore.getState().close(machine.outcome())
            return
          }
        }
        stage.draw(mainCtx, subCtx, assets.bg, assets.atlas, reelLayer, {
          pos: machine.pos, bounce: machine.bounceY, symbol: (reel, row) => machine.stripSymbol(reel, row),
        })
      }
      raf = requestAnimationFrame(loop)
    }).catch((e: unknown) => { setFailed(e instanceof Error ? e.message : String(e)) })

    return () => {
      alive = false
      markSlot(null)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [session])

  if (!session) return null
  const w = SCREEN_W * scale
  const h = SCREEN_H * scale
  return (
    <MenuScreen
      title={title}
      note={<><span ref={coinsNote} />{'\u00a0'}</>}
      foot={slotFoot(locale)}
    >
      <div className={css.body} ref={bodyRef}>
        <div className={css.machineCol}>
          <div className={css.screen} style={{ width: w, height: h }}>
            <canvas ref={mainRef} width={SCREEN_W} height={SCREEN_H} className={css.canvas} style={{ width: w, height: h }} />
            {message !== null && <div className={css.message}>{message}</div>}
          </div>
        </div>
        <div className={css.sideCol}>
          <canvas ref={subRef} width={SCREEN_W} height={SCREEN_H} className={css.canvas} style={{ width: SCREEN_W, height: SCREEN_H }} />
          {failed !== null && <div className={css.failed}>{failed}</div>}
        </div>
      </div>
    </MenuScreen>
  )
}
