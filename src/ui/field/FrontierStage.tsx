// 배틀프런티어 시설 장면의 무대 (PARITY §9.3 · `scene/factoryScene` · `scene/factoryStage`)
//
// 장면이 도는 동안 필드를 가리고 원작 화면 한 장(256×192)을 그린다 — 복도 판(바닥이 도는 BG2 위에 BG3)이나 배틀룸 판,
// 그 위에 걷는 사람, 맨 위에 암전. 화면 비율 그대로 창 높이에 맞춰 키운다(픽셀은 뭉개지 않는다).
// 빌리기 · 바꾸기 화면과 대사창은 그 위에 따로 뜬다. 배틀 동안은 무대를 걷는다 — 배틀 무대가 그 자리를 쓴다.
//
// 배틀로 넘어가는 연출(`factoryStage.transition`)은 캔버스 둘이 그린다 — 배경 판의 띠 늘이기는 판 자리(사람 밑)에서, 브레인 컷인 ·
// 어둡기 · 번쩍임은 사람 위에서 (`ui/field/cutInCanvas`의 `drawCutIn`을 그대로 쓴다).
//
// 값은 무대 시계(`factoryStage`)가 쥐고 있다. 여기는 프레임마다 그 값을 읽어 스타일만 옮긴다 — 한 틱에 React를 다시 그릴
// 까닭이 없다. 사람이 새로 서거나 사라질 때만 다시 그린다
import { useEffect, useRef, useState } from 'react'
import { markFrontierStage } from '../../app/sceneMark'
import { useFactoryStore } from '../../state/factoryStore'
import { useSaveStore } from '../../state/saveStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { factoryStage } from '../../scene/factoryStage'
import { frameOf, npcSprite } from '../../engine/actor/sprites'
import type { StageActor } from '../../engine/frontier/stageMotion'
import * as css from './frontierStage.css'
import { drawCutIn, loadCutInImages, type CutInImages } from './cutInCanvas'
import type { FactoryTransitionFrame } from '../../engine/frontier/factoryTransition'

const W = 256
const H = 192
/** 배틀룸 불이 켜지는 자리 — (3,10)부터 26×11칸 (`BF_FUNC_UNK_30`) */
const LIGHT_RECT = { x: 3 * 8, y: 10 * 8, w: 26 * 8, h: 11 * 8 }

/** 브레인 컷인 캔버스의 배율 — 이름 글자가 뭉개지지 않게 원작 화면의 네 배로 그린다 */
const OVERLAY_SCALE = 4

/** 그림 한 장을 받아 둔다 (띠 늘이기가 방 그림의 줄을 뽑아 쓴다) */
const imageCache = new Map<string, HTMLImageElement>()
function imageOf(url: string | null): HTMLImageElement | null {
  if (!url) return null
  let img = imageCache.get(url)
  if (!img) { img = new Image(); img.src = url; imageCache.set(url, img) }
  return img.complete && img.naturalWidth > 0 ? img : null
}

/** 방 그림에 켠 불을 얹은 한 장 — 무대가 보여 주던 그대로 */
let composite: { key: string, canvas: HTMLCanvasElement } | null = null
function roomComposite(room: HTMLImageElement, lit: HTMLImageElement | null): HTMLCanvasElement {
  const key = `${room.src}|${lit?.src ?? ''}`
  if (composite?.key === key) return composite.canvas
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  g.drawImage(room, 0, 0)
  if (lit) g.drawImage(lit, LIGHT_RECT.x, LIGHT_RECT.y, LIGHT_RECT.w, LIGHT_RECT.h, LIGHT_RECT.x, LIGHT_RECT.y, LIGHT_RECT.w, LIGHT_RECT.h)
  composite = { key, canvas }
  return canvas
}

/** 띠 늘이기 (`ov104_022313FC`) — 두 줄 띠마다 방 그림의 한 줄(`y`)을 `x`만큼 밀어(256에서 돈다) 그린다. 192줄 밖은 비어 검다 */
function drawBands(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, bands: NonNullable<FactoryTransitionFrame['bands']>): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  for (let v = 0; v < H / 2; v++) {
    const row = bands.y[v]!
    if (row >= H) continue
    const x = bands.x[v]!
    ctx.drawImage(src, 0, row, W, 1, -x, v * 2, W, 1)
    ctx.drawImage(src, 0, row, W, 1, -x, v * 2 + 1, W, 1)
    if (x > 0) {
      ctx.drawImage(src, 0, row, W, 1, W - x, v * 2, W, 1)
      ctx.drawImage(src, 0, row, W, 1, W - x, v * 2 + 1, W, 1)
    }
  }
}

/** 무대에 선 사람의 겉 — 번호와 그림이 바뀔 때만 다시 그린다 */
const castKey = (): string =>
  [...factoryStage.motion.actors.values()].map((a) => `${String(a.id)}:${String(a.gfx)}`).join('|')

/**
 * 발밑 그림자 (`ov63_0222B7E8`) — 16×8 · 셀 원점 (8, 5)이 사람 스프라이트 자리 + (8, 14)에 선다. 사람 셀이 (−8, −16)부터 32×32라
 * 발밑(가운데 아래)에서 보면 가로 가운데 · 세로 −7~+1이다
 */
const SHADOW = { dx: -8, dy: -7, w: 16, h: 8 }

function Person({ actor, place, shadow }: {
  actor: StageActor
  place: (id: number, el: HTMLDivElement | null, which: 'body' | 'shadow') => void
  shadow: string | null
}) {
  const url = useAssetImage(`data/npc/${String(actor.gfx)}.png`)
  return (
    <>
      <div
        ref={(el) => { place(actor.id, el, 'shadow') }}
        className={css.person}
        style={{ width: SHADOW.w, height: SHADOW.h, backgroundImage: shadow ? `url(${shadow})` : undefined }}
      />
      <div
        ref={(el) => { place(actor.id, el, 'body') }}
        className={css.person}
        style={{ backgroundImage: url ? `url(${url})` : undefined }}
      />
    </>
  )
}

export function FrontierStage() {
  const phase = useFactoryStore((s) => s.phase)
  const on = phase !== 'off'
  useEffect(() => {
    markFrontierStage(on)
    return () => { markFrontierStage(false) }
  }, [on])

  const corridor = useAssetImage(on ? 'data/frontier/factoryCorridor.png' : null)
  const floor = useAssetImage(on ? 'data/frontier/factoryFloor.png' : null)
  const room = useAssetImage(on ? 'data/frontier/factoryRoom0.png' : null)
  const lightUrls = [
    useAssetImage(on ? 'data/frontier/factoryRoom1.png' : null),
    useAssetImage(on ? 'data/frontier/factoryRoom2.png' : null),
    useAssetImage(on ? 'data/frontier/factoryRoom3.png' : null),
    useAssetImage(on ? 'data/frontier/factoryRoom4.png' : null),
  ]

  const lights = useRef(lightUrls)
  lights.current = lightUrls
  const [cast, setCast] = useState<StageActor[]>([])
  const [scene, setScene] = useState(factoryStage.scene)
  const screenRef = useRef<HTMLDivElement>(null)
  const floorRef = useRef<HTMLDivElement>(null)
  const lightRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLCanvasElement>(null)
  const roomRef = useRef<HTMLImageElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const roomUrl = useRef<string | null>(null)
  roomUrl.current = room
  const people = useRef(new Map<number, HTMLDivElement>())
  const shadows = useRef(new Map<number, HTMLDivElement>())
  const place = (id: number, el: HTMLDivElement | null, which: 'body' | 'shadow'): void => {
    const map = which === 'body' ? people.current : shadows.current
    if (el) map.set(id, el)
    else map.delete(id)
  }
  // 그림자 팔레트는 처음 실린 사람 — 주인공이다 (`0x200 + v3`)
  const girl = useSaveStore((s) => s.trainer.gender === 'girl')
  const shadow = useAssetImage(on ? (girl ? 'data/frontier/shadowFemale.png' : 'data/frontier/shadowMale.png') : null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!on) return
    const fit = (): void => { setScale(Math.min(window.innerWidth / W, window.innerHeight / H)) }
    fit()
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit) }
  }, [on])

  useEffect(() => {
    if (!on) return
    let raf = 0
    let key = ''
    let images: CutInImages | null = null
    let lastTr: FactoryTransitionFrame | null | undefined
    let lastSmoke: unknown = null
    void loadCutInImages().then((got) => { images = got; lastTr = undefined }, () => { /* 그림 없이 */ })
    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const s = factoryStage
      if (s.scene !== scene) setScene(s.scene)
      const now = castKey()
      if (now !== key) { key = now; setCast([...s.motion.actors.values()]) }
      if (screenRef.current) screenRef.current.style.transform = `translateY(${String(s.shakeY)}px)`
      if (floorRef.current) floorRef.current.style.backgroundPositionY = `${String(-s.floorY)}px`
      if (lightRef.current) {
        const url = s.light > 0 ? lights.current[s.light - 1] ?? null : null
        lightRef.current.style.backgroundImage = url ? `url(${url})` : 'none'
        // 띠 늘이기 동안은 불도 띠 캔버스가 같이 그린다
        lightRef.current.style.display = s.transition?.bands ? 'none' : 'block'
      }
      if (fadeRef.current) fadeRef.current.style.opacity = String(s.fade)
      const tr = s.transition
      const smoke = s.smoke
      if (tr !== lastTr || smoke !== lastSmoke) {
        lastTr = tr
        lastSmoke = smoke
        const band = bandRef.current, over = overlayRef.current
        const roomImg = imageOf(roomUrl.current)
        const bands = tr?.bands ?? null
        if (band) {
          band.style.display = bands && roomImg ? 'block' : 'none'
          if (bands && roomImg) {
            const lit = imageOf(s.light > 0 ? lights.current[s.light - 1] ?? null : null)
            drawBands(band.getContext('2d')!, roomComposite(roomImg, lit), bands)
          }
        }
        if (roomRef.current) roomRef.current.style.visibility = bands && roomImg ? 'hidden' : 'visible'
        if (over) {
          over.style.display = tr || smoke ? 'block' : 'none'
          const ctx = over.getContext('2d')!
          const w = W * OVERLAY_SCALE, h = H * OVERLAY_SCALE
          if (tr?.draw) drawCutIn(ctx, tr.draw, images, w, h)
          else if (smoke) drawCutIn(ctx, { paint: [], sprites: [], mask: [], rows: null, particles: { front: true, quads: smoke } }, images, w, h)
          else ctx.clearRect(0, 0, w, h)
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          if (tr && tr.dim > 0) { ctx.globalAlpha = tr.dim; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h) }
          // 마스터 밝기 — 양수가 흰색
          if (tr && tr.flash !== 0) {
            ctx.globalAlpha = Math.min(1, Math.abs(tr.flash))
            ctx.fillStyle = tr.flash > 0 ? '#fff' : '#000'
            ctx.fillRect(0, 0, w, h)
          }
          ctx.globalAlpha = 1
        }
      }
      for (const a of s.motion.actors.values()) {
        const el = people.current.get(a.id)
        if (!el) continue
        const sprite = npcSprite(a.gfx)
        const frame = sprite ? frameOf(sprite, sprite.directional ? a.dir : 0, a.walking ? a.walkTicks : 0) : 0
        const w = sprite?.w ?? 32, h = sprite?.h ?? 32
        el.style.display = a.visible ? 'block' : 'none'
        el.style.width = `${String(w)}px`
        el.style.height = `${String(h)}px`
        // 발밑이 스크립트의 (x, y)다 — 판은 가운데 아래를 거기에 둔다
        el.style.left = `${String(a.x - w / 2)}px`
        el.style.top = `${String(a.y - h)}px`
        el.style.zIndex = String(20 + a.y * 2)
        el.style.backgroundPosition = `${String(-frame * w)}px 0`
        const sh = shadows.current.get(a.id)
        if (sh) {
          sh.style.display = a.visible ? 'block' : 'none'
          sh.style.left = `${String(a.x + SHADOW.dx)}px`
          sh.style.top = `${String(a.y + SHADOW.dy)}px`
          // 제 사람 바로 뒤 — 원작 목록에서 사람 다음에 선다
          sh.style.zIndex = String(19 + a.y * 2)
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf) }
  }, [on, scene])

  if (!on) return null
  // 배틀 동안은 배틀 무대가 화면을 쓴다
  if (phase === 'battle') return null
  return (
    <div className={css.stage} aria-hidden data-frontier-scene={scene ?? 'none'}>
      <div className={css.screen} style={{ transform: `translate(-50%, -50%) scale(${String(scale)})` }}>
        <div ref={screenRef} className={css.layer}>
          {scene === 'corridor' && (
            <>
              <div ref={floorRef} className={css.layer} style={{ backgroundImage: floor ? `url(${floor})` : undefined, backgroundRepeat: 'repeat-y' }} />
              {corridor && <img className={css.layer} src={corridor} alt="" />}
            </>
          )}
          {scene === 'room' && (
            <>
              {room && <img ref={roomRef} className={css.layer} src={room} alt="" />}
              <canvas ref={bandRef} className={css.layer} width={W} height={H} style={{ display: 'none' }} />
              <div
                ref={lightRef}
                className={css.light}
                style={{
                  left: LIGHT_RECT.x, top: LIGHT_RECT.y, width: LIGHT_RECT.w, height: LIGHT_RECT.h,
                  backgroundPosition: `${String(-LIGHT_RECT.x)}px ${String(-LIGHT_RECT.y)}px`,
                }}
              />
            </>
          )}
          {cast.map((a) => <Person key={`${String(a.id)}:${String(a.gfx)}`} actor={a} place={place} shadow={shadow} />)}
        </div>
        <canvas ref={overlayRef} className={css.overlay} width={W * OVERLAY_SCALE} height={H * OVERLAY_SCALE} style={{ display: 'none' }} />
        <div ref={fadeRef} className={css.fade} />
      </div>
    </div>
  )
}

