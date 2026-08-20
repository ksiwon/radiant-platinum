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

// ── 왼쪽: 단계로 묶은 칸들 ───────────────────────────────────────────────────
//
// ⚠️ **세로 한 줄로 늘어놓지 않는다.** 지점이 쉰 개를 넘으면 훑는 데만 한참
// 걸린다. 이야기 단계로 묶고 칸을 옆으로 채우면 한 화면에 거의 다 들어온다

export const groups = style({
  overflowY: 'auto',
  display: 'grid',
  gap: 18,
  alignContent: 'start',
  paddingRight: 6,
})

export const group = style({
  display: 'grid',
  gap: 8,
})

export const groupTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.14em',
  opacity: 0.62,
  // 제목 줄이 칸들과 붙어 보이지 않게 밑줄 하나
  paddingBottom: 5,
  borderBottom: `1px solid ${vars.panel.border}`,
})

/** 그 단계에 몇 개 있는가 */
export const groupCount = style({
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0,
  padding: '1px 7px',
  borderRadius: 999,
  background: 'rgba(240, 180, 41, 0.16)',
  color: '#f0b429',
})

export const chips = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 7,
})

const chipBase = {
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 13px',
  fontFamily: vars.font.ui,
  fontSize: 14,
  lineHeight: 1.2,
  color: vars.panel.text,
  background: 'rgba(255, 255, 255, 0.05)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 999,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 90ms linear, border-color 90ms linear',
} as const

export const chip = style(chipBase)

/**
 * 지금 올려놓은 칸.
 *
 * 마우스 hover와 키보드 커서를 **같은 표시**로 둔다 — 둘이 다르면 어느 쪽이
 * 오른쪽에 떠 있는 칸인지 헷갈린다
 */
export const chipOn = style({
  ...chipBase,
  background: 'rgba(240, 180, 41, 0.18)',
  borderColor: 'rgba(240, 180, 41, 0.7)',
  fontWeight: 700,
})

/** 배틀이 열리는 자리·시각을 못 박는 자리 표시 */
export const chipMark = style({
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  padding: '1px 6px',
  borderRadius: 999,
  background: 'rgba(240, 180, 41, 0.20)',
  color: '#f0b429',
})

/** 오른쪽 칸 맨 위 — 지금 올려놓은 지점의 이름 */
export const detailName = style({
  margin: '0 0 10px',
  fontSize: 20,
  fontWeight: 800,
  lineHeight: 1.25,
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
