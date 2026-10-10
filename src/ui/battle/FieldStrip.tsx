// 날씨 · 필드 띠 — 위 가운데, **있을 때만** (battlehud §4.8).
//
// 뷰에 있는 날씨(`weather`)와 필드(`field` — 트릭룸 · 중력)는 글창 줄로 한 번 지나가고 끝이라, 두세 턴 뒤에는
// 화면에서 읽을 수 없었다. 이 띠가 그 값을 남긴다. 이름은 **기술 이름**(롬)이고, 남은 턴 수는 뷰에 없으므로
// 안 적는다 — 지어내지 않는다. 칸이 없으면 띠 자체를 안 그린다.
//
// 글리프는 14px 인라인 SVG다. 색은 토큰이다(`match.resisted` · `match.superEff`).
import type { ReactNode } from 'react'
import { vars } from '../theme/contract.css'
import { stripCells, type StripCell } from './hudShapes'
import * as css from './battleScreen.css'

/** 날씨 · 필드 하나의 그림. 선 하나로 그린다 — 14px라 안이 차면 뭉개진다 */
function Glyph({ cell }: { cell: StripCell }): ReactNode {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round' as const }
  const cool = vars.match.resisted
  const warm = vars.match.superEff
  switch (cell.id) {
    case 'RainDance':
      return (
        <svg {...common} stroke={cool} aria-hidden>
          <path d="M3 5a3 3 0 0 1 3-3 3.5 3.5 0 0 1 6 2 2 2 0 0 1-.5 4H4A2 2 0 0 1 3 5z" />
          <path d="M5 11l-.8 2M8 11l-.8 2M11 11l-.8 2" />
        </svg>
      )
    case 'SunnyDay':
      return (
        <svg {...common} stroke={warm} aria-hidden>
          <circle cx="7" cy="7" r="2.6" />
          <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" />
        </svg>
      )
    case 'Sandstorm':
      return (
        <svg {...common} stroke={warm} aria-hidden>
          <path d="M1 4h8a2 2 0 1 0-2-2M1 8h10a2 2 0 1 1-2 2M1 12h6" />
        </svg>
      )
    case 'Hail':
      return (
        <svg {...common} stroke={cool} aria-hidden>
          <path d="M7 1v12M1.8 4l10.4 6M1.8 10l10.4-6" />
        </svg>
      )
    case 'trickroom':
      return (
        <svg {...common} stroke={cool} aria-hidden>
          <path d="M2 2h10v10H2zM2 12L12 2" />
        </svg>
      )
    default:
      // 중력 — 아래를 가리키는 화살표
      return (
        <svg {...common} stroke={cool} aria-hidden>
          <path d="M7 1v11M3 8l4 4 4-4" />
        </svg>
      )
  }
}

export function FieldStrip(
  { weather, field, moveNames }: {
    weather: string | null
    field: ReadonlySet<string>
    /** 기술 이름표(번호로 색인) — 날씨와 필드의 이름이 여기서 온다 */
    moveNames: readonly string[]
  },
) {
  const cells = stripCells(weather, field, moveNames)
  if (cells.length === 0) return null
  return (
    <div className={css.fieldStrip} data-field-strip>
      {cells.map((cell) => (
        <span key={cell.key} className={css.fieldCell}>
          <Glyph cell={cell} />
          <span aria-label={cell.text}>{cell.text}</span>
        </span>
      ))}
    </div>
  )
}
