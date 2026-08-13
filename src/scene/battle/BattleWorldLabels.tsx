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

function labelTexture(mon: ViewMon): CanvasTexture {
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
  ctx.fillText(mon.speciesName, 34, 64, 340)
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

function Nameplate({ mon, at }: { mon: ViewMon; at: readonly [number, number] }) {
  const texture = useMemo(() => labelTexture(mon), [mon])
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

export function BattleWorldLabels({ view, spotAt }: { view: BattleView; spotAt: SpotAt }) {
  const hit = view.lastHit
  return (
    <>
      {SLOTS.map((slot) => {
        const mon = view.active[slot]
        return mon && !mon.fainted ? <Nameplate key={slot} mon={mon} at={spotAt(slot)} /> : null
      })}
      {hit && <DamagePopup key={hit.seq} view={view} at={spotAt(hit.slot)} />}
    </>
  )
}
