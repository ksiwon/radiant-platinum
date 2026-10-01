// 트레이너 카드 — 위 화면의 카드와 아래 화면의 배지 케이스를 한 판에 나란히.
//
// ⚠️ **카드와 케이스는 롬 그림이다** (`data/trainerCase/` · `tools/extract/trainerCase.js`). 판은 원작이 그린 것을 그대로
// 깔고, 글만 그 위 원작 창 자리에 올린다 — 자리는 `card_text.c`의 창 표(타일 좌표)를 그림 상자의 백분율로 옮긴 것이다.
// 그래서 크기를 바꿔도 글이 판의 줄무늬에서 안 벗어난다. 글자 크기도 카드 폭을 따라간다(`cqw` — 카드 칸이 그 틀이다).
//
// ⚠️ **두 화면을 위아래로 쌓지 않는다.** 원작은 카드가 위 화면, 케이스가 아래 화면이라 둘이 늘 같이 보인다 — 한 창에서는
// 나란히 두는 것이 그 「같이 보임」이다. 위아래로 쌓으면 창 높이를 넘는다.
import { globalStyle, keyframes, style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TIME } from '../theme/scale'

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'none' },
})

/** 카드와 케이스를 나란히 */
export const stage = style({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: GAP.loose,
  padding: `${GAP.small}px ${GAP.base}px`,
  animation: `${rise} ${TIME.fade} ease-out`,
})

/**
 * 카드 칸 — 폭이 정해지면 높이는 그림의 비가 정한다.
 *
 * ⚠️ **글자 크기를 재는 틀이 여기다.** `cqw`는 자기 자신이 아니라 바깥 틀을 잰다 — 카드에 `containerType`을 걸면 카드
 * 안 글자는 카드가 아니라 그 바깥(없으면 화면)을 잰다. 카드 폭이 곧 이 칸의 폭이다
 */
export const cardSlot = style({
  flex: '0 1 56%',
  minWidth: 0,
  containerType: 'inline-size',
})

/** 케이스 칸 */
export const caseSlot = style({
  flex: '0 1 40%',
  minWidth: 0,
})

/**
 * 카드 한 장. 판 그림은 `style`로 받는다(시트 안 자리 · 비율이 구운 상자에서 온다).
 *
 * ⚠️ **뒤집기는 가로로 접었다 펴는 것이다** (`TrainerCase_FlipTrainerCard`) — 세로축 회전(3D)이 아니다. 원작은 회전 BG의
 * 가로 배율만 1 → 0 → 1로 민다. 접히는 동안은 빨라지고(8프레임) 펴질 때는 느려진다(7프레임)
 */
export const card = style({
  position: 'relative',
  width: '100%',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
  // 글자는 카드 폭의 1/20 — 원작 창 한 줄(16px)에 12px 글자가 선다
  fontSize: '5cqw',
  fontWeight: 700,
  lineHeight: 1,
  transformOrigin: '50% 50%',
})

/**
 * 판 그림을 못 받았을 때(설치본에 이 그룹이 아직 없다) — 글 자리는 그대로 두고 판만 단색이다
 */
export const cardBare = style({
  color: vars.card.text,
  background: `linear-gradient(180deg, ${vars.card.faceTop}, ${vars.card.faceBottom})`,
  border: `${EDGE.window}px solid ${vars.card.edge}`,
  borderRadius: RADIUS.window,
})

/** 원작 창 하나 — 이름표는 왼쪽, 값은 오른쪽 끝에 붙인다 (`TrainerCard_DrawNumber`가 창 폭에서 글 폭을 뺀 자리에 찍는다) */
export const line = style({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  margin: 0,
  whiteSpace: 'nowrap',
})

globalStyle(`${line} dt`, { margin: 0 })
globalStyle(`${line} dd`, {
  margin: 0,
  // 숫자도 UI 글꼴 그대로 — 폭만 고정폭 숫자(`tnum`)로 맞춘다
  fontVariantNumeric: 'tabular-nums',
})

/**
 * 두 줄 창 — 첫 전당등록. 이름표는 윗줄, 값은 날짜 · 시각 두 줄로 오른쪽 끝에 붙는다
 * (`TrainerCard_DrawBackText`가 같은 창의 y 0 · 16에 찍는다)
 */
export const twoRows = style({ alignItems: 'stretch' })

globalStyle(`${twoRows} dt`, { height: '50%', display: 'flex', alignItems: 'center' })
globalStyle(`${twoRows} dd`, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' })
globalStyle(`${twoRows} dd > span`, { flex: '1 1 0', display: 'flex', alignItems: 'center' })

/** 창 안에서 원작 자리에 박는 글 (통신대전의 「승」·「패」와 그 수) */
export const pinned = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  fontVariantNumeric: 'tabular-nums',
})

/** 플레이 시간의 쌍점 — 원작은 15프레임 켜고 15프레임 끈다 (`TrainerCase_UpdatePlayTime`) */
const blink = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0 },
})

export const colon = style({
  animation: `${blink} 0.5s steps(1, end) infinite`,
})

/** 주인공 그림 — 사진 칸 안 */
export const trainer = style({
  position: 'absolute',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
})

/** 배지 케이스 — 아래 화면 한 장 */
export const caseArt = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '256 / 192',
  backgroundSize: '100% 100%',
  imageRendering: 'pixelated',
})

/**
 * 판 그림을 못 받았을 때의 케이스
 */
export const caseBare = style({
  background: vars.card.badgeOff,
  borderRadius: RADIUS.window,
})

/**
 * 배지 하나 — 케이스 판의 홈 위에 앉는다.
 *
 * ⚠️ **안 받은 배지는 안 그린다.** 원작도 그 스프라이트를 끈다(`Sprite_SetDrawFlag(…, FALSE)`) — 빈 자리는 케이스 판에
 * 새겨진 배지 모양 홈이 보여 준다. 여덟 중 몇 개인지가 그 홈으로 읽힌다
 */
export const badge = style({
  position: 'absolute',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
})
