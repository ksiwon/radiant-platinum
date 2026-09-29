// 배틀프런티어 시설 장면의 무대 (PARITY §9.3 · `scene/factoryScene` · `scene/factoryStage`)
//
// 장면이 도는 동안 필드를 가리고 원작 화면 한 장(256×192)을 그린다 — 복도 판(바닥이 도는 BG2 위에 BG3)이나 배틀룸 판,
// 그 위에 걷는 사람, 맨 위에 암전. 화면 비율 그대로 창 높이에 맞춰 키운다(픽셀은 뭉개지 않는다).
// 빌리기 · 바꾸기 화면과 대사창은 그 위에 따로 뜬다. 배틀 동안은 무대를 걷는다 — 배틀 무대가 그 자리를 쓴다.
//
// 값은 무대 시계(`factoryStage`)가 쥐고 있다. 여기는 프레임마다 그 값을 읽어 스타일만 옮긴다 — 한 틱에 React를 다시 그릴
// 까닭이 없다. 사람이 새로 서거나 사라질 때만 다시 그린다
import { useEffect, useRef, useState } from 'react'
import { markFrontierStage } from '../../app/sceneMark'
import { useFactoryStore } from '../../state/factoryStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { factoryStage } from '../../scene/factoryStage'
import { frameOf, npcSprite } from '../../engine/actor/sprites'
import type { StageActor } from '../../engine/frontier/stageMotion'
import * as css from './frontierStage.css'

const W = 256
const H = 192
/** 배틀룸 불이 켜지는 자리 — (3,10)부터 26×11칸 (`BF_FUNC_UNK_30`) */
const LIGHT_RECT = { x: 3 * 8, y: 10 * 8, w: 26 * 8, h: 11 * 8 }

/** 무대에 선 사람의 겉 — 번호와 그림이 바뀔 때만 다시 그린다 */
const castKey = (): string =>
  [...factoryStage.motion.actors.values()].map((a) => `${String(a.id)}:${String(a.gfx)}`).join('|')

function Person({ actor, place }: { actor: StageActor, place: (id: number, el: HTMLDivElement | null) => void }) {
  const url = useAssetImage(`data/npc/${String(actor.gfx)}.png`)
  return (
    <div
      ref={(el) => { place(actor.id, el) }}
      className={css.person}
      style={{ backgroundImage: url ? `url(${url})` : undefined }}
    />
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
  const people = useRef(new Map<number, HTMLDivElement>())
  const place = (id: number, el: HTMLDivElement | null): void => {
    if (el) people.current.set(id, el)
    else people.current.delete(id)
  }
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
      }
      if (fadeRef.current) fadeRef.current.style.opacity = String(s.fade)
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
        el.style.zIndex = String(10 + a.y)
        el.style.backgroundPosition = `${String(-frame * w)}px 0`
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
              {room && <img className={css.layer} src={room} alt="" />}
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
          {cast.map((a) => <Person key={`${String(a.id)}:${String(a.gfx)}`} actor={a} place={place} />)}
        </div>
        <div ref={fadeRef} className={css.fade} />
      </div>
    </div>
  )
}

