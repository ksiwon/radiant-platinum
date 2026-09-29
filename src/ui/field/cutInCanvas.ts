// 조우 컷인의 DS 그림판 (`CutInFrame.draw`) — 몬스터볼 · 띠 · 얼굴 · 칠한 검정 · 창
//
// 원작 컷인은 위 화면(256×192)에 스프라이트와 BG3를 얹고 창으로 자른다. 우리 화면은 한 장이고 비율이 다르므로:
//
//   자리 · 칸 · 창   **화면 폭 · 높이의 몫**으로 옮긴다 (x ÷ 256 · y ÷ 192) — 칠한 칸 마흔여덟이 화면을 빈틈없이 덮고, 창이
//                    닫히는 줄의 차례가 원작 주사선 그대로다. 원 · 반원 창은 넓은 화면에서 옆으로 퍼진 타원이 된다
//   스프라이트 크기   **높이 하나로** 키운다 — 공이 찌그러지면 안 된다
//
// 차례는 원작 화면 합성이다: 3D · 바탕 어둡게 → BG3(칠한 검정 · 띠) → 스프라이트(목록 앞이 위) → 창 밖 검정.
// 돌림은 `NNS_G2dRotZ(sin, cos)`의 행 벡터 셈이라 y가 아래로 가는 화면에서 **양수가 시계 방향**이다 — 캔버스 `rotate`와 같다.
import { assets } from '../../data/providers/assetProvider'
import { decodePng } from '../../import/platinum/png'
import type { CutInDraw, CutInSprite } from '../../engine/battle/encounterCutIn'

/** 목차 한 칸 — 셀 원점 기준 경계 상자 */
interface CellImage { file: string, x: number, y: number, w: number, h: number }

export interface CutInImages {
  get(name: string): { box: CellImage, canvas: HTMLCanvasElement } | undefined
}

let loading: Promise<CutInImages> | null = null

/** 목차와 그림을 한 번 읽는다 — 다 합쳐 몇십 KB다 */
export function loadCutInImages(): Promise<CutInImages> {
  loading ??= (async () => {
    const index = JSON.parse(await assets().text('data/encounterEffect/index.json')) as Record<string, CellImage | CellImage[]>
    const map = new Map<string, { box: CellImage, canvas: HTMLCanvasElement }>()
    await Promise.all(Object.entries(index).map(async ([name, box]) => {
      if (Array.isArray(box)) return
      // ⚠️ `createImageBitmap`을 안 쓴다 — GPU 프로세스와 동기를 맞추며 기다린다 (`import/platinum/png`의 `decodePng`)
      const png = await decodePng(new Uint8Array(await assets().bytes(box.file)))
      const canvas = document.createElement('canvas')
      canvas.width = png.width
      canvas.height = png.height
      canvas.getContext('2d')!.putImageData(new ImageData(png.pixels as Uint8ClampedArray<ArrayBuffer>, png.width, png.height), 0, 0)
      map.set(name, { box, canvas })
    }))
    return { get: (name) => map.get(name) }
  })()
  loading.catch(() => { loading = null })
  return loading
}

/** 섞기 · 모자이크에 쓰는 밑그림 */
let scratch: HTMLCanvasElement | null = null
const scratchOf = (w: number, h: number): CanvasRenderingContext2D => {
  scratch ??= document.createElement('canvas')
  if (scratch.width < w) scratch.width = w
  if (scratch.height < h) scratch.height = h
  const c = scratch.getContext('2d', { willReadFrequently: true })!
  c.imageSmoothingEnabled = false
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1
  c.clearRect(0, 0, scratch.width, scratch.height)
  return c
}

/**
 * 한 프레임을 그린다. `w` · `h`는 캔버스 픽셀이다.
 *
 * ⚠️ 그림이 아직 안 왔으면 그 스프라이트만 빠진다 — 창과 칠한 검정은 그대로 선다(전환 자체는 성립한다)
 */
export function drawCutIn(ctx: CanvasRenderingContext2D, draw: CutInDraw, images: CutInImages | null, w: number, h: number): void {
  const sx = w / 256, sy = h / 192
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  const rect = (x: number, y: number, rw: number, rh: number): void => {
    // 가장자리를 픽셀에 맞춘다 — 이웃한 칸 사이에 실금이 안 서게
    const x0 = Math.round(x * sx), y0 = Math.round(y * sy)
    ctx.fillRect(x0, y0, Math.round((x + rw) * sx) - x0, Math.round((y + rh) * sy) - y0)
  }

  if (draw.darken !== undefined && draw.darken > 0) {
    ctx.globalAlpha = Math.min(1, draw.darken)
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }
  for (const [x, y, rw, rh] of draw.paint) rect(x, y, rw, rh)
  if (draw.banner && images) drawBanner(ctx, draw.banner, images, sx, sy)
  // 목록 앞이 위다 — 뒤에서부터 그린다
  if (images) for (let i = draw.sprites.length - 1; i >= 0; i--) drawSprite(ctx, draw.sprites[i]!, images, sx, sy)
  if (draw.name) drawName(ctx, draw.name, sx, sy)

  ctx.fillStyle = '#000'
  for (const [x, y, rw, rh] of draw.mask) rect(x, y, rw, rh)
  if (draw.rows) {
    // 줄마다 보이는 칸의 **나머지**를 검게 — 같은 줄이 이어지면 한 칸으로 묶는다
    let from = 0
    const key = (r: readonly (readonly [number, number])[]): string => r.map((s) => `${String(s[0])},${String(s[1])}`).join(';')
    for (let y = 1; y <= 192; y++) {
      if (y < 192 && key(draw.rows[y]!) === key(draw.rows[from]!)) continue
      const spans = draw.rows[from]!
      let x = 0
      for (const [a, b] of spans) {
        if (a > x) rect(x, from, a - x, y - from)
        x = Math.max(x, b)
      }
      if (x < 256) rect(x, from, 256 - x, y - from)
      from = y
    }
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, s: CutInSprite, images: CutInImages, sx: number, sy: number): void {
  const img = images.get(s.img)
  if (!img) return
  const { box, canvas } = img
  const alpha = s.alpha ?? 1
  if (alpha <= 0) return
  // 띠처럼 세로로 이어 구운 것은 제 칸만
  const srcY = (s.frame ?? 0) * box.h
  let top = box.y, bottom = box.y + box.h
  if (s.half === 'top') bottom = Math.min(bottom, 0)
  if (s.half === 'bottom') top = Math.max(top, 0)
  if (bottom <= top) return

  let src: CanvasImageSource = canvas
  let sxOff = 0, syOff = srcY + (top - box.y)
  const sw = box.w, sh = bottom - top
  const mosaic = s.mosaic ?? 1
  const dark = s.dark ?? 0
  if (dark > 0 || mosaic > 1) {
    // 팔레트를 검정 쪽으로 섞기 (`BlendTrainerSpritePltt`) · 모자이크 (`G2_SetOBJMosaicSize`) — 밑그림에서 만든다
    const c = scratchOf(sw, sh)
    c.drawImage(canvas, 0, syOff, sw, sh, 0, 0, sw, sh)
    if (dark > 0) {
      c.globalCompositeOperation = 'source-atop'
      c.globalAlpha = Math.min(1, dark)
      c.fillStyle = '#000'
      c.fillRect(0, 0, sw, sh)
      c.globalCompositeOperation = 'source-over'
      c.globalAlpha = 1
    }
    if (mosaic > 1) {
      // DS 모자이크는 칸의 왼위 픽셀을 칸 전체에 편다
      for (let y = 0; y < sh; y += mosaic) {
        for (let x = 0; x < sw; x += mosaic) {
          const p = c.getImageData(x, y, 1, 1).data
          c.fillStyle = `rgba(${String(p[0])},${String(p[1])},${String(p[2])},${String(p[3]! / 255)})`
          c.clearRect(x, y, mosaic, mosaic)
          c.fillRect(x, y, Math.min(mosaic, sw - x), Math.min(mosaic, sh - y))
        }
      }
    }
    src = c.canvas
    sxOff = 0
    syOff = 0
  }

  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.translate(s.x * sx, s.y * sy)
  if (s.rot) ctx.rotate((s.rot / 65536) * Math.PI * 2)
  ctx.scale((s.scaleX ?? 1) * sy, (s.scaleY ?? 1) * sy)
  ctx.drawImage(src, sxOff, syOff, sw, sh, box.x, top, sw, sh)
  ctx.restore()
}

/** 관장 띠 (BG3) — 가로로 밀리고, 줄마다 드러난 왼끝부터 오른쪽이 보인다 */
function drawBanner(ctx: CanvasRenderingContext2D, b: NonNullable<CutInDraw['banner']>, images: CutInImages, sx: number, sy: number): void {
  const img = images.get(b.img)
  if (!img) return
  const { box, canvas } = img
  // BG 가로 밀기는 256에서 돈다 — 한 장을 두 번 그려 이음매를 채운다
  const off = (((-b.scroll) % 256) + 256) % 256
  for (let row = 0; row < box.h; row++) {
    const left = b.reveal ? b.reveal[row]! : 0
    if (left >= 256) continue
    const y = box.y + row
    for (const base of [off - 256, off]) {
      // 이 조각이 화면에 선 칸 [base, base + 256) ∩ [left, 256)
      const a = Math.max(base, left), e = Math.min(base + 256, 256)
      if (e <= a) continue
      const x0 = Math.round(a * sx), x1 = Math.round(e * sx)
      ctx.drawImage(canvas, a - base, row, e - a, 1, x0, Math.round(y * sy), x1 - x0, Math.round((y + 1) * sy) - Math.round(y * sy))
    }
  }
}

/** 주인공 이름 (`TEXT_BANK_UNK_0359`의 글자 자리) — 흰 글자에 검은 그림자 */
function drawName(ctx: CanvasRenderingContext2D, n: NonNullable<CutInDraw['name']>, sx: number, sy: number): void {
  ctx.save()
  const px = Math.round(12 * sy)
  ctx.font = `${String(px)}px ${getComputedStyle(document.body).fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  const cx = (n.x + n.w / 2) * sx
  const y = n.y * sy
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillText(n.text, cx + sy, y + sy)
  ctx.fillStyle = '#fff'
  ctx.fillText(n.text, cx, y)
  ctx.restore()
}
