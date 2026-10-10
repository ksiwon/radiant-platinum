// 배틀 명령 구역의 스타일 — 명령 칸 · 기술 칸 · 잊기 칸 (`battleScreen.css`에서 꺼냈다. SYSTEM 4.15 · 4.16).
//
// 구역은 **380×264로 고정**이다(`--battle-cmd-h`). 단마다 안이 다르지만 모두 이 안에 든다:
//
//   뿌리      싸운다 380×96 + 틈 8 + 가로 한 줄 셋 각 121×48 (남는 112는 비운다 — 무대가 보인다)
//   기술 단   판 56 × 4 + 틈 6 × 3 = 242, 그 아래 「돌아간다」 글자 띠 22
//   잊기 단   판 48 × 5 + 틈 6 × 4 = 264. 고른 칸의 상세는 글창이 맡는다
//   두 칸 물음 판 56 × 2
//
// 판은 한 벌이고 얼굴이 둘이다(`CommandButton`) — 명령 판(왼쪽 칸 색 쐐기)과 타입 판(타입 색 원판 · 몸통 ·
// 흰 꼬리). 둘 다 9° 기울고 `bar.edge` 3px 테두리다(BDSP 타입 판 실측과 같은 값). 글자는 기울기를 되돌려 선다.
//
// HUD(체력판 · 글창 · 막)는 `battleScreen.css`다. 클래스 이름 중 `button`은 하네스가 안 읽는다.
import { globalStyle, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, HUD, RADIUS, SKEW_DEG, TEXT, TIME } from '../theme/scale'
import { TYPE_PLATE } from '../theme/window.css'
import { CMD_BOTTOM, CMD_WIDTH } from './battleScreen.css'

/** 아이템 아이콘 32×32. 아틀라스를 배경 위치로 잘라 쓴다 */
export const itemIcon = style({
  width: 28,
  height: 28,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'auto',
})

/**
 * 명령 구역 — 380×264 고정. 오른쪽 아래에 선다(키 안내 창 위 8px). 위에서부터 채운다: 단이 바뀌어도 첫 판이
 * 같은 자리에 서고, 남는 아래는 3D 무대가 보이는 자리다
 */
export const side = style({
  position: 'absolute',
  right: HUD.edge,
  bottom: CMD_BOTTOM,
  width: CMD_WIDTH,
  height: 'var(--battle-cmd-h)',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: GAP.small,
  pointerEvents: 'auto',
})

/** 판들이 서는 곳 */
export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
})

/** 뿌리의 가로 한 줄 셋 */
export const trio = style({ display: 'flex', gap: GAP.small, minWidth: 0 })

/** 판 높이 — 단마다 다르다 */
const PLATE = { hero: 96, row: 48, list: 56, slim: 48 } as const
export const plateSize = styleVariants({
  hero: { height: PLATE.hero },
  row: { height: PLATE.row, flex: '1 1 0', minWidth: 0 },
  list: { height: PLATE.list },
  slim: { height: PLATE.slim },
})

/**
 * 기울기.
 *
 * 이 하나가 화면 전체의 인상을 정한다. 반듯한 사각형이면 어느 게임이든 될 수 있는 모양이 되는데, 각이 지면
 * **움직이는 화면 위에 얹힌 판**으로 읽힌다. 값은 `SKEW_DEG` 하나다
 */
const SKEW = String(SKEW_DEG)

/** 두 얼굴이 같이 쓰는 판의 뼈대 */
const plateBase = {
  position: 'relative',
  boxSizing: 'border-box',
  appearance: 'none',
  display: 'block',
  width: '100%',
  padding: 0,
  overflow: 'hidden',
  font: 'inherit',
  fontSize: TEXT.base,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  flex: '0 0 auto',
  border: `${EDGE.window}px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.cell,
  transform: `skewX(-${SKEW}deg)`,
  transition: `transform ${TIME.slide} ease-out`,
} as const

/** 명령 판 — 몸통은 창 얼굴이다. 왼쪽 쐐기가 칸 색(`--tint`)을 나른다 */
export const buttonCmd = style({
  ...plateBase,
  background: `linear-gradient(180deg, ${vars.window.faceTop} 0%, ${vars.window.faceMid} 40%,`
    + ` ${vars.window.faceBottom} 100%)`,
  backgroundColor: vars.window.faceMid,
  color: vars.ink.strong,
})

/** 타입 판 (`TYPE_PLATE`) — 몸통 `--type` 50% · 아래 한 줄 · 꼬리는 흰색. `--type`은 쓰는 쪽이 타입 색으로 준다 */
export const buttonType = style({
  ...TYPE_PLATE,
  appearance: 'none',
  display: 'block',
  width: '100%',
  padding: 0,
  overflow: 'hidden',
  font: 'inherit',
  fontSize: TEXT.base,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  flex: '0 0 auto',
  // 타입을 못 읽은 칸의 기본 색 — 몸통 `color-mix`가 값 없이 무효가 되지 않게 한다
  vars: { '--type': vars.window.edge },
  transition: `transform ${TIME.slide} ease-out`,
})

/**
 * 지금 고른 판.
 *
 * **테두리가 금이고 안쪽에 금선 2px**다 (`pickEdgeOnly` — 몸통은 안 칠한다. 타입 색이 사라지면 안 된다).
 * 왼쪽으로 12px 나온다 — 목록에서 뽑혀 나온 것으로 읽힌다. 마우스 hover와 키보드 커서는 **같은 표시**다
 */
export const buttonOn = style({
  borderColor: vars.pick.edge,
  boxShadow: `inset 0 0 0 ${EDGE.bar}px ${vars.pick.edge}`,
  transform: `skewX(-${SKEW}deg) translateX(-12px)`,
})

/**
 * 꺼진 판 — **투명도를 안 쓴다.** 몸통을 `window.faceBottom` 한 색으로 눌러 결을 빼고 글자를 `ink.faint`로 둔다.
 * 판은 불투명하게 남는다(무대가 안 비친다). 눌림 · hover 이동도 없다
 */
export const buttonOff = style({
  background: vars.window.faceBottom,
  color: vars.ink.faint,
  cursor: 'default',
})

const hoverMove = {
  selectors: {
    '&:hover:enabled, &:focus-visible:enabled': {
      transform: `skewX(-${SKEW}deg) translateX(-6px)`,
      outline: 'none',
    },
    '&:active:enabled': {
      transform: `skewX(-${SKEW}deg) translateX(-6px) scale(0.98)`,
    },
  },
} as const
export const hover = style(hoverMove)

/** 빈 기술 칸 — 자리를 지켜 판이 오르내리지 않게 한다. `button`이 아니라 `div`다 (PP 꼴이 없다) */
export const plateEmpty = style({
  ...plateBase,
  cursor: 'default',
  background: vars.window.faceBottom,
  borderColor: vars.window.edge,
})

/**
 * 왼쪽 색 조각 — 판과 같이 기울어서 **기울기를 따라 잘린** 쐐기다. 명령 판은 칸 색 18px, 타입 판은 타입 색
 * 원판(그림 칸) 72px이다. 아무 글자도 없다(`aria-hidden`)
 */
export const wedge = style({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 18,
  background: `var(--tint, ${vars.window.edge})`,
  borderRight: `${EDGE.rule}px solid ${vars.bar.edge}`,
})
export const wedgeDisc = style({ width: 72, background: 'var(--type)' })
globalStyle(`${buttonOff} ${wedge}`, { background: vars.ink.faint })

/** 타입 판의 오른쪽 꼬리 — 숫자(PP) 자리. 흰색이다(`bar.trackBottom`) */
export const tailBg = style({
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: 84,
  background: vars.bar.trackBottom,
  borderLeft: `${EDGE.rule}px solid ${vars.bar.edge}`,
})

/** 판 안의 글 — 기울기를 되돌려 **반듯하게** 세운다. 얼굴 둘이 같은 칸 규칙을 쓴다 */
export const face = style({
  position: 'relative',
  height: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  transform: `skewX(${SKEW}deg)`,
  // 쐐기 18px 자리를 비운다
  paddingLeft: 26,
  paddingRight: 14,
})
/** 타입 판은 왼쪽 원판(72) · 오른쪽 꼬리(84) 자리를 비운다 */
export const faceType = style({ paddingLeft: 0, paddingRight: 0, gap: 0 })

/** 영웅 판 — 아이콘 64를 세우니 왼쪽 쐐기 뒤로 여유를 더 준다 */
export const faceHero = style({ gap: GAP.base })

/** 원판 안의 그림 칸(타입 그림) — 72px 가운데 */
export const lead = style({
  order: -1,
  flex: '0 0 72px',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

/** 명령 판의 포켓몬 아이콘 칸 (`aria-hidden` · 글자 0) */
export const leadIcon = style({
  order: -1,
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
})

/** 이름 + 그 아래 작은 줄 */
export const labelCol = style({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
})

export const label = style({
  fontSize: TEXT.list + 1,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
/** 타입 판의 이름 칸은 원판과 꼬리 사이에 선다 */
globalStyle(`${faceType} ${labelCol}`, { padding: '0 10px', boxSizing: 'border-box' })

/** 영웅 판의 이름 — 위계가 제일 높다 */
export const labelHero = style({ fontSize: TEXT.title + 4, fontWeight: 800 })
/** 작은 명령 판의 이름 */
export const labelRow = style({ fontSize: TEXT.base })

/**
 * 이름을 거드는 줄 — 꺼진 칸의 까닭 · 상성 · 남은 볼.
 *
 * ⚠️ **`opacity`가 아니라 글자색이다.** 투명도는 자식까지 곱해져서, 이 줄 안에 들어오는 상성 표시(`matchLine`)의
 * 색을 되돌릴 방법이 없어진다
 */
export const subLine = style({
  fontSize: TEXT.tiny,
  fontWeight: 500,
  lineHeight: 1.2,
  color: vars.ink.dim,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
globalStyle(`${buttonOff} ${subLine}`, { color: vars.ink.faint })

/** 타입과 상성 사이의 가운뎃점 */
export const sep = style({ margin: '0 5px', color: vars.ink.faint })

/**
 * 「효과가 굉장함」 (PARITY §2.22).
 *
 * 상자를 따로 두지 않는다 — 이름 아래 한 줄에 색으로만 가른다. 네 칸마다 알약이 하나씩 더 붙으면 기술
 * 목록이 표가 된다
 */
export const matchLine = style({ fontWeight: 700 })

export const matchTone = styleVariants({
  super: { color: vars.match.superEff },
  resisted: { color: vars.match.resisted },
  immune: { color: vars.match.immune },
})

/** 오른쪽 꼬리 — 흰 칸 가운데에 「PP」와 `남은/최대`가 선다. 숫자는 Pretendard tabular다(mono 금지) */
export const tail = style({
  flex: '0 0 84px',
  height: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
  fontVariantNumeric: 'tabular-nums',
  color: vars.pp.normal,
})
export const ppLabel = style({ fontSize: 11, fontWeight: 700, lineHeight: 1.1, color: vars.ink.dim })
export const pp = style({ display: 'flex', alignItems: 'baseline', gap: 1, lineHeight: 1.1 })
export const ppNow = style({ fontSize: 22, fontWeight: 800 })
export const ppMax = style({ fontSize: TEXT.small, fontWeight: 700 })
/** 꼬리의 글(「그만둔다」) */
export const tailText = style({ fontSize: TEXT.small, fontWeight: 700, lineHeight: 1.2, textAlign: 'center' })

/**
 * PP 글자색 네 단 (`ppTone` → `pp.*` 토큰, 원작 `GetPPTextColor`). 한 줄로 쓰도록 클래스로 내보낸다 —
 * 값은 `pp.*`에서 온다
 */
export const ppTone = styleVariants({
  normal: { color: vars.pp.normal },
  half: { color: vars.pp.half },
  quarter: { color: vars.pp.quarter },
  out: { color: vars.pp.out },
})
/** 지금 쓰는 이름 — 옛 두 단(`ppLow` · `ppOut`)은 네 단으로 갈렸다 */
export const ppLow = ppTone.quarter
export const ppOut = ppTone.out

/**
 * 명령 넷의 색.
 *
 * 원작 배틀 메뉴는 칸마다 색이 다르다 — 싸운다는 붉고, 가방은 노랗고, 포켓몬은 푸르고, 도망친다는 하늘색이다.
 * 글자를 안 읽어도 손이 먼저 간다
 */
export const TINT = {
  fight: vars.cmd.fight,
  bag: vars.cmd.bag,
  party: vars.cmd.party,
  run: vars.cmd.run,
} as const

/**
 * 커서 화살표.
 *
 * 판 **바깥** 왼쪽에 선다. 안에 두면 글자를 밀어내서 고를 때마다 이름이 흔들린다. `overflow: hidden`인 판
 * 안이 아니라 판 밖에 선다(`CommandButton`이 래퍼를 둔다)
 */
export const caret = style({
  position: 'absolute',
  // 판이 왼쪽으로 12px 나오므로 그만큼 더 바깥이다
  left: -33,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: `11px solid ${vars.pick.edge}`,
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
})

/** 판 한 장의 래퍼 — 커서가 판 밖에 서려면 `overflow`가 안 걸린 겹이 필요하다. 크기(`plateSize`)는 판이 아니라 이 겹이 정한다 */
export const slot = style({ position: 'relative', flex: '0 0 auto', minWidth: 0 })
globalStyle(`${slot} > ${buttonCmd}, ${slot} > ${buttonType}, ${slot} > ${plateEmpty}`, { height: '100%' })

/**
 * 한 단 들어간 메뉴의 「돌아간다」 — 판이 아니라 **글자 띠**다(원작도 기술 단 바닥 띠다). 오른쪽 끝에 선다.
 * 뒤가 무대라 바닥 그늘(`scrim.over`) 위에서 읽히는 밝은 글자다
 */
export const backStrip = style({
  alignSelf: 'flex-end',
  appearance: 'none',
  height: 22,
  marginTop: -6,
  padding: '0 6px',
  border: 'none',
  background: 'none',
  color: vars.ink.onDark,
  font: 'inherit',
  fontSize: TEXT.small,
  fontWeight: 700,
  lineHeight: '22px',
  cursor: 'pointer',
  flex: '0 0 auto',
  selectors: {
    '&:hover': { color: vars.pick.edge },
  },
})
globalStyle(`${buttonCmd} > *, ${buttonType} > *`, { pointerEvents: 'none' })

/**
 * 기술 배우기 껍데기의 뿌리 (`data-learn-stage` · `data-learn-new`를 단다).
 *
 * `display: contents`라 자식 칸이 명령 목록(`menu`)의 줄로 그대로 선다 — 뿌리가 생겨도 배치가 안 바뀐다
 */
export const learnRoot = style({ display: 'contents' })

/** 「그럼...」을 기다리는 단 — 구역 전체가 누름 자리다 */
export const clickPad = style({
  position: 'absolute',
  inset: 0,
  cursor: 'pointer',
})
