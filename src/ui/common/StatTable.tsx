// 능력치 여섯 줄 (SYSTEM §2.2 `StatTable`) — 이름 · 값 · 성격 ▲▼ · 막대(선택).
//
// 이름은 롬 뱅크 455의 110~115(HP · 공격 · 방어 · 특수공격 · 특수방어 · 스피드)에서 온다 — 한 글자도 안 짓는다.
// 요약(육각형 옆) · 팩토리(막대) · 박스 비교 · 교체 능력치 쪽이 쓴다. 숫자는 Pretendard tabular다.
//
// 성격 ▲▼는 글꼴에 이 글자가 없어서 CSS 세모다. `nature`는 **올리는 쪽과 내리는 쪽의 능력치 칸 번호**이고
// 같으면(무보정 성격) 아무것도 안 그린다. 칸 차례는 이름 배열과 같다(0 HP는 보정이 없으므로 1~5만 본다).
import * as css from './parts.css'

export interface StatRow {
  /** 롬 이름표 (뱅크 455의 110~115) */
  name: string
  value: number
}

export interface NatureEffect {
  /** 올리는 능력치의 칸 번호 (1~5) */
  up: number
  /** 내리는 능력치의 칸 번호 (1~5) */
  down: number
}

/** 이 칸이 성격으로 올라가나(+1) 내려가나(−1) 그대로인가(0) */
export function natureMark(index: number, nature: NatureEffect | undefined): -1 | 0 | 1 {
  if (nature === undefined || nature.up === nature.down) return 0
  if (index === nature.up) return 1
  if (index === nature.down) return -1
  return 0
}

export function StatTable(
  { stats, nature, bars = false, max }: {
    stats: readonly StatRow[]
    nature?: NatureEffect
    /** 막대를 붙인다 (팩토리). 막대의 100%는 `max`다 */
    bars?: boolean
    /** 막대의 최댓값. 안 주면 줄 중 가장 큰 값이다 */
    max?: number
  },
) {
  const top = max ?? Math.max(1, ...stats.map((s) => s.value))
  return (
    <div className={css.statTable} data-stat-table>
      {stats.map((row, i) => {
        const mark = natureMark(i, nature)
        return (
          <div key={i} className={bars ? `${css.statRow} ${css.statRowBars}` : css.statRow}>
            <span className={css.statName}>
              {row.name}
              {mark === 1 && <span className={css.natureUp} aria-label="올라가는 능력치" />}
              {mark === -1 && <span className={css.natureDown} aria-label="내려가는 능력치" />}
            </span>
            <span className={css.statValue}>{row.value}</span>
            {bars && (
              <span className={css.statTrack}>
                <span
                  className={css.statFill}
                  style={{ display: 'block', width: `${String(Math.min(100, (row.value / top) * 100))}%` }}
                />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
