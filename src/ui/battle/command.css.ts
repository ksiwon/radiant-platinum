// 배틀 명령 구역의 스타일 — 명령 칸·기술 칸·물음 줄 (`battleScreen.css`에서 꺼냈다. SYSTEM 4.15).
//
// HUD(체력판·글창·막)는 `battleScreen.css`에 남는다. 여기는 `CommandArea` · `CommandButton` ·
// `LearnMove`가 쓰는 것뿐이다. 클래스 이름은 옮기기 전과 같다.
import { globalStyle, style, styleVariants } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { GAP, RADIUS, TEXT } from '../theme/scale'
import { PICKED, WINDOW } from '../theme/window.css'

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
 * 명령 칸.
 *
 * 2×2 격자를 버리고 **세로로 쌓는다.** 격자는 네 칸이 서로 같은 무게라 어디부터
 * 읽어야 할지가 안 정해지는데, 목록은 위에서 아래로 한 방향이라 커서가 어디 있는지
 * 눈이 바로 찾는다.
 *
 * 왼쪽에 26px를 비워 두는 것은 커서 화살표 자리다 — 칸 **밖에** 서야 지금 고른
 * 것이 튀어나온 것으로 읽힌다. `overflow-y: auto`가 x축까지 잘라 버려서
 * 칸을 넘겨 그릴 수가 없다(가방 목록은 길어서 넘침 처리가 필요하다)
 */
export const side = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignSelf: 'end',
  minWidth: 0,
})

export const menu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingLeft: 26,
  // 기운 판이 오른쪽으로 4px쯤 삐져나온다. 넘침 처리가 그걸 자르지 않게 비워 둔다
  paddingRight: 8,
  maxHeight: '46vh',
  overflowY: 'auto',
  scrollbarWidth: 'thin',
})

/**
 * 기울기.
 *
 * 이 하나가 화면 전체의 인상을 정한다. 반듯한 사각형이면 어느 게임이든 될 수 있는
 * 모양이 되는데, 각이 지면 **움직이는 화면 위에 얹힌 판**으로 읽힌다
 */
const SKEW = 9

export const button = style({
  ...WINDOW,
  position: 'relative',
  appearance: 'none',
  display: 'block',
  width: '100%',
  minHeight: 50,
  padding: `${GAP.small}px ${GAP.wide + 4}px ${GAP.small}px ${GAP.base + 2}px`,
  font: 'inherit',
  fontSize: TEXT.base,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  flex: '0 0 auto',
  transform: `skewX(-${String(SKEW)}deg)`,
  transition: 'transform 120ms ease-out, background 140ms linear,'
    + ' border-color 140ms linear',
  selectors: {
    '&:hover:enabled, &:focus-visible:enabled': {
      transform: `skewX(-${String(SKEW)}deg) translateX(-6px)`,
      outline: 'none',
    },
    '&:active:enabled': {
      transform: `skewX(-${String(SKEW)}deg) translateX(-6px) scale(0.985)`,
    },
    '&:disabled': { opacity: 0.32, cursor: 'default' },
  },
})

/** 판이 기울었으니 되돌린다 — **글자는 반듯하게** 선다 */
export const face = style({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  transform: `skewX(${String(SKEW)}deg)`,
})

/**
 * 왼쪽 색 조각.
 *
 * 아이콘을 그리지 않는다 — 없는 그림을 지어내는 것보다 색 하나가 정직하고,
 * 색만으로도 손이 먼저 간다. 기술 칸에서는 이 색이 곧 타입 색이다
 */
export const dot = style({
  width: 22,
  height: 22,
  borderRadius: RADIUS.bar,
  flex: '0 0 auto',
  background: `var(--tint, ${vars.window.edge})`,
  border: `1px solid ${vars.bar.edge}`,
})

/** 이름 + 그 아래 작은 줄 */
export const labelCol = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
})

export const label = style({
  fontSize: TEXT.base,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

/**
 * 기술 타입·교체 레벨처럼 이름을 거드는 줄.
 *
 * ⚠️ **`opacity`가 아니라 글자색이다.** 투명도는 자식까지 곱해져서, 이 줄 안에
 * 들어오는 상성 표시(`matchLine`)의 색을 되돌릴 방법이 없어진다
 */
export const subLine = style({
  fontSize: TEXT.tiny,
  fontWeight: 500,
  color: vars.ink.dim,
})

/** 타입과 상성 사이의 가운뎃점 */
export const sep = style({ margin: '0 5px', color: vars.ink.faint })

/**
 * 「효과가 굉장함」 (PARITY §2.22).
 *
 * 상자를 따로 두지 않는다 — 타입 이름과 같은 줄에 이어 붙이고 색으로만 가른다.
 * 네 칸마다 알약이 하나씩 더 붙으면 기술 목록이 표가 된다
 */
export const matchLine = style({ fontWeight: 700 })

export const matchTone = styleVariants({
  super: { color: vars.match.superEff },
  resisted: { color: vars.match.resisted },
  immune: { color: vars.match.immune },
})

/** 오른쪽 끝의 PP. 큰 숫자 옆에 작은 분모 — 남은 값에 눈이 먼저 간다 */
export const pp = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'baseline',
  gap: 1,
  fontFamily: vars.font.mono,
  fontStyle: 'italic',
  flex: '0 0 auto',
})

export const ppNow = style({ fontSize: 19, fontWeight: 800, lineHeight: 1 })
export const ppMax = style({ fontSize: 12, opacity: 0.7 })

/**
 * 명령 넷의 색.
 *
 * 원작 배틀 메뉴는 칸마다 색이 다르다 — 싸운다는 붉고, 가방은 노랗고, 포켓몬은
 * 푸르고, 도망친다는 하늘색이다. 글자를 안 읽어도 손이 먼저 간다
 */
export const TINT = {
  fight: vars.cmd.fight,
  bag: vars.cmd.bag,
  party: vars.cmd.party,
  run: vars.cmd.run,
} as const

/**
 * 지금 고른 칸.
 *
 * **금 테두리다.** 게임 안에서 「고른 것」은 어디서나 금 테두리이므로
 * (DESIGN.md §1.2) 여기만 다르게 두면 배틀에서만 규칙이 바뀐다.
 *
 * ⚠️ 한때 **그 칸의 색으로 판을 통째로 채웠다.** 어두운 판이 줄지어 있던 시절의
 * 답이었는데, 창이 밝아진 뒤로는 빨간 판 위의 빨간 글씨가 됐다 — 이름줄도
 * 설명줄도 안 읽혔다. 왼쪽 색 조각이 이미 어느 칸인지를 나르므로 판까지
 * 칠할 이유가 없다.
 *
 * 왼쪽으로 한 걸음 나오는 것까지가 한 벌이다 — 목록에서 뽑혀 나온 것으로 읽힌다.
 * 마우스 hover와 키보드 커서는 **같은 표시**를 쓴다. 둘이 다르면 지금 눌리는
 * 칸이 어느 쪽인지 헷갈린다
 */
export const buttonOn = style({
  transform: `skewX(-${String(SKEW)}deg) translateX(-13px)`,
  ...PICKED,
})

/**
 * 고른 칸의 밑줄도 고른 칸의 글자색을 따른다.
 *
 * ⚠️ **`subLine`은 제 색을 든다** (밝은 창 위의 청회색). 그래서 고른 칸의 `pick.text`가
 * 이 줄까지 안 내려와서, 금빛 바탕 위의 「기술을 고른다」가 바탕에 묻혔다. 상성 표시
 * (`matchTone`)는 이 줄 안에서도 제 색을 따로 든다
 */
globalStyle(`${buttonOn} ${subLine}`, { color: vars.pick.text })

/**
 * 커서 화살표.
 *
 * 칸 **바깥** 왼쪽에 선다. 안에 두면 글자를 밀어내서 고를 때마다 이름이 흔들린다.
 * 판이 기울어 있으니 화살표도 같이 되돌려 세운다
 */
export const caret = style({
  position: 'absolute',
  left: -21,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: `11px solid ${vars.pick.edge}`,
  borderTop: '8px solid transparent',
  borderBottom: '8px solid transparent',
  transform: `translateY(-50%) skewX(${String(SKEW)}deg)`,
})

/** 남은 PP가 적을 때. 바닥나기 전에 눈에 띄어야 한다 */
export const ppLow = style({ color: vars.match.superEff, opacity: 1 })
export const ppOut = style({ color: vars.state.bad, opacity: 1 })

/** 한 단 들어간 메뉴의 "돌아가기". 명령 아래에 글자로만 둔다 */
/**
 * 「누구에게?」·「○○은(는) 무엇을 할까?」 한 줄 (PARITY §2.2).
 *
 * 더블은 자리마다 따로 묻는다. 이 줄이 없으면 같은 메뉴가 두 번 뜨는 것으로만
 * 보여서, 첫째에게 물었는지 둘째에게 물었는지를 화면에서 알 수 없다
 */
export const askWho = style({
  color: vars.ink.onDark,
  font: 'inherit',
  fontSize: TEXT.small,
  padding: '2px 6px 6px',
  flex: '0 0 auto',
})

export const backButton = style({
  alignSelf: 'flex-end',
  appearance: 'none',
  border: 'none',
  background: 'none',
  color: vars.ink.onDarkDim,
  font: 'inherit',
  fontSize: TEXT.small,
  padding: '4px 6px',
  cursor: 'pointer',
  flex: '0 0 auto',
  selectors: {
    '&:hover': { color: vars.ink.onDark },
  },
})

globalStyle(`${button} > *`, { pointerEvents: 'none' })

/**
 * 명령 칸 맨 위의 물음 한 줄 — 「어느 기술을 잊게 할까?」·「배우겠는가?」.
 *
 * ⚠️ **떠 있는 판이 아니다.** 한때 이 자리가 준비 중 알림(`loading`)을 같이 썼다 —
 * 화면 한가운데에 13px로 깜빡이며 떠서 로딩 중처럼 보였고, 화면 전체를 덮어
 * 그 밑의 예·아니오와 기술 칸이 마우스로 안 눌렸다. 다른 명령 글과 같은 잉크로
 * 칸 위에 반듯이 선다 (`askWho`와 같은 자리)
 */
export const waiting = style({
  color: vars.ink.onDark,
  font: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.4,
  whiteSpace: 'pre-line',
  padding: '2px 6px 6px',
  flex: '0 0 auto',
})

/**
 * 기술 배우기 껍데기의 뿌리 (`data-learn-stage` · `data-learn-new`를 단다).
 *
 * `display: contents`라 자식 칸이 명령 목록(`menu`)의 줄로 그대로 선다 — 뿌리가 생겨도 배치가 안 바뀐다
 */
export const learnRoot = style({ display: 'contents' })
