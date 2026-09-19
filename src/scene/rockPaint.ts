// 바위에 **원작 그림**을 입힌다 (FIRST_PERSON §6.3).
//
// 예전 바위는 그림 칸의 가로줄 평균을 여덟 층으로 칠했다(`plateBands`). 색은
// 원작에서 왔지만 **문양은 통째로 없었다** — 1인칭으로 다가서면 회색 덩이다.
//
// 명세는 「원본 전면 문양은 기준 방향 UV로 보존하고 측·후면은 같은 rock crop의
// 문양 swatch로 마감한다」고 한다. 그래서 두 벌로 나눈다:
//
//   앞면  원작 카메라를 보던 그 방향에 그림을 **그대로** 편다
//   옆·뒤 같은 그림의 **가운데 조각**을 물려 마감한다. 없는 문양을 지어내지 않는다
//
// ⚠️ **투명 텍셀을 그대로 두면 구멍이 난다.** 칸에는 물건 둘레의 투명 여백이
// 있고, 저폴리 실루엣은 그 여백을 조금씩 문다. 알파로 자르면 바위에 구멍이 뚫리고
// 안 자르면 투명 텍셀의 RGB(대개 검정)가 얼룩으로 나온다 — 잘라 낸 뒤 여백을
// **가장 가까운 불투명 색으로 메워** 둘 다 막는다.
import type { TexSheet } from './chunkMesh'

/** 잘라 낸 바위 그림 한 장 */
export interface RockCrop {
  /** RGBA. 투명 여백은 이웃한 불투명 색으로 메워져 있다 */
  pixels: Uint8Array
  width: number
  height: number
  /** 칸에서 **불투명한 줄**의 비율. 높이를 정하는 근거다 (`rockShape.rockAspect`) */
  rows: number
  /** 칸에서 **불투명한 칸**의 비율 */
  cols: number
}

/** 옆·뒤에 물릴 조각의 자리 (잘라 낸 그림 안의 비율) */
const SWATCH = { u0: 0.30, u1: 0.70, v0: 0.35, v1: 0.75 }

/** 앞면으로 치는 기준 — 법선의 z가 이보다 크면 원작 카메라를 보고 있다 */
const FRONT = 0.30

/**
 * 그 판이 쓰는 **그림 칸의 한 조각**을 잘라 온다.
 *
 * `u0..u1`·`v0..v1`은 판이 실제로 쓰는 칸 안의 자리다 — 한 그림에 바위와 화분이
 * 같이 들어 있어서 칸 전체를 쓰면 옆 물건이 딸려 온다 (`Rocks`의 머리말)
 */
export function rockCrop(
  sheet: TexSheet, item: { x: number, y: number, w: number, h: number },
  u0: number, u1: number, v0: number, v1: number,
): RockCrop | null {
  const clampX = (t: number): number => Math.min(item.w, Math.max(0, t))
  const clampY = (t: number): number => Math.min(item.h, Math.max(0, t))
  const x0 = clampX(Math.round(Math.min(u0, u1) * item.w))
  const x1 = clampX(Math.round(Math.max(u0, u1) * item.w))
  const y0 = clampY(Math.round(Math.min(v0, v1) * item.h))
  const y1 = clampY(Math.round(Math.max(v0, v1) * item.h))
  const width = x1 - x0, height = y1 - y0
  if (width < 2 || height < 2) return null

  const pixels = new Uint8Array(width * height * 4)
  const solid = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((item.y + y0 + y) * sheet.width + item.x + x0 + x) * 4
      const to = (y * width + x) * 4
      for (let c = 0; c < 4; c++) pixels[to + c] = sheet.pixels[from + c]!
      solid[y * width + x] = (sheet.pixels[from + 3]! >= 128 ? 1 : 0)
    }
  }
  // 불투명한 줄·칸을 센다. **메우기 전에** 세야 실루엣이 나온다
  let rows = 0, cols = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (solid[y * width + x] === 1) { rows++; break }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) if (solid[y * width + x] === 1) { cols++; break }
  }
  if (rows === 0 || cols === 0) return null
  dilate(pixels, solid, width, height)
  return { pixels, width, height, rows: rows / height, cols: cols / width }
}

/**
 * 투명 여백을 **가장 가까운 불투명 색**으로 채운다.
 *
 * 한 겹씩 바깥으로 번지며 채운다(너비 우선). 칸이 16~64텍셀이라 몇 겹이면 끝난다
 */
function dilate(pixels: Uint8Array, solid: Uint8Array, width: number, height: number): void {
  let edge: number[] = []
  for (let i = 0; i < solid.length; i++) if (solid[i] === 1) edge.push(i)
  const filled = Uint8Array.from(solid)
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  while (edge.length > 0) {
    const next: number[] = []
    for (const i of edge) {
      const x = i % width, y = (i - x) / width
      for (const [dx, dy] of around) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const j = ny * width + nx
        if (filled[j] === 1) continue
        filled[j] = 1
        for (let c = 0; c < 3; c++) pixels[j * 4 + c] = pixels[i * 4 + c]!
        pixels[j * 4 + 3] = 255
        next.push(j)
      }
    }
    edge = next
  }
}

/**
 * 삼각형마다 UV를 만든다. `position`은 비인덱스라 세 정점이 한 면이다.
 *
 * 앞면은 그림을 그대로 펴고(원작 카메라 방향), 나머지는 가운데 조각을 물린다.
 * 옆면은 법선이 큰 축을 빼고 남은 수평축과 높이로 편다 — 판에 그대로 쏘면
 * 옆에서 봤을 때 한 줄이 늘어난다
 */
export function rockUvs(position: Float32Array, tall: number): Float32Array {
  const out = new Float32Array((position.length / 3) * 2)
  // ⚠️ **폭을 0.5로 박으면 안 된다.** 둘레 표(`rockShape`의 `bumps`)가 반지름을
  // 최대 1.14배까지 밀어서 실제 실루엣이 0.5를 넘는다 — 그러면 UV가 1을 넘어
  // 그림 밖을 읽는다. 이 덩이가 실제로 차지하는 폭으로 나눈다
  let half = 0
  for (let i = 0; i < position.length; i += 3) {
    half = Math.max(half, Math.abs(position[i]!), Math.abs(position[i + 2]!))
  }
  if (half <= 0) half = 0.5
  for (let t = 0; t + 8 < position.length; t += 9) {
    const ax = position[t]!, ay = position[t + 1]!, az = position[t + 2]!
    const bx = position[t + 3]!, by = position[t + 4]!, bz = position[t + 5]!
    const cx = position[t + 6]!, cy = position[t + 7]!, cz = position[t + 8]!
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    const front = nz / len > FRONT
    for (let k = 0; k < 3; k++) {
      const px = position[t + k * 3]!, py = position[t + k * 3 + 1]!, pz = position[t + k * 3 + 2]!
      const o = ((t / 3) + k) * 2
      if (front) {
        // 앞면 — 그림 전체를 폭과 키에 맞춰 편다
        out[o] = px / (2 * half) + 0.5
        out[o + 1] = 1 - Math.min(1, Math.max(0, py / tall))
      } else {
        // 옆·뒤 — 가운데 조각을 물린다. 수평은 법선이 작은 축으로 편다
        const across = Math.abs(nx) > Math.abs(nz) ? pz : px
        const s = Math.min(1, Math.max(0, across / (2 * half) + 0.5))
        const r = Math.min(1, Math.max(0, py / tall))
        out[o] = SWATCH.u0 + s * (SWATCH.u1 - SWATCH.u0)
        out[o + 1] = SWATCH.v0 + (1 - r) * (SWATCH.v1 - SWATCH.v0)
      }
    }
  }
  return out
}
