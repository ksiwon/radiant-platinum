// 가방 설명칸.
//
// 고른 물건을 **크게** 세운다. 목록의 28픽셀짜리 아이콘만으로는 무엇을 고르고
// 있는지가 안 보인다 — 이 칸에서 제일 큰 것이 그 물건이어야 한다.
import { style } from '@vanilla-extract/css'

export const hero = style({
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  paddingBottom: 12,
  marginBottom: 12,
  borderBottom: '1px solid rgba(150, 176, 224, 0.2)',
})

/** 그림은 도트다. 부드럽게 늘리면 뭉개진다 */
export const heroIcon = style({
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))',
})

export const heroText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
})

export const heroName = style({
  fontSize: 20,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const heroSub = style({
  fontSize: 13,
  opacity: 0.6,
})
