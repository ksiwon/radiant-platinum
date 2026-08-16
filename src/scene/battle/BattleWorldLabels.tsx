import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  type Sprite,
  type SpriteMaterial,
} from 'three'
import type { BattleView } from '../../engine/battle/view'
import type { SlotId } from '../../engine/battle/events'

type SpotAt = (slot: SlotId) => readonly [number, number]

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
 * 무대 위에 뜨는 글자 — **입은 피해뿐이다.**
 *
 * 이름과 레벨을 띄우는 판이 여기 같이 있었다. 무대 위 두 자리에 늘 떠 있으니
 * 몬스터가 가려지고, 카메라가 도는 동안 판 둘이 화면 위쪽을 계속 덮었다.
 * 그 값은 이미 화면 위아래의 체력 상자(`BattleScreen`)가 이름·레벨·성별까지
 * 다 적고 있어서, 무대에 한 벌 더 띄울 이유가 없다
 */
export function BattleWorldLabels(
  { view, spotAt }: { view: BattleView; spotAt: SpotAt },
) {
  const hit = view.lastHit
  if (!hit) return null
  return <DamagePopup key={hit.seq} view={view} at={spotAt(hit.slot)} />
}
