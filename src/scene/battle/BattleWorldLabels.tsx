import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  type Sprite,
  type SpriteMaterial,
} from 'three'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import { SLOTS, type SlotId } from '../../engine/battle/events'

type SpotAt = (slot: SlotId) => readonly [number, number]

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function labelTexture(mon: ViewMon, name: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  roundedRect(ctx, 8, 10, 496, 108, 28)
  ctx.fillStyle = mon.side === 'p1' ? 'rgba(20,45,70,.88)' : 'rgba(70,28,32,.88)'
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = mon.shiny ? '#ffe169' : 'rgba(255,255,255,.82)'
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 48px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 34, 64, 340)
  ctx.textAlign = 'right'
  ctx.font = '700 35px system-ui, sans-serif'
  ctx.fillStyle = '#dcecff'
  ctx.fillText(`Lv.${String(mon.level)}`, 480, 65)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function damageTexture(view: BattleView): CanvasTexture | null {
  const hit = view.lastHit
  if (!hit) return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')

  const amount = hit.amount > 0 ? `-${String(hit.amount)}` : 'BLOCK'
  const color =
    hit.level === 'super'
      ? '#ffe04d'
      : hit.level === 'resisted'
        ? '#b8d5ef'
        : hit.level === 'immune'
          ? '#d8d8e0'
          : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.font = `900 ${hit.crit ? '72' : '64'}px system-ui, sans-serif`
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(30,10,15,.9)'
  ctx.strokeText(amount, 128, 64)
  ctx.fillStyle = color
  ctx.fillText(amount, 128, 64)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function Nameplate(
  { mon, at, name }: { mon: ViewMon; at: readonly [number, number]; name: string },
) {
  const texture = useMemo(() => labelTexture(mon, name), [mon, name])
  useEffect(
    () => () => {
      texture.dispose()
    },
    [texture],
  )
  return (
    <sprite position={[at[0], 2.05, at[1]]} scale={[2.2, 0.55, 1]} renderOrder={20}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

function DamagePopup({ view, at }: { view: BattleView; at: readonly [number, number] }) {
  const sprite = useRef<Sprite>(null)
  const material = useRef<SpriteMaterial>(null)
  const elapsed = useRef(0)
  const texture = useMemo(() => damageTexture(view), [view])
  useEffect(() => {
    elapsed.current = 0
    return () => {
      texture?.dispose()
    }
  }, [texture])
  useFrame((_, dt) => {
    if (!sprite.current || !material.current || !texture) return
    elapsed.current += dt
    const progress = Math.min(1, elapsed.current / 1.05)
    sprite.current.position.y = 1.4 + Math.sin(progress * Math.PI) * 0.42 + progress * 0.5
    const scale = 0.7 + Math.sin((Math.min(1, progress * 2) * Math.PI) / 2) * 0.35
    sprite.current.scale.set(1.35 * scale, 0.68 * scale, 1)
    material.current.opacity = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28
    sprite.current.visible = progress < 1
  })
  if (!texture) return null
  return (
    <sprite ref={sprite} position={[at[0], 1.4, at[1]]} renderOrder={21}>
      <spriteMaterial
        ref={material}
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  )
}

/**
 * 무대 위에 뜨는 이름표.
 *
 * ⚠️ **`mon.speciesName`을 그대로 쓰면 안 된다.** 그것은 시뮬레이터 프로토콜의
 * `Turtwig, L5, F`에서 잘라 온 **영어 이름**이라, 화면의 다른 데가 다 「메가자리」인데
 * 무대 위 이름표 하나만 `yanmega`로 뜬다 (`pnpm story`가 사천왕 장면 그림에서
 * 잡았다). 이름은 롬에서 온 것을 쓰고, 별명이 있으면 별명이 먼저다 —
 * 2D 쪽 이름표(`BattleScreen`의 `label`)와 같은 차례다
 */
export function BattleWorldLabels(
  { view, spotAt, nameOf }: {
    view: BattleView
    spotAt: SpotAt
    /** 롬 이름표. 아직 못 받았으면 프로토콜 이름으로 떨어진다 */
    nameOf?: (mon: ViewMon) => string
  },
) {
  const hit = view.lastHit
  return (
    <>
      {SLOTS.map((slot) => {
        const mon = view.active[slot]
        return mon && !mon.fainted
          ? (
            <Nameplate
              key={slot}
              mon={mon}
              at={spotAt(slot)}
              name={nameOf?.(mon) ?? mon.speciesName}
            />
          )
          : null
      })}
      {hit && <DamagePopup key={hit.seq} view={view} at={spotAt(hit.slot)} />}
    </>
  )
}
