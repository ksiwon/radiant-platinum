// 메뉴 창 안의 3D 포켓몬 (SYSTEM §2.4). 구멍 하나다 — 창 얼굴에 뚫린 직사각 구멍 뒤로 메인 프레임 뒤의 시저 패스
// (`scene/monViewportPass`)가 포켓몬 한 마리를 그린다.
//
// 이 부품이 하는 일:
//   ① 마운트하면 `state/monViewportStore`에 구멍 요소와 `{species, form, gender, shiny}`를 올린다
//   ② 몸이 서면(`viewportMode === 'model'`) 창 얼굴과 덮개에 구멍을 낸다 (`--hole-*` · `HOLE_MASK`)
//   ③ 못 서면 구멍을 **안 내고** `{key}_front.png`를 도트 3배(240)로 이 상자 안에 그린다. 안 본 칸은 「?」다
//
// 쓰는 화면은 `<MenuScreen hole>`로 창 얼굴 층(`screenHole`)을 켜 둬야 한다. 덮개(`overlayHole`)는 이 부품이 단다 —
// `MenuScreen`은 덮개의 구멍을 모른다.
//
// 계약: 글자 0, `aria-hidden`, `role` 없음. 구멍은 CSS 320×320 이하다. 이름 같은 글은 구멍 **밖**에 둔다.
import { useEffect, useMemo, useReducer, useRef } from 'react'
import { pinAtlas } from '../../data/providers/atlas'
import type { SpriteSheet } from '../../data/spriteSheet'
import { holeRect } from '../../scene/monViewportMath'
import {
  specKey, useMonViewportStore, viewportMode, type MonGender, type MonViewportSpec,
} from '../../state/monViewportStore'
import { useRendererStore } from '../../state/rendererStore'
import { overlayHole } from '../menu/menuChrome.css'
import { PIXEL, type PixelScale } from '../theme/scale'
import * as css from './monViewport.css'
import { pixelSprite } from './pixelSprite'

export interface MonViewportProps {
  /** 종족 번호. 안 본 칸이면 `null`이고 이때는 「?」를 그린다 (PV) */
  species: number | null
  form?: number
  gender?: MonGender
  shiny?: boolean
  /** 구멍의 한 변(px). 320을 넘지 않는다 */
  size?: number
}

/** 구멍의 한 변 상한 (CSS px) */
export const VIEWPORT_MAX = 320

/** 원본 앞모습 한 장의 크기 (`data/pokemon/{key}_front.png`) */
const FRONT = 80

/** 앞모습 한 장짜리 시트. 정수배는 `pixelSprite`가 지킨다 */
function frontSheet(species: number, form: number): SpriteSheet {
  const suffix = form > 0 ? `_${String(form)}` : ''
  return { path: `data/pokemon/${String(species)}_front${suffix}.png`, cellW: FRONT, cellH: FRONT, cols: 1, rows: 1 }
}

/** 구멍 한 변에 들어가는 가장 큰 정수배 (3배가 기준 — 240) */
export function spriteScale(side: number): PixelScale {
  if (side >= FRONT * PIXEL.x3) return PIXEL.x3
  if (side >= FRONT * PIXEL.x2) return PIXEL.x2
  return PIXEL.x1
}

/** 창 요소를 찾는다 — 덮개(`position: fixed`)의 바로 아래 자식이다. 못 찾으면 null (구멍은 안 낸다) */
function findWindow(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node?.parentElement) {
    const parent: HTMLElement = node.parentElement
    if (parent === document.body) return null
    if (getComputedStyle(parent).position === 'fixed') return node
    node = parent
  }
  return null
}

export function MonViewport({ species, form = 0, gender = 'none', shiny = false, size = 240 }: MonViewportProps) {
  const side = Math.min(VIEWPORT_MAX, size)
  const ref = useRef<HTMLDivElement>(null)
  const spec = useMemo<MonViewportSpec | null>(
    () => (species === null ? null : { species, form, gender, shiny }),
    [species, form, gender, shiny],
  )
  const key = spec === null ? null : specKey(spec)

  const live = useRendererStore((s) => s.phase === 'live')
  const sceneCrashed = useRendererStore((s) => s.fault === 'scene')
  const broken = useMonViewportStore((s) => s.broken)
  const shown = useMonViewportStore((s) => s.shown)
  const mode = viewportMode({ spec, rendererLive: live, crashed: sceneCrashed || broken, shown })

  // ① 구멍을 올린다. 안 본 칸에는 몸이 없으니 올리지 않는다
  const token = useRef<number | null>(null)
  const specRef = useRef(spec)
  specRef.current = spec
  const hasBody = spec !== null
  useEffect(() => {
    const el = ref.current
    if (!hasBody || !el) return
    const claimed = useMonViewportStore.getState().claim(el, findWindow(el), specRef.current!)
    token.current = claimed
    return () => {
      useMonViewportStore.getState().release(claimed)
      token.current = null
    }
  }, [hasBody])
  useEffect(() => {
    if (token.current !== null && spec !== null) useMonViewportStore.getState().retarget(token.current, spec)
  }, [key, spec])

  // ② 구멍을 낸다
  const cut = mode === 'model'
  useEffect(() => {
    const el = ref.current
    if (!cut || !el) return
    return openHole(el)
  }, [cut])

  // ③ 2D 앞모습 — 그림은 한 번 잡아 두고(`pinAtlas`) 와서 다시 그린다
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  const sheet = useMemo(() => (spec === null ? null : frontSheet(spec.species, spec.form)), [spec])
  useEffect(() => {
    if (sheet === null || mode !== 'sprite') return
    let alive = true
    void pinAtlas(sheet.path).then(() => { if (alive) repaint() }).catch(() => { /* 그림 없는 칸으로 선다 */ })
    return () => { alive = false }
  }, [sheet, mode])

  return (
    <div className={css.viewport} aria-hidden data-mon-viewport={mode} ref={ref} style={{ width: side, height: side }}>
      {mode === 'sprite' && sheet !== null && (
        <div className={css.sprite} style={pixelSprite(sheet, 0, spriteScale(side))} />
      )}
      {mode === 'unseen' && <div className={css.unseen} />}
    </div>
  )
}

/**
 * 구멍을 낸다 — 창 얼굴 층에는 창 기준 `--hole-x/y/w/h`, 덮개에는 화면 기준 `--hole-vx/vy`와 같은 크기를 건다.
 * 창이 올라오며 열리는 동안(`riseIn`) 덮개 쪽 좌표가 움직이므로, 자리가 안 변할 때까지 프레임마다 읽는다.
 * 돌려주는 함수가 구멍을 닫는다.
 */
function openHole(el: HTMLElement): () => void {
  const win = findWindow(el)
  if (win === null) return () => undefined
  const overlay = win.parentElement
  if (overlay === null) return () => undefined
  overlay.classList.add(overlayHole)

  let last = ''
  let raf = 0
  let stable = 0
  const write = (): boolean => {
    const rect = el.getBoundingClientRect()
    const at = holeRect(rect, win.getBoundingClientRect(), { left: win.clientLeft, top: win.clientTop })
    const sig = `${String(at.x)}|${String(at.y)}|${String(at.w)}|${String(at.h)}|${String(rect.left)}|${String(rect.top)}`
    if (sig === last) return false
    last = sig
    win.style.setProperty('--hole-x', `${String(at.x)}px`)
    win.style.setProperty('--hole-y', `${String(at.y)}px`)
    win.style.setProperty('--hole-w', `${String(at.w)}px`)
    win.style.setProperty('--hole-h', `${String(at.h)}px`)
    overlay.style.setProperty('--hole-vx', `${String(rect.left)}px`)
    overlay.style.setProperty('--hole-vy', `${String(rect.top)}px`)
    overlay.style.setProperty('--hole-w', `${String(at.w)}px`)
    overlay.style.setProperty('--hole-h', `${String(at.h)}px`)
    return true
  }
  const loop = (): void => {
    stable = write() ? 0 : stable + 1
    // 열리는 움직임이 끝나고도 몇 프레임 더 본다
    raf = stable < 20 ? requestAnimationFrame(loop) : 0
  }
  const kick = (): void => {
    stable = 0
    if (raf === 0) raf = requestAnimationFrame(loop)
  }
  kick()
  window.addEventListener('resize', kick)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(kick)
  observer?.observe(el)
  return () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    window.removeEventListener('resize', kick)
    observer?.disconnect()
    overlay.classList.remove(overlayHole)
    for (const name of ['--hole-x', '--hole-y', '--hole-w', '--hole-h']) win.style.removeProperty(name)
    for (const name of ['--hole-vx', '--hole-vy', '--hole-w', '--hole-h']) overlay.style.removeProperty(name)
  }
}
