// 확인 지점 화면 — 메뉴 껍데기를 그대로 쓰고 여기서는 차이만 적는다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 시험용이라는 표시. 게임 화면과 헷갈리면 안 된다 */
export const badge = style({
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.08em',
  padding: '3px 10px',
  borderRadius: 999,
  background: '#f0b429',
  color: '#241a02',
})

export const rowNote = style({
  marginLeft: 'auto',
  fontSize: 13,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
})

/** 오른쪽 칸 아래에 붙는 조건 목록 */
export const setup = style({
  marginTop: 18,
  paddingTop: 14,
  borderTop: `1px solid ${vars.panel.border}`,
  fontSize: 15,
  lineHeight: '24px',
  opacity: 0.9,
})

export const setupKey = style({
  display: 'inline-block',
  minWidth: 68,
  opacity: 0.65,
})

/**
 * 오른쪽 칸 맨 위 — **어떤 환경인가.**
 *
 * 무엇을 볼지 고르기 전에 어디로 가는지부터 알아야 한다. 그래서 확인 목록보다
 * 위에, 눈에 먼저 들어오게 둔다
 */
export const env = style({
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(240, 180, 41, 0.12)',
  border: '1px solid rgba(240, 180, 41, 0.35)',
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.45,
})

/** 해 볼 만한 것들 */
export const tryList = style({
  margin: '16px 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 8,
  fontSize: 15,
  lineHeight: 1.5,
})

export const tryItem = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 9,
  alignItems: 'baseline',
})

/** 앞에 붙는 점. 목록으로 읽히게만 한다 */
export const tryMark = style({
  color: '#f0b429',
  fontSize: 11,
  lineHeight: 1.7,
})

/** 오른쪽 칸 제목 */
export const sectionTitle = style({
  marginTop: 18,
  fontSize: 12,
  letterSpacing: '0.12em',
  opacity: 0.55,
})
