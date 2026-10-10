// 상장 — 벽에 거는 종이 한 장 (`records` §4.4).
//
// ⚠️ **종이는 원작 그림이다** (결정 — 원작 자산은 근사로 줄이지 않는다). `diplomaArt.png`의 아래 192줄이 신오 · 전국도감판
// 종이이고(위 192줄은 바탕), 색과 포켓몬 무늬가 그림에 실려 온다. CSS로 종이를 그리지 않는다 — 그림을 **정수배**로 세운다
// (`diplomaScale`).
//
// ⚠️ **다른 메뉴의 어두운 판을 안 쓴다.** 그러면 「도감을 다 채웠습니다」 알림창이 되어 버리는데, 이건 받아서 거는 물건이다.
// 크기 키우기 팝인이 없다 — 원작은 종이가 **아래에서 위로 흘러 올라온다**(`diploma.c`의 `yOffset`). 아래 28px에서 올라오며 240ms 페이드.
//
// 그림이 없을 때(안 구운 판)만 옛 크림 종이 한 장으로 떨어진다 (`fallback`) — 글은 같다.
import { keyframes, style } from '@vanilla-extract/css'
import { RADIUS } from '../theme/scale'
import { vars } from '../theme/contract.css'

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(28px)' },
  to: { opacity: 1, transform: 'none' },
})

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  background: vars.scrim.deep,
  overflow: 'hidden',
})

/** 뒤 바탕 — 그림 위 192줄(한 색)을 화면 가득 늘인다. 한 색이라 늘여도 도트가 안 상한다 */
export const backdrop = style({
  position: 'absolute',
  inset: 0,
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
})

/** 종이 — 크기와 그림 자리는 부르는 쪽이 인라인으로 준다 (정수배) */
export const paper = style({
  position: 'relative',
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  color: vars.paper.text,
  animation: `${rise} 0.24s ease-out`,
})

/** 글 한 덩어리 — 종이 안 원작 자리(`DIPLOMA_AT`)에 선다. 크기와 자리는 인라인 */
export const text = style({
  position: 'absolute',
  margin: 0,
  whiteSpace: 'pre-line',
  fontWeight: 600,
})

export const player = style({ fontWeight: 800 })

/** 안내 — 어두운 바탕 위의 키캡 한 줄 */
export const hint = style({
  position: 'relative',
  fontFamily: vars.font.ui,
  fontSize: 12,
  // 바탕이 어두운 판이 아니라 그림의 연보라다 — 어두운 판용 글색은 바탕에 묻는다. 종이 글색(어두운 잉크)으로 읽힌다
  color: vars.paper.text,
})

// ─────────────────────────────────────────────────────────────────
// 그림이 없을 때
// ─────────────────────────────────────────────────────────────────

export const fallback = style({
  width: 'min(520px, calc(100vw - 80px))',
  padding: '34px 40px 26px',
  textAlign: 'center',
  color: vars.paper.text,
  background: `linear-gradient(180deg, ${vars.paper.face} 0%, ${vars.paper.faceDim} 100%)`,
  border: `3px double ${vars.paper.edge}`,
  borderRadius: RADIUS.bar,
  animation: `${rise} 0.24s ease-out`,
})

export const fallbackBody = style({
  margin: '0 0 22px',
  fontSize: 17,
  lineHeight: 1.9,
  whiteSpace: 'pre-line',
})

export const fallbackPlayer = style({
  fontSize: 19,
  fontWeight: 800,
  paddingTop: 14,
  borderTop: `1px solid ${vars.paper.edge}`,
})

export const fallbackMaker = style({
  marginTop: 14,
  fontSize: 12,
  color: vars.paper.textDim,
})
