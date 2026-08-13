// PC로 다시 보는 명예의 전당 — `applications/pc_hall_of_fame/display.c`
//
// 여섯 마리가 화면에 **고정된 여섯 자리**에 선다. 격자가 아니라 손으로 놓은
// 배치라(`spriteCoordinates`), 늘어놓지 않고 그 좌표를 그대로 쓴다.
import { style } from '@vanilla-extract/css'

const W = 256
const H = 192

export const stage = style({
  position: 'relative',
  width: `min(100%, calc((100vh - 160px) * ${String(W / H)}))`,
  aspectRatio: `${String(W)} / ${String(H)}`,
  margin: '0 auto',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'rgba(8, 14, 28, 0.16)',
  boxShadow: 'inset 0 0 0 2px rgba(120, 160, 230, 0.35)',
  // ⚠️ **글자 크기를 `min(100%, …)`로 잡으면 안 된다.** font-size의 `100%`는
  // 너비가 아니라 **부모 글자 크기**라, 무대가 아무리 커도 16px의 한 조각이
  // 되어 이름표가 점 하나로 뜬다. 화면 높이에서 바로 낸다 — 원작 글꼴이 192픽셀
  // 화면에서 12픽셀이라 대략 1/16이다
  fontSize: 'clamp(11px, calc((100vh - 160px) / 16), 26px)',
})

/** 한 마리. 지금 고른 것만 또렷하고 나머지는 반투명하다 (`GX_OAM_MODE_XLU`) */
export const mon = style({
  position: 'absolute',
  width: `${String((80 / W) * 100)}%`,
  aspectRatio: '1 / 1',
  objectFit: 'contain',
  imageRendering: 'pixelated',
  transform: 'translate(-50%, -50%)',
  transition: 'opacity 0.15s linear, filter 0.15s linear',
})

export const monOn = style([mon, { opacity: 1 }])
export const monOff = style([mon, { opacity: 0.45, filter: 'saturate(0.6)' }])

/** 위쪽 이름표 — 「제 n회 전당등록 년/월/일」 */
export const title = style({
  position: 'absolute',
  left: '4%',
  top: '3%',
  color: '#f2f7ff',
  fontWeight: 700,
  textShadow: '0 1px 0 #101a30',
  whiteSpace: 'pre',
})

/** 아래쪽 두 줄. 원작도 창 하나에 두 줄을 찍는다 */
export const info = style({
  position: 'absolute',
  left: '4%',
  right: '4%',
  bottom: '4%',
  display: 'grid',
  gap: '0.25em',
  color: '#eef4ff',
  fontWeight: 600,
  textShadow: '0 1px 0 #101a30',
})

export const row = style({
  display: 'flex',
  gap: '0.6em',
  alignItems: 'baseline',
  whiteSpace: 'pre',
})

/** 기술 넷은 두 칸씩 두 줄이다 (`(i & 1) * 96`, `(i / 2) * 16`) */
export const moves = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.25em 1.2em',
  maxWidth: '75%',
})

export const male = style({ color: '#7fb4ff' })
export const female = style({ color: '#ff8fa8' })

export const empty = style({
  display: 'grid',
  placeItems: 'center',
  minHeight: 160,
  color: 'rgba(230, 240, 255, 0.7)',
})
