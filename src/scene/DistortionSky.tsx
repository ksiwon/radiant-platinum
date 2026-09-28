// 깨어진 세계의 하늘 (PARITY §8.6b · 규칙은 `engine/world/distortionSky` · 그림은 `data/distortionSky.png`)
//
// 원작 하늘은 **화면에 붙어 있다** — 배경(BG2)도 구름(OBJ)도 2D 층이라 카메라가 돌아도 안 움직이고, 3D 화면이
// 그 위에 얹힌다. 그래서 여기도 256×192 캔버스 한 장에 원작 픽셀 그대로 찍고, 그 판을 **카메라 앞 먼 자리**에
// 화면을 덮게 세운다. 깊이를 안 쓰고 맨 먼저 그리므로 판·소품·사람이 다 그 위에 선다.
//
// 화면비가 4:3이 아니면 **덮는다**(넘치는 쪽을 자른다) — 늘이면 소용돌이가 찌그러진다.
//
// ⚠️ **색은 톤 매핑을 안 탄다.** 원작 팔레트 값을 그대로 보여 주는 판이다 — 톤 매핑을 걸면 어둡기 12단계의
// 차이가 뭉개진다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, NearestFilter, SRGBColorSpace, Vector3, type Mesh } from 'three'
import { assets, readJson } from '../data/providers/assetProvider'
import { decodePng } from '../import/platinum/png'
import {
  CLOUD_TINT, SKY_TINT, cloudPose, initClouds, skyDarkness, skyDarknessPinned, skyKindFor, stepClouds,
  tintChannel, type CloudState, type SkyKind,
} from '../engine/world/distortionSky'
import { worldState } from '../state/worldState'
import { distortionFloor } from './distortionCore'
import { arrivalSky } from './distortionGiratina'

const W = 256
const H = 192
/** 판을 세우는 거리 — 카메라 먼 끝(200)보다 조금 앞 */
const DIST = 180
/** 한 프레임에 따라잡는 틱의 끝 — 탭이 오래 숨었다 돌아와도 한꺼번에 돌지 않는다 */
const MAX_STEPS = 8

interface SkySheet {
  width: number
  height: number
  sky: [number, number, number, number]
  clouds: [number, number, number, number, number, number][]
}

interface SkyArt {
  sheet: SkySheet
  pixels: Uint8ClampedArray
  /** 어둡기마다 물들인 장 — 처음 쓸 때 만든다 */
  tinted: Map<number, HTMLCanvasElement>
}

/** 한 장을 그 어둡기로 물들인다. 하늘 칸은 배경 쪽 색으로, 나머지(구름)는 구름 쪽 색으로 */
function tintSheet(art: SkyArt, level: number): HTMLCanvasElement {
  const hit = art.tinted.get(level)
  if (hit) return hit
  const { width, height, sky } = art.sheet
  const out = new Uint8ClampedArray(art.pixels.length)
  for (let y = 0; y < height; y++) {
    const inSky = y >= sky[1] && y < sky[1] + sky[3]
    const tint = inSky ? SKY_TINT : CLOUD_TINT
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        // 5비트를 8비트로 편 값이다 — `>> 3`이 원작 값이다 (`nitrotex.color`)
        const v = tintChannel(art.pixels[at + c]! >> 3, tint[c]!, level)
        out[at + c] = (v << 3) | (v >> 2)
      }
      out[at + 3] = art.pixels[at + 3]!
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.putImageData(new ImageData(out, width, height), 0, 0)
  art.tinted.set(level, canvas)
  return canvas
}

/** 이 층의 하늘 — 들어설 때 정한다 (`InitSkyCloudAnimators` · `InitSkyBackgroundDarkness`) */
interface FloorSky { map: number, kind: SkyKind, pinned: number | null, clouds: CloudState[] }

export function DistortionSky({ mapId, progress }: { mapId: number, progress: () => number }) {
  const camera = useThree((s) => s.camera)
  const [art, setArt] = useState<SkyArt | null>(null)
  const mesh = useRef<Mesh>(null)
  const floor = useRef<FloorSky | null>(null)
  const carry = useRef(0)

  useEffect(() => {
    let alive = true
    void Promise.all([
      readJson(assets(), 'data/distortionSky.json') as Promise<SkySheet>,
      assets().bytes('data/distortionSky.png').then((b) => decodePng(new Uint8Array(b))),
    ]).then(([sheet, png]) => {
      if (alive) setArt({ sheet, pixels: png.pixels, tinted: new Map() })
    }).catch(() => { /* 옛 설치본에는 없다 — 뒤가 검은 채로 선다 (`GROUP_ACCEPTS`) */ })
    return () => { alive = false }
  }, [])

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const t = new CanvasTexture(c)
    t.name = 'distortion-sky'
    t.colorSpace = SRGBColorSpace
    t.magFilter = NearestFilter
    t.minFilter = NearestFilter
    t.generateMipmaps = false
    return { canvas: c, texture: t }
  }, [])
  useEffect(() => () => { texture.dispose() }, [texture])

  const ahead = useMemo(() => new Vector3(), [])

  useFrame((_, dt) => {
    const m = mesh.current
    if (m === null || art === null) return
    const at = floor.current
    if (at === null || at.map !== mapId) {
      const p = progress()
      const kind = skyKindFor(mapId, p)
      floor.current = { map: mapId, kind, pinned: skyDarknessPinned(mapId, p), clouds: initClouds(kind) }
      carry.current = 0
    }
    const sky = floor.current!
    // 기라티나가 내려서는 동안과 그 뒤로는 연출이 하늘을 쥔다 (`SetSkyBackgroundDarknessCalculationDisabled`)
    const held = arrivalSky(mapId)
    if (held !== null) sky.kind = 2
    carry.current = Math.min(MAX_STEPS, carry.current + dt * 60)
    for (; carry.current >= 1; carry.current--) stepClouds(sky.clouds, sky.kind)

    const worldY = worldState.player.position.y + (distortionFloor()?.offsetY ?? 0)
    const level = held ?? sky.pinned ?? skyDarkness(worldY)
    const sheet = tintSheet(art, level)
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const [sx, sy, sw, sh] = art.sheet.sky
    ctx.drawImage(sheet, sx, sy, sw, sh, 0, 0, W, H)
    for (const [i, c] of sky.clouds.entries()) {
      const pose = cloudPose(i, c)
      const r = art.sheet.clouds[pose.res]
      if (r === undefined) continue
      const [rx, ry, rw, rh, ox, oy] = r
      // 셀 원점을 둘레로 돌리고 키운다 — 화면 y가 아래라 양의 각이 시계 방향이다 (`MTX_Rot22`)
      ctx.setTransform(1, 0, 0, 1, pose.x, pose.y)
      ctx.rotate((pose.deg * Math.PI) / 180)
      ctx.scale(pose.scale, pose.scale)
      ctx.drawImage(sheet, rx, ry, rw, rh, -ox, -oy, rw, rh)
    }
    texture.needsUpdate = true

    // 카메라 앞에 화면을 덮게 세운다
    const cam = camera as typeof camera & { fov?: number, aspect?: number }
    const fov = ((cam.fov ?? 60) * Math.PI) / 180
    const aspect = cam.aspect ?? W / H
    const tall = 2 * DIST * Math.tan(fov / 2)
    const wide = tall * aspect
    const cover = Math.max(wide / W, tall / H)
    camera.getWorldDirection(ahead)
    m.position.copy(camera.position).addScaledVector(ahead, DIST)
    m.quaternion.copy(camera.quaternion)
    m.scale.set(W * cover, H * cover, 1)
  })

  if (art === null) return null
  return (
    <mesh ref={mesh} name="깨어진 세계 하늘" renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} depthWrite={false} depthTest={false} fog={false} toneMapped={false} />
    </mesh>
  )
}
