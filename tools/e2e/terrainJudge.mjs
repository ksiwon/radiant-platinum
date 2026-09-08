// **지형이 그려졌는가** — 컷을 칸으로 나눠 재는 자.
//
// ⚠️ **색 개수만으로는 지형을 인정하면 안 된다.** `looksFlat`은 「색 64 미만
// 또는 흩어짐 3 미만」인데, 하늘 그라데이션 한 장은 그 둘을 다 넘긴다 —
// 실측(2026-09-08 판정용 journey): 지형도 사람도 한 점 없는 노을 한 장이
// **색 16**으로 떨어졌지만(운 좋게), 같은 판의 `stop-10`은 **까만 원반 위에
// 주인공만** 떠 있는데 색 개수로는 **통과**했고 `stop-11`은 바닥이 위쪽 한 줄만
// 그려졌는데도 통과했다. 통과한 두 컷 다 눈으로 보면 망가진 화면이다.
//
// 그래서 **어디에 무엇이 있는가**를 본다. 칸을 4×3으로 나누고, 각 칸이
// 「구조가 있는가」(색이 여럿이고 밝기가 흩어졌는가)를 따로 잰다. 지형은
// 아래 두 줄을 채운다 — 카메라가 3/4 내려다보는 각이라 바닥이 화면 아래
// 삼분의 이를 덮는다.
//
// ⚠️ **정상 하늘과 정상 실내를 거절하면 안 된다.** 위 한 줄은 안 본다(실외는
// 거기가 하늘이다). 실내의 검은 여백도 아래 줄에 **바닥**이 있으면 통과한다 —
// 문턱은 아래 「고른 값」의 실측으로 잡았다.
import { decodePng } from '../shot/png.mjs'

const COLS = 4
const ROWS = 3

/**
 * 한 칸이 「구조가 있는가」의 문턱.
 *
 * ⚠️ **색 개수가 아니라 밝기 흩어짐이 가른다.** 실측(아래 대조 컷)에서
 * **성한 실내 바닥**은 색이 14~22개밖에 안 됐다 — 장판과 융단이 넓은 단색
 * 면이라 그렇다. 색으로 문턱을 잡으면 **멀쩡한 침실이 떨어진다.** 반대로
 * 흩어짐은 갈린다: 못 그린 하늘 칸이 0.0~3.8이고 그린 칸이 17~81이다.
 *
 * 색 문턱은 「완전한 단색」만 걷어내는 낮은 값으로 둔다
 */
const CELL_COLORS = 8
const CELL_STDEV = 8

/**
 * 아래 두 줄(=지형 자리) 여덟 칸 중 몇 칸이 채워져야 하는가.
 *
 * 실측 대조로 잡았다 — **성한 컷 열여덟 장이 6~8칸**이고 **망가진 컷 여섯
 * 장이 0~5칸**이다 (`tools/e2e/terrainJudge.test.mjs`가 그 컷들을 그대로 건다)
 */
const NEED = 6

/** 칸마다의 색 수와 밝기 흩어짐 */
export function cellStats(png) {
  const { w, h, bpp, pixels } = decodePng(png)
  const out = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = Math.floor(c * w / COLS), x1 = Math.floor((c + 1) * w / COLS)
      const y0 = Math.floor(r * h / ROWS), y1 = Math.floor((r + 1) * h / ROWS)
      const set = new Set()
      let sum = 0, sum2 = 0, n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * bpp
          const R = pixels[o], G = pixels[o + 1], B = pixels[o + 2]
          const l = (R * 299 + G * 587 + B * 114) / 1000
          sum += l; sum2 += l * l; n += 1
          set.add((R >> 3 << 10) | (G >> 3 << 5) | (B >> 3))
        }
      }
      const mean = sum / n
      out.push({
        r, c, colors: set.size,
        stdev: Number(Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1)),
      })
    }
  }
  return out
}

/**
 * 이 컷에 지형이 있는가.
 *
 * @returns `{ drawn, filled, need, roi, why, cells }` — `filled`는 채워진 아래칸 수
 */
export function judgeTerrain(png) {
  const cells = cellStats(png)
  const roi = cells.filter((x) => x.r >= 1)
  const filled = roi.filter((x) => x.colors >= CELL_COLORS && x.stdev >= CELL_STDEV).length
  const drawn = filled >= NEED
  return {
    drawn,
    filled,
    need: NEED,
    roi: roi.length,
    why: drawn ? null
      : `아래 ${String(roi.length)}칸 중 ${String(filled)}칸만 채워졌다`
        + ` (${String(NEED)}칸 필요) — 지형이 안 그려졌다`,
    cells,
  }
}

/** 칸 표를 사람이 읽게 편다 */
export function cellGrid(cells) {
  const rows = []
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.filter((x) => x.r === r)
      .map((x) => `${String(x.colors).padStart(5)}/${x.stdev.toFixed(1).padStart(5)}`).join(' '))
  }
  return rows
}
