// 능력 육각형 (BDSP `sum_pl_chart_01_stats`).
//
// 꼭짓점은 위부터 시계 방향으로 HP · 공격 · 방어 · 스피드 · 특수방어 · 특수공격이다. **바깥 고리는 이 마리의 가장 큰
// 능력치다** — 절대 눈금이면 낮은 레벨의 마리가 5% 크기로 오그라든다. 0이면 가운데다.
//
// 그리는 일만 한다. 숫자와 ▲▼는 옆의 줄이 말한다 (`SummaryScreen`의 `StatTable`).
import { vars } from '../theme/contract.css'
import * as css from './summaryScreen.css'

/** 꼭짓점의 능력치 차례 — 위에서부터 시계 방향. 엔진 칸 이름이다 */
export const CHART_ORDER = ['hp', 'atk', 'def', 'spe', 'spd', 'spa'] as const
export type ChartKey = (typeof CHART_ORDER)[number]

interface Point { x: number, y: number }

/**
 * 꼭짓점 여섯의 좌표. 첫 꼭짓점이 위(−90°)이고 60°씩 시계 방향이다.
 *
 * @param values 꼭짓점 차례대로의 값 여섯
 * @param max 바깥 고리가 되는 값. 0 이하면 전부 가운데다
 */
export function hexPoints(
  values: readonly number[], max: number, cx: number, cy: number, radius: number,
): Point[] {
  return values.map((value, i) => {
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
    const angle = (-90 + 60 * i) * (Math.PI / 180)
    return { x: cx + radius * ratio * Math.cos(angle), y: cy + radius * ratio * Math.sin(angle) }
  })
}

/** SVG `points` 문자열. 소수 첫째 자리까지 쓴다 */
export function toPoints(points: readonly Point[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

const CX = 150
const CY = 110
const R = 96

interface ChartLabel {
  key: ChartKey
  /** 롬 이름표 (뱅크 455의 110~115) */
  name: string
  /** 성격이 올린 쪽이면 1, 내린 쪽이면 −1 */
  mark: -1 | 0 | 1
}

export function StatChart(
  { values, labels, accent }: {
    /** 꼭짓점 차례(`CHART_ORDER`)의 능력치 여섯 */
    values: readonly number[]
    labels: readonly ChartLabel[]
    /** 면 색 — 쪽 색(`vars.page.skills`) */
    accent: string
  },
) {
  const max = Math.max(0, ...values)
  const outer = hexPoints([1, 1, 1, 1, 1, 1], 1, CX, CY, R)
  const ring = (ratio: number): string => toPoints(hexPoints([1, 1, 1, 1, 1, 1], 1, CX, CY, R * ratio))
  const shape = hexPoints(values, max, CX, CY, R)
  // 이름표는 꼭짓점 바깥 14px에 둔다. 위 · 아래 꼭짓점은 가운데 맞춤, 오른쪽은 왼쪽 맞춤, 왼쪽은 오른쪽 맞춤
  const label = (i: number): { x: number, y: number, anchor: 'start' | 'middle' | 'end' } => {
    const p = outer[i]!
    if (i === 0) return { x: p.x, y: p.y - 10, anchor: 'middle' }
    if (i === 3) return { x: p.x, y: p.y + 20, anchor: 'middle' }
    return { x: p.x + (i < 3 ? 12 : -12), y: p.y + (i === 1 || i === 5 ? -6 : 14), anchor: i < 3 ? 'start' : 'end' }
  }
  return (
    <svg className={css.chart} width={308} height={250} viewBox="-4 -12 308 250" aria-hidden>
      <polygon
        points={toPoints(outer)}
        style={{ fill: vars.chart.face, stroke: vars.chart.edge }}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <polygon points={ring(2 / 3)} fill="none" style={{ stroke: vars.chart.spoke }} strokeWidth={1} />
      <polygon points={ring(1 / 3)} fill="none" style={{ stroke: vars.chart.spoke }} strokeWidth={1} />
      <g style={{ stroke: vars.chart.spoke }} strokeWidth={1.5}>
        {outer.map((p, i) => <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} />)}
      </g>
      <polygon
        points={toPoints(shape)}
        style={{ fill: `color-mix(in srgb, ${accent} 55%, transparent)`, stroke: vars.chart.edge }}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {labels.map((one, i) => {
        const at = label(i)
        const tone = one.mark === 1 ? css.chartUp : one.mark === -1 ? css.chartDown : css.chartText
        return <text key={one.key} x={at.x} y={at.y} textAnchor={at.anchor} className={tone}>{one.name}</text>
      })}
    </svg>
  )
}
