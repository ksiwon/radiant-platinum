// 포켓몬 화면.
//
// 카드 여섯 장이다. 글줄 여섯 개로는 무엇을 데리고 다니는지가 안 읽힌다 —
// 원작 파티 화면이 카드인 이유가 그거다.
//
// ⚠️ 카드에서 제일 커야 할 것은 **그림**이다. 전에는 62픽셀짜리 그림 옆에
// 테두리·그림자·비스듬한 모서리가 붙어서, 정작 포켓몬은 작고 장식만 컸다.
// 카드 높이를 줄이고 그림을 그 높이에 꽉 채운다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'

/** 카드 여섯 장. 두 줄로 세우고 선두만 위로 뺀다 */
export const grid = style({
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  alignContent: 'start',
  paddingRight: 6,
  scrollbarWidth: 'thin',
})

/**
 * 카드 하나.
 *
 * 안 고른 카드는 아주 옅은 판 하나뿐이다. 목록의 줄과 같은 규칙이다 —
 * 눈에 띄어야 하는 것은 고른 하나지 여섯 개의 테두리가 아니다
 */
export const card = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 64,
  padding: '0 10px 0 6px',
  borderRadius: 7,
  background: 'rgba(255, 255, 255, 0.045)',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
})

/** 선두는 한 줄을 통째로 쓴다. 원작도 첫 칸만 따로 띄운다 */
export const cardLead = style([card, {
  gridColumn: '1 / -1',
  height: 84,
}])

export const cardOn = style({
  background: 'rgba(238, 243, 255, 0.14)',
  boxShadow: `inset 0 0 0 2px ${vars.hud.warn}`,
})

/** 쓰러진 카드는 눈에 띄게 죽인다 — 회복해야 할 것이 한눈에 보여야 한다 */
export const cardFainted = style({
  filter: 'grayscale(0.8)',
  opacity: 0.55,
})

/**
 * 그림 자리.
 *
 * 원작 배틀 그림(80×80)을 그대로 쓴다 — 파티용 아이콘을 따로 안 뽑았고,
 * 지어내는 것보다 있는 그림이 낫다. 못 받으면 빈 칸으로 남는다
 */
export const portrait = style({
  width: 58,
  height: 58,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  objectFit: 'contain',
  filter: 'drop-shadow(0 3px 4px rgba(0, 0, 0, 0.5))',
})

export const portraitLead = style([portrait, { width: 78, height: 78 }])

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
})

export const nameRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  minWidth: 0,
})

export const name = style({
  fontSize: 15,
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const male = style({ color: '#6db3f2', fontWeight: 700 })
export const female = style({ color: '#f28ab2', fontWeight: 700 })

export const level = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: 13,
  fontFamily: vars.font.mono,
  opacity: 0.8,
})

/** 상태 이상. 색이 무엇에 걸렸는지를 나른다 */
export const status = style({
  flex: '0 0 auto',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
})

/** 배틀 화면과 같은 색표다 — 두 화면에서 같은 상태가 같은 색이어야 한다 */
export const statusColor: Record<string, string> = {
  psn: '#a25bc4', tox: '#8b3fae', brn: '#e8763a',
  par: '#d8b12a', slp: '#7b8794', frz: '#4aa8d8', ko: '#6b7280',
}

export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})

/** 원작 체력판의 노란 `HP` 글자 */
export const hpTag = style({
  flex: '0 0 auto',
  fontSize: 10,
  fontWeight: 800,
  fontStyle: 'italic',
  color: '#f5cf5a',
})

export const hpTrack = style({
  position: 'relative',
  flex: 1,
  height: 7,
  borderRadius: 4,
  background: 'rgba(0, 0, 0, 0.55)',
  overflow: 'hidden',
})

export const hpFill = style({
  height: '100%',
  transition: 'width 220ms linear, background-color 200ms linear',
})

export const hpText = style({
  flex: '0 0 auto',
  minWidth: 58,
  textAlign: 'right',
  fontSize: 12,
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
})

/**
 * 능력 여섯.
 *
 * ⚠️ **막대를 걷어냈다.** 400을 꽉 찬 길이로 잡아 놨는데 5레벨 포켓몬의
 * 능력은 10~20이라, 여섯 줄이 전부 빈 막대로 떴다. 원작 요약 화면도 막대가
 * 아니라 숫자만 적고, 성격이 올리는 쪽을 빨강 내리는 쪽을 파랑으로 물들인다
 */
export const stats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: 20,
  rowGap: 2,
})

export const statRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 14,
  padding: '2px 0',
  borderBottom: '1px solid rgba(150, 176, 224, 0.12)',
})

/** 성격 보정. 원작과 같은 색이다 — 올리는 쪽 빨강, 내리는 쪽 파랑 */
export const statName = style({
  opacity: 0.72,
  selectors: {
    '&[data-nature="up"]': { color: '#ff8a7a', opacity: 1 },
    '&[data-nature="down"]': { color: '#8ab8ff', opacity: 1 },
  },
})

export const statValue = style({
  marginLeft: 'auto',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
})

export const moveRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '5px 10px',
  marginBottom: 3,
  borderRadius: 5,
  background: 'rgba(255, 255, 255, 0.045)',
  fontSize: 14,
})

export const movePp = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  opacity: 0.75,
})
