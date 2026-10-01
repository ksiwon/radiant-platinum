// 게임코너 슬롯머신 (PARITY §7.6)
//
// 원작은 두 화면이다 — 위가 기계(릴 · CREDIT · PAYOUT), 아래가 달밤과 삐삐. 한 화면에서는 **나란히** 놓는다
// (왼쪽 기계 · 오른쪽 달밤). 두 판 다 원작 256×192를 정수배로 키운다.
//
// 자판은 우리 약속을 따른다 (`engine/input/keys`) — A Space·Z · B X · Y F · DS의 X는 C · 아래 S·↓ · START Esc.
// 원작 기계 앞면의 「Ⓧ INSERT COINS · ✚ SPIN · START EXIT」과 릴 아래 Y · B · A가 그 단추다.
//
// 한 프레임 = 원작 한 프레임(60Hz). 엔진 → 무대 → 그리기 차례로 돈다
import { useEffect, useRef, useState } from 'react'
import { loadDialogueBank, loadSlotSprites, SLOT_BG_ATLAS, SLOT_SPRITE_ATLAS } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'
import type { SlotSprites } from '../../data/schema'
import { music } from '../../engine/audio/music'
import { fieldBgm } from '../../engine/audio/songs'
import {
  SLOT_BGM, SlotMachine, SlotMusic, type SlotButton, type SlotMessage,
} from '../../engine/gameCorner/slotMachine'
import { markSlot } from '../../app/sceneMark'
import { gameLocale } from '../../state/optionsStore'
import { useSlotStore } from '../../state/slotStore'
import { SCREEN_H, SCREEN_W, SlotStage } from './slot/slotStage'
import * as css from './slotScreen.css'

/** `TEXT_BANK_UNK_0544` — 슬롯의 말 셋 */
const BANK_SLOT = 544
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
  const session = useSlotStore((s) => s.session)
  const mainRef = useRef<HTMLCanvasElement>(null)
  const subRef = useRef<HTMLCanvasElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [scale, setScale] = useState(2)
  const [failed, setFailed] = useState<string | null>(null)

  // 정수배로 키운다 — 두 판을 나란히 놓고 창에 들어가는 가장 큰 배수
  useEffect(() => {
    const fit = (): void => {
      const s = Math.max(1, Math.floor(Math.min((window.innerWidth - 48) / (SCREEN_W * 2 + 16), (window.innerHeight - 120) / SCREEN_H)))
      setScale(s)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit) }
  }, [])

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
  const w = SCREEN_W * scale, h = SCREEN_H * scale
  return (
    <div className={css.overlay}>
      <div className={css.stage}>
        <div className={css.screen} style={{ width: w, height: h }}>
          <canvas ref={mainRef} width={SCREEN_W} height={SCREEN_H} className={css.canvas} style={{ width: w, height: h }} />
          {message !== null && <div className={css.message} style={{ fontSize: 8 * scale }}>{message}</div>}
        </div>
        <canvas ref={subRef} width={SCREEN_W} height={SCREEN_H} className={css.canvas} style={{ width: w, height: h }} />
      </div>
      {failed !== null && <div className={css.failed}>{failed}</div>}
      <div className={css.legend}>C 코인 · S 레버 · F / X / Space 왼 · 가운데 · 오른 릴 · Esc 그만두기</div>
    </div>
  )
}
