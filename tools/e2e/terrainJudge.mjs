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
 * **계약 1의 문턱이었다 — 지금은 판정에 안 쓴다.** 값 자체는 계속 재서 표에
 * 적는다(사람이 읽고 옛 판정과 견주는 값이다). 왜 물러났는지는 `CELL_EDGE`에
 * 있다.
 *
 * ⚠️ **색 개수가 아니라 밝기 흩어짐이 가른다.** 실측(아래 대조 컷)에서
 * **성한 실내 바닥**은 색이 14~22개밖에 안 됐다 — 장판과 융단이 넓은 단색
 * 면이라 그렇다. 색으로 문턱을 잡으면 **멀쩡한 침실이 떨어진다.** 반대로
 * 흩어짐은 갈린다: 못 그린 하늘 칸이 0.0~3.8이고 그린 칸이 17~81이다.
 *
 * 색 문턱은 「완전한 단색」만 걷어내는 낮은 값으로 둔다
 */
/**
 * **계약 2 — 「무늬가 있는가」가 아니라 「가장자리까지 무언가 있는가」다.**
 *
 * ⚠️ **계약 1(색 개수 + 밝기 흩어짐)은 정상 실내를 거절했다.** 축복시티
 * 포켓몬센터의 크림색 장판은 넓고 매끄러워서 흩어짐이 **4~7**밖에 안 되는데,
 * 못 그린 하늘도 **8** 언저리다 — 실측(`judge-false-negative/`)으로 문턱을
 * 어디에 놓아도 그 둘이 안 갈렸고, 칸을 잘게 나눠도 최소값이 같이 내려갔다.
 *
 * 갈리는 것은 **무늬의 세기가 아니라 무언가가 있느냐**다. 지형이 그려졌으면
 * 그 칸은 매끄러워도 **명암이 조금씩 변한다** — 바닥이 원근으로 기울고 빛이
 * 앉기 때문이다. 못 그린 자리는 **말 그대로 아무 변화가 없다**: 클리어 색
 * 한 장이거나 세로로만 변하는 하늘이다. 그래서 칸마다 **이웃 화소 차이의
 * 평균**(가로 + 세로)을 재고, 그것이 0에 가까우면 죽은 칸으로 센다.
 *
 * 실측 값 (개발 대조군 13장 · 합성 7장, `.audit/terrain-controls`):
 *
 * | 무리 | 칸값 |
 * | --- | --- |
 * | 성한 컷의 **가장 낮은 칸** | **0.47** (센터 반례의 매끄러운 장판) |
 * | 망가진 실측 컷의 **가장 높은 죽은 칸** | 0.10 (까만 원반의 바깥 칸) |
 * | 합성 하늘 그라데이션 (거절해야 한다) | 0.33 |
 *
 * 창이 `0.33 < T ≤ 0.47`이라 **가운데인 0.40**을 잡았다. 이 값은 **개발
 * 대조군에서 나왔다** — 보류 검증셋 평가 전에 못 박고, 그 뒤로는 안 움직인다
 */
const CELL_EDGE = 0.40

/** 이 판정의 계약 번호. 뜻이 바뀌면 올린다 — 옛 JSON의 판정과 안 섞으려고 적는다 */
export const JUDGE_CONTRACT = 2

/**
 * **화면 밖**으로 치는 칸 — 거의 완전한 검정.
 *
 * ⚠️ **정상 실내가 여기 걸린다.** 카메라가 방 상자에 물리기 전에는 방이 화면
 * 위쪽에만 들어가고 아래가 통째로 검다 — 실측(2026-09-08 센터 왕복)에서
 * **눈으로 봐 멀쩡한 컷**이 아래 네 칸이 검어 4/8로 떨어졌다. 그 검정은
 * 「못 그린 것」이 아니라 **그릴 것이 없는 자리**다.
 *
 * ⚠️ **망가진 컷의 빈 하늘은 여기 안 걸린다.** 그쪽은 밝다 — 노을이 밝기 100
 * 언저리고 파란 여백도 78이다. 그래서 **밝기까지** 봐야 둘이 갈린다
 */
const VOID_MEAN = 8
const VOID_STDEV = 1

/**
 * 「화면 밖」을 뺀 지형 자리 중 **몇 할**이 채워져야 하는가.
 *
 * 실측 대조로 잡았다 (`tools/e2e/terrainJudge.test.mjs`가 컷을 그대로 건다) —
 * 성한 컷이 75~100%이고 망가진 컷이 0~63%다
 */
const NEED_RATIO = 0.7
/**
 * 살아 있는 칸이 이보다 적으면 판정할 거리가 못 된다.
 *
 * ⚠️ **2였을 때 구멍이 뚫려 있었다.** 검은 바탕에 아래 가운데 두 칸만 무늬인
 * 그림이 「2칸 중 2칸 = 100%」로 **통과했다** — 합성 대조 「검정-바탕에-두칸만」의
 * 실측이다. 아래 규칙(줄 단위 제외)과 함께 살아 있는 칸은 늘 4 아니면 8이 된다
 */
const MIN_LIVE = 4

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
      // 이웃 화소와의 차이 — 칸 오른쪽·아래 한 줄은 짝이 없어 못 센다
      let edge = 0, en = 0
      const at = (x, y) => {
        const o = (y * w + x) * bpp
        return (pixels[o] * 299 + pixels[o + 1] * 587 + pixels[o + 2] * 114) / 1000
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * bpp
          const R = pixels[o], G = pixels[o + 1], B = pixels[o + 2]
          const l = (R * 299 + G * 587 + B * 114) / 1000
          sum += l; sum2 += l * l; n += 1
          set.add((R >> 3 << 10) | (G >> 3 << 5) | (B >> 3))
          if (x + 1 < x1 && y + 1 < y1) {
            edge += Math.abs(at(x + 1, y) - l) + Math.abs(at(x, y + 1) - l)
            en += 1
          }
        }
      }
      const mean = sum / n
      out.push({
        r, c, colors: set.size, mean: Number(mean.toFixed(1)),
        stdev: Number(Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1)),
        /** 계약 2가 보는 값 — 이웃 화소 차이의 평균 */
        edge: Number((en === 0 ? 0 : edge / en).toFixed(3)),
      })
    }
  }
  return out
}

/**
 * **화면 밖**으로 빼 줄 줄(row)을 고른다 — **아래에서 위로, 통째로만.**
 *
 * ⚠️ **칸 하나씩 빼면 안 된다.** 「검다」는 픽셀만으로 그 자리가 원래 화면
 * 밖이라고 증명하지 못한다. 칸 단위로 빼 주면 **검은 바탕에 두 칸만 무늬인
 * 그림이 「2칸 중 2칸」으로 통과한다** — 합성 대조로 실측한 구멍이다.
 *
 * 진짜 여백은 **구조**가 있다. 카메라가 방 상자에 물리기 전의 검정은 화면
 * **아래 가장자리부터 줄을 통째로** 채운다 (실측 「실내-센터-카메라넓을때」:
 * 아랫줄 네 칸이 모두 색 1개·밝기 0.0·흩어짐 0.0). 그래서 **맨 아랫줄이
 * 통째로 검을 때만** 그 줄을 빼고, 그 위 줄은 아랫줄이 이미 빠졌을 때만 본다.
 * 흩어져 있는 검은 칸은 **안 빼고 「안 채워진 칸」으로 센다**
 */
function voidRows(all) {
  const out = []
  for (let r = ROWS - 1; r >= 1; r--) {
    const row = all.filter((x) => x.r === r)
    if (row.length === 0) break
    if (!row.every((x) => x.mean < VOID_MEAN && x.stdev < VOID_STDEV)) break
    out.push(r)
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
  const all = cells.filter((x) => x.r >= 1)
  const roi = all.filter((x) => !voidRows(all).includes(x.r))
  // ⚠️ **계약 2다.** 색 개수·흩어짐은 계속 재서 표에 적지만(사람이 읽는 값이고
  // 옛 판정과 견주는 값이다) **판정에는 안 쓴다** — 그 둘이 정상 실내를 거절했다
  const filled = roi.filter((x) => x.edge >= CELL_EDGE).length
  const ratio = roi.length === 0 ? 0 : filled / roi.length
  const drawn = roi.length >= MIN_LIVE && ratio >= NEED_RATIO
  return {
    contract: JUDGE_CONTRACT,
    drawn,
    filled,
    roi: roi.length,
    voids: all.length - roi.length,
    ratio: Number(ratio.toFixed(2)),
    need: NEED_RATIO,
    why: drawn ? null
      : roi.length < MIN_LIVE
        ? `지형 자리 ${String(all.length)}칸이 전부 검다 — 그릴 것이 아무것도 없다`
        : `지형 자리 ${String(roi.length)}칸 중 ${String(filled)}칸만 살아 있다`
          + ` (${String(Math.round(ratio * 100))}% · ${String(Math.round(NEED_RATIO * 100))}% 필요)`
          + ' — 지형이 안 그려졌다',
    cells,
  }
}

/** 칸 표를 사람이 읽게 편다 */
export function cellGrid(cells) {
  const rows = []
  for (let r = 0; r < ROWS; r++) {
    rows.push(cells.filter((x) => x.r === r)
      .map((x) => `${x.edge.toFixed(2).padStart(6)}|${String(x.colors).padStart(3)}/${x.stdev.toFixed(1).padStart(5)}`)
      .join(' '))
  }
  return rows
}
