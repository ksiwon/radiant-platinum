// 한 방향 갈색 점프 턱의 **모양** (FIRST_PERSON §7.4 · FP-LEDGE)
//
// ⚠️ **원작 높이 자료에는 단차가 없다.** 턱 341칸이 전부 양쪽이 같은 높이고, 턱은
// 바닥에 그린 **그림**이다 (`allpeak` 32×32의 아래 반쪽). 고정 부감에서는 그림만으로
// 「여기는 뛰어내리는 곳」이 읽혔지만 1인칭에서는 갈색 선일 뿐이다.
//
// 그래서 그림이 차지한 자리에 **닫힌 쐐기**를 얹는다. 지우는 것은 없다 — 원본 카드는
// 그대로 두고(그 앞의 땅 그림자가 거기 있다) 갈색 띠만 쐐기 밑에 가린다.
//
// 자리는 칸을 텍셀로 읽어 정했다 (묶음 6·62, 2026-09-18). 카드의 v가 16.25…31.75라
// 칸 안 자리는 t = (행 − 16.25) / 15.5다:
//
// ```
//  행 21~22  t 0.306…0.435   윗면 (밝은 테)      #cea58c
//  행 23~28  t 0.435…0.823   갈색 앞면           #84524a · #5a3939
//  행 29     t 0.823…0.887   앞면 밑            #4a3931
//  행 30     t 0.887…0.952   **땅에 진 그림자**  #7b7363 — 입체에 안 칠한다 (§5.4)
// ```
//
// 높이 0.18과 모서리 0.02는 원작 실측값이 아니다 — §7.4.3의 초기값이고, 전에 쓰던
// 장식 상자의 높이를 그대로 이었다.
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { ledgeJump } from '../engine/actor/ledge'

interface LedgeFacing { dx: number; dz: number; yaw: number }

/** 턱 행동값을 3D 앞면의 방향으로 바꾼다. */
export function ledgeFacing(behavior: number): LedgeFacing | null {
  const jump = ledgeJump(behavior)
  if (!jump) return null
  const [dx, dz] = jump
  return { dx, dz, yaw: Math.atan2(dx, dz) }
}

/** 칸 안 자리와 높이 — 위 표에서 온 값 */
export const LEDGE = {
  /** 윗면이 시작하는 자리 (접근 쪽) */
  backV: 0.306,
  /** 앞면이 땅으로 닫히는 자리 (착지 쪽) */
  frontV: 0.823,
  lipHeight: 0.18,
  bevel: 0.02,
} as const

/** 칸 하나 — 세계 타일 자리와 뛰는 방향 */
export interface LedgeTile { x: number; z: number; y: number; dx: number; dz: number }

/** 이어 붙인 한 줄 */
interface LedgeRun {
  /** 줄의 첫 칸 (접선 축에서 가장 작은 쪽) */
  x: number
  z: number
  y: number
  dx: number
  dz: number
  /** 이어진 칸 수 */
  tiles: number
}

/**
 * 같은 방향·같은 높이로 **맞닿은 칸**을 접선 축으로 잇는다 (§7.4.4).
 *
 * ⚠️ **높이가 다르면 끊는다** — 이어 놓으면 계단이 한 줄로 뭉개진다.
 * 세계 좌표로 정렬하므로 청크가 어떤 차례로 들어와도 같은 줄이 나온다
 */
export function ledgeRuns(tiles: readonly LedgeTile[]): LedgeRun[] {
  const key = (t: LedgeTile) => `${String(t.dx)},${String(t.dz)},${t.y.toFixed(3)}`
  const byKind = new Map<string, LedgeTile[]>()
  for (const t of tiles) {
    const k = key(t)
    const got = byKind.get(k)
    if (got) got.push(t)
    else byKind.set(k, [t])
  }
  const out: LedgeRun[] = []
  for (const group of byKind.values()) {
    // 접선 축 — 뛰는 방향의 직각. 남쪽 턱은 x축, 동·서 턱은 z축으로 이어진다
    const along: 'x' | 'z' = group[0]!.dz === 0 ? 'z' : 'x'
    const other: 'x' | 'z' = along === 'x' ? 'z' : 'x'
    group.sort((a, b) => a[other] - b[other] || a[along] - b[along])
    let run: LedgeRun | null = null
    for (const t of group) {
      const goes = run !== null && t[other] === run[other]
        && t[along] === run[along] + run.tiles
      if (goes) { run!.tiles += 1; continue }
      run = { x: t.x, z: t.z, y: t.y, dx: t.dx, dz: t.dz, tiles: 1 }
      out.push(run)
    }
  }
  return out
}

/** 앞면·윗면·끝단의 색 */
export interface LedgeSwatch {
  top: number
  front: number
  frontLow: number
  end: number
}

type Pixels = { width: number; pixels: Uint8Array | Uint8ClampedArray }
type Item = { x: number; y: number; w: number; h: number }

/** 한 줄(칸 하나 폭)에서 많이 쓰인 색부터 */
function rowColors(sheet: Pixels, item: Item, row: number): number[] {
  const seen = new Map<number, number>()
  for (let x = 0; x < Math.min(16, item.w); x++) {
    const o = ((item.y + row) * sheet.width + item.x + x) * 4
    if (sheet.pixels[o + 3]! < 128) continue
    const c = (sheet.pixels[o]! << 16) | (sheet.pixels[o + 1]! << 8) | sheet.pixels[o + 2]!
    seen.set(c, (seen.get(c) ?? 0) + 1)
  }
  return [...seen].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c)
}

/**
 * `allpeak` 칸(0,16,32,32)의 역할별 색.
 *
 * ⚠️ **행 하나씩 꺼내 세로 띠로 쓰지 않는다.** 원작 앞면은 벽돌 무늬라 행마다
 * 밝기가 오르내린다 (행 26이 어둡고 행 28이 다시 밝다 — 실측). 세로로 늘어놓으면
 * 없던 줄무늬가 생기므로, 앞면은 **행 23~28 전체에서 많이 쓰인 색**을 쓰고 밑만
 * 행 29에서 어둡게 받는다. 행 30(땅 그림자)은 안 쓴다
 */
export function ledgeSwatch(sheet: Pixels, item: Item): LedgeSwatch | null {
  if (item.h < 32 || item.w < 16) return null
  const top = rowColors(sheet, item, 22)[0]
  const body = new Map<number, number>()
  for (let row = 23; row <= 28; row++) {
    for (const [i, c] of rowColors(sheet, item, row).entries()) {
      body.set(c, (body.get(c) ?? 0) + (i === 0 ? 3 : 1))
    }
  }
  const ranked = [...body].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c)
  const low = rowColors(sheet, item, 29)[0]
  if (top === undefined || ranked.length < 2 || low === undefined) return null
  return { top, front: ranked[0]!, end: ranked[1]!, frontLow: low }
}

const linear = (hex: number): [number, number, number] => {
  const c = new Color().setHex(hex)
  return [c.r, c.g, c.b]
}

/**
 * 줄 하나의 **닫힌 쐐기** (§7.4.3). 원점은 줄 첫 칸의 한가운데, +x가 접선 축,
 * +z가 뛰는 쪽이다. 부르는 쪽이 `yaw`로 돌린다.
 *
 * 단면은 뒤에서 `bevel`만큼 올라가 `frontV`까지 평평하고 거기서 땅으로 떨어진다.
 * 끝단 뚜껑은 **드러난 양 끝에만** 붙는다 — 이웃과 나눠 갖는 단면에는 안 붙인다.
 * 여기서는 줄 전체를 한 덩이로 만들므로 안쪽 뚜껑이 애초에 안 생긴다
 */
export function ledgeGeometry(tiles: number, swatch: LedgeSwatch): BufferGeometry {
  const L = LEDGE
  const x0 = -0.5, x1 = tiles - 0.5
  const back = L.backV - 0.5, front = L.frontV - 0.5
  const h = L.lipHeight
  const position: number[] = []
  const color: number[] = []
  const index: number[] = []
  const rgb = { top: linear(swatch.top), front: linear(swatch.front), low: linear(swatch.frontLow), end: linear(swatch.end) }
  const quad = (
    a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[],
    ca: [number, number, number], cd?: [number, number, number],
  ) => {
    const base = position.length / 3
    position.push(...a, ...b, ...c, ...d)
    const top = cd ?? ca
    color.push(...ca, ...ca, ...top, ...top)
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const ramp = back + L.bevel
  // ⚠️ **바깥에서 보아 반시계로 감는다.** 뒤집으면 법선이 안을 봐서 Lambert가
  // 그 면을 까맣게 칠한다 — 윗면이 그랬다 (실측 `ledge-after` 첫 판)
  // 뒤 모서리 — 땅에서 윗면까지 짧게 올라간다
  quad([x0, h, ramp], [x1, h, ramp], [x1, 0, back], [x0, 0, back], rgb.top)
  // 윗면
  quad([x0, h, front], [x1, h, front], [x1, h, ramp], [x0, h, ramp], rgb.top)
  // 앞면 — 밑이 어둡다
  quad([x0, 0, front], [x1, 0, front], [x1, h, front], [x0, h, front], rgb.low, rgb.front)
  // 밑면 (땅에 닿는다)
  quad([x0, 0, front], [x0, 0, back], [x1, 0, back], [x1, 0, front], rgb.front)
  // 드러난 양 끝
  quad([x1, h, ramp], [x1, h, front], [x1, 0, front], [x1, 0, back], rgb.end)
  quad([x0, 0, back], [x0, 0, front], [x0, h, front], [x0, h, ramp], rgb.end)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
