// 방 벽 그림에 **구워진 얼룩**을 지운다 (docs/orders/VISUAL_20260929.md · GAPS E1)
//
// BDSP는 벽 그림 한 장에 창 둘레의 커튼 그림자 같은 것을 같이 구워 두었고, 북쪽 벽에서는 창 · 커튼 · 시계가 그 자리를 가린다.
// 우리가 남쪽 벽을 북쪽 벽의 거울로 세우면(`roomShell`) 가려지던 그림이 드러나 벽 한가운데 회색 삼각형 둘이 선다 —
// 주인공 방 2층(`t01r0202`)의 벽 그림 `M_RO_001_Wall_01_2F`(512²)의 (313~353, 63~140)이 그 삼각형이다.
//
// 지우는 길은 **한 판자 폭 옆의 깨끗한 그림을 덮어 쓰는 것**이다 — 판자 줄 간격이 37텍셀이라 한 폭(37) 왼쪽이 같은 판자 무늬다.
// 값의 근거: 벽 그림에서 판자 세로 줄이 x 315 · 352에 서고(간격 37), 삼각형은 그 두 줄 사이(x 313~353)에 y 63~140으로 든다.
import { CanvasTexture, Mesh, type Material, type MeshStandardMaterial, type Object3D, type Texture } from 'three'

interface Stain {
  /** 재질 이름 (정규식) */
  material: RegExp
  /** 지울 상자 — 텍셀 [x, y, 폭, 높이] */
  rect: readonly [number, number, number, number]
  /** 그 상자를 덮을 깨끗한 그림의 왼쪽 위 — 텍셀 [x, y] */
  from: readonly [number, number]
}

/** 방 이름 → 얼룩 */
export const ROOM_STAINS: Readonly<Record<string, readonly Stain[]>> = {
  t01r0202: [{ material: /Wall_01_2F/, rect: [313, 63, 41, 78], from: [276, 63] }],
}

/** 방 안의 얼룩을 지운다. 지운 그림 수를 돌려준다 — 그림이 나눠 쓰이면 한 번만 지운다 */
export function repaintStains(root: Object3D, room: string): number {
  const stains = ROOM_STAINS[room]
  if (!stains || typeof document === 'undefined') return 0
  const done = new Set<Texture>()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as Material[]) {
      const map = (m as MeshStandardMaterial).map
      if (!map || done.has(map)) continue
      for (const s of stains) {
        if (!s.material.test(m.name)) continue
        const image = map.image as CanvasImageSource & { width: number, height: number }
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const g = canvas.getContext('2d')
        if (!g) continue
        g.drawImage(image, 0, 0)
        const [x, y, w, h] = s.rect
        g.drawImage(canvas, s.from[0], s.from[1], w, h, x, y, w, h)
        const painted = new CanvasTexture(canvas)
        painted.flipY = map.flipY
        painted.colorSpace = map.colorSpace
        painted.wrapS = map.wrapS
        painted.wrapT = map.wrapT
        painted.magFilter = map.magFilter
        painted.minFilter = map.minFilter
        painted.anisotropy = map.anisotropy
        ;(m as MeshStandardMaterial).map = painted
        m.needsUpdate = true
        done.add(map)
      }
    }
  })
  return done.size
}
