import { style } from '@vanilla-extract/css'
import { vars } from '../../ui/theme/contract.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  overflowY: 'auto',
  padding: 'clamp(20px, 4vh, 48px) clamp(16px, 4vw, 56px)',
  background: 'linear-gradient(180deg, #0a1020 0%, #121a2c 60%, #0a1020 100%)',
  color: vars.panel.text,
  fontFamily: vars.font.ui,
})

/**
 * 타이틀 그림 — **이 화면이 곧 첫 화면이다.**
 *
 * 설치 전에는 `BootGate`가 `<App/>`을 아예 안 그리므로(그리면 타이틀 음악·UI
 * 글·맵 미리받기가 그 자리에서 요청으로 나간다) 사용자가 처음 만나는 것은
 * 타이틀이 아니라 여기다. 그러니 여기가 타이틀처럼 보여야 한다.
 *
 * ⚠️ **이 그림은 앱 셸이라 설치 전에도 있다** (`tools/distribution/appShell.mjs`).
 * `/data`·`/models`가 아니므로 「미설치에서 콘텐츠 요청 0건」(e2e ①)도 그대로다.
 *
 * ⚠️ **글을 위해 그림을 더 죽이지 않는다.** 읽히게 하는 일은 `sheet`의 판이
 * 맡는다. 여기서 더 어둡게 깔면 판 바깥까지 같이 어두워져 그림을 넣은 뜻이
 * 없어진다 — 판이 덮지 않는 가장자리에서만 보이면 된다
 */
export const sky = style({
  position: 'fixed',
  inset: 0,
  zIndex: -2,
  backgroundColor: '#070c16',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  backgroundImage: [
    'linear-gradient(180deg, rgba(7, 12, 22, 0.58) 0%, rgba(7, 12, 22, 0.70) 55%,'
    + ' rgba(5, 8, 15, 0.86) 100%)',
    "url('/assets/radiant-platinum-intro.png')",
  ].join(', '),
})

/** 화면에 보이는 제목. 비공식 고지가 바로 아래 붙는다 (COPYRIGHT.md §11) */
export const crest = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
})

export const crestName = style({
  margin: 0,
  fontSize: 30,
  letterSpacing: '0.03em',
  fontWeight: 700,
})

export const crestNote = style({
  fontSize: 12,
  opacity: 0.72,
  letterSpacing: '0.02em',
})

/**
 * 준비물 둘.
 *
 * ⚠️ **맨 앞에 둔다.** 이 화면에서 사람이 제일 먼저 알아야 하는 것은 단계
 * 목록이 아니라 **무엇을 미리 갖고 와야 하는가**다. 그것이 없으면 아래를
 * 아무리 읽어도 할 수 있는 것이 없다
 */
export const lead = style({
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(110, 168, 255, 0.42)',
  background: 'rgba(18, 30, 54, 0.72)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
})

export const leadHead = style({
  fontSize: 15,
  fontWeight: 700,
})

export const needs = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  lineHeight: 1.7,
})

/** 준비됐는가. ● 이 초록이면 그 하나는 끝난 것이다 */
export const needMark = style({
  marginRight: 8,
  fontSize: 11,
})

/**
 * 비공식 고지 — 설치 전 사용자는 타이틀을 못 보므로 **여기가 유일한 자리다**.
 *
 * ⚠️ 제목 바로 아래다. 아래쪽 끝에 두었더니 세 화면쯤 스크롤해야 나왔다 —
 * 문서에 있는 것과 눈에 띄는 것은 다르다 (COPYRIGHT.md §11)
 */
export const disclaimer = style({
  margin: 0,
  fontSize: 11.5,
  lineHeight: 1.7,
  // 흐리게 두지 않는다 — 이건 **보여야 하는** 고지다 (COPYRIGHT.md §11)
  opacity: 0.85,
})

/**
 * 글이 얹히는 판.
 *
 * ⚠️ **판이 없으면 못 읽는다.** 한동안 배경 그림 위에 글을 그대로 올렸는데,
 * 상자를 두른 것(준비물·배너)만 읽히고 상자 없는 긴 문단과 맨 위 고지가
 * 워드마크의 밝은 금속 부분과 겹쳐 사라졌다 — 실제 배포에서 눈으로 확인했다.
 * 그림을 더 어둡게 덮는 길도 있지만 그러면 그림이 없는 것과 같아진다.
 * **글에는 판을 주고 그림은 판 바깥에서 보이게** 한다
 */
export const sheet = style({
  position: 'relative',
  maxWidth: 760,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: 'clamp(18px, 3vh, 30px) clamp(16px, 3vw, 30px)',
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.10)',
  background: 'rgba(6, 10, 18, 0.90)',
  backdropFilter: 'blur(10px)',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
})

export const title = style({
  margin: 0,
  fontSize: 24,
  letterSpacing: '0.02em',
})

/** 지금 판이 어디까지인지. **첫 화면에서 감추지 않는다** */
export const banner = style({
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  border: '1px solid rgba(255, 196, 90, 0.4)',
  background: 'rgba(120, 84, 18, 0.28)',
})

export const step = style({
  padding: '14px 16px',
  borderRadius: 12,
  border: `1px solid ${vars.panel.border}`,
  background: 'rgba(12, 17, 30, 0.7)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
})

export const stepHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 15,
  fontWeight: 700,
})

export const stepNote = style({
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 400,
})

export const body = style({
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})

export const ok = style({ color: '#8fe0a4' })
export const bad = style({ color: '#ff9a9a' })

export const row = style({ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' })

export const button = style({
  appearance: 'none',
  padding: '8px 14px',
  fontFamily: vars.font.ui,
  fontSize: 13,
  color: vars.panel.text,
  background: 'rgba(30, 40, 66, 0.9)',
  border: `1px solid ${vars.panel.border}`,
  borderRadius: 999,
  cursor: 'pointer',
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'default' },
    '&:hover:not(:disabled)': { background: 'rgba(46, 60, 96, 0.95)' },
  },
})

export const groups = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: '4px 12px',
  fontSize: 12.5,
  alignItems: 'baseline',
})

export const bar = style({
  height: 6,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.12)',
  overflow: 'hidden',
})

export const barFill = style({
  height: '100%',
  background: 'linear-gradient(90deg, #6ea8ff, #8fe0a4)',
  transition: 'width 120ms linear',
})

export const list = style({
  margin: 0,
  paddingLeft: 18,
  fontSize: 12.5,
  lineHeight: 1.8,
  opacity: 0.86,
})
