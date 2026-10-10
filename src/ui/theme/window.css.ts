// **창 한 벌.** 화면이 실제로 쓰는 것은 여기서만 나온다 (DESIGN.md §3).
//
// ⚠️ 한때 창 재질이 여덟 벌이었다 — 필드는 밝은 창, 메뉴는 남색 창, 배틀은
// 반투명 유리, 설치 화면은 또 다른 카드. 각각은 멀쩡했지만 X를 누르는 순간
// 다른 게임으로 넘어갔다. 원작은 그 전부가 창틀 한 벌에서 나온다.
//
// ⚠️ **주석으로 「같은 것을 쓴다」고 적지 않는다.** 그렇게 적어 두고 값을 손으로
// 베낀 자리가 있었고, 그 사이 테두리 한 줄이 알파 넷으로 갈라졌다. 여기 것을
// `import`해서 펼쳐 쓴다.
import type { CSSProperties } from 'react'
import { keyframes, style, styleVariants } from '@vanilla-extract/css'
import { vars } from './contract.css'
import { EDGE, GAP, LINE, NIB, RADIUS, RAIL, SKEW_DEG, TEXT, TIME } from './scale'

/**
 * 창 하나의 살갗. 자리와 여백은 쓰는 쪽이 정한다.
 *
 * ⚠️ **그림자가 없다.** 원본 창은 테두리 바깥이 알파 0이다(DESIGN.md §1.1).
 * 판을 띄우는 것은 그림자가 아니라 테두리다 — `0 22px 56px rgba(0,0,0,.62)`
 * 같은 것을 붙이면 그때부터 웹앱의 카드가 된다.
 *
 * `boxShadow`는 **안쪽 선 하나**다. 원본 테두리가 바깥이 밝고 안쪽이 어두운
 * 두 겹이라 그것을 옮긴 것이지 그림자가 아니다.
 */
export const WINDOW = {
  background: [
    // 창 안에 깔린 가로 결. 아주 옅어야 글자를 안 방해한다
    `repeating-linear-gradient(180deg, transparent 0 3px, ${vars.window.grain} 3px 4px)`,
    `linear-gradient(180deg, ${vars.window.faceTop} 0%,`
      + ` ${vars.window.faceMid} 30%, ${vars.window.faceBottom} 100%)`,
  ].join(', '),
  // ⚠️ **밑색은 반드시 `background` 뒤에 온다.** 단축 속성이 앞에 오면 그것이
  // `background-color`를 초깃값(투명)으로 되돌린다 — 앞에 뒀다가 아무것도 안
  // 바뀐 채로 한 번 지나갔다.
  //
  // 밑색이 필요한 이유: 위 `background`는 그러데이션 두 겹이라
  // `getComputedStyle(el).backgroundColor`가 투명으로 나오고, 그러면 대비를
  // 재는 쪽이 창을 못 보고 **뒤의 어두운 화면**을 바탕으로 잡는다. 멀쩡한 글이
  // 1.1로 찍혔다 (`tools/shot/title.mjs` — 고지가 보이는지를 그 수로 재는데
  // 그 수가 거짓이 됐다). 그러데이션이 안 그려지는 자리에서도 창이 창으로
  // 서게 하는 값이기도 하다
  backgroundColor: vars.window.faceMid,
  border: `${EDGE.window}px solid ${vars.window.edge}`,
  borderRadius: RADIUS.window,
  boxShadow: `inset 0 0 0 1px ${vars.window.edgeDim}`,
  color: vars.ink.normal,
} as const

/** 작은 창 — 소지금·예/아니오처럼 글 한두 줄짜리. 모서리만 줄인다 */
export const WINDOW_SMALL = {
  ...WINDOW,
  borderRadius: RADIUS.cell,
} as const

/**
 * 고른 것. **금 테두리로 가리킨다** (DESIGN.md §1.2).
 *
 * ⚠️ 고른 것을 경고색으로 가리키지 않는다. 한때 `hud.warn`이 고른 줄의 선이자
 * 화면 제목의 장식이자 도감의 점이었다 — 한 색이 셋을 나르면 아무 뜻도 안 나른다.
 */
export const PICKED = {
  background: vars.pick.face,
  borderColor: vars.pick.edge,
  boxShadow: `inset 0 0 0 ${EDGE.bar}px ${vars.pick.edge}`,
  color: vars.pick.text,
} as const

/** 창 안을 가르는 선. 판을 하나 더 깔지 않는다 */
export const RULE = `${EDGE.rule}px solid ${vars.window.rule}`

// ─────────────────────────────────────────────────────────────────
// 목록
// ─────────────────────────────────────────────────────────────────

/**
 * 고를 수 있는 한 줄.
 *
 * 테두리도 배경도 그림자도 없다 — 목록은 글자가 늘어선 것이지 판이 쌓인 게
 * 아니다. 왼쪽 22px은 커서 자리라 고를 때 글자가 안 밀린다.
 * `div`에도 쓰이므로 `button` 전용 속성은 안 넣는다.
 *
 * ⚠️ **`boxSizing`을 빼면 띠가 창 테두리 밖으로 나간다.** 전역 리셋이 없어
 * 기본값 content-box라 `width: 100%`에 가로 padding이 **더해진다.** 시작 메뉴의
 * 고른 줄 띠가 그렇게 창 오른쪽 테두리를 6~7px 넘어 있었다
 */
export const row = style({
  position: 'relative',
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  height: LINE.row,
  flex: '0 0 auto',
  padding: `0 ${GAP.small}px 0 22px`,
  border: 'none',
  borderRadius: RADIUS.cell,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: TEXT.list,
  textAlign: 'left',
})

/** 고른 줄 — 금색 띠에 어두운 글자 */
export const rowOn = style([row, {
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 2px ${vars.pick.edge}`,
  color: vars.pick.text,
  fontWeight: 700,
}])

/** 못 쓰는 항목·아직 안 본 포켓몬 */
export const rowDim = style([row, { opacity: 0.42 }])

/** 커서. 띠 **안**에 있어서 색을 글자에서 물려받는다 */
export const caret = style({
  position: 'absolute',
  left: GAP.small,
  top: '50%',
  width: 0,
  height: 0,
  borderLeft: '7px solid currentColor',
  borderTop: '5px solid transparent',
  borderBottom: '5px solid transparent',
  transform: 'translateY(-50%)',
})

// ─────────────────────────────────────────────────────────────────
// 막대
// ─────────────────────────────────────────────────────────────────

/**
 * 막대의 홈 (DESIGN.md §1.3). 높이는 쓰는 쪽이 정한다.
 *
 * 원본은 **짙은 테두리 안에 흰 바탕**이다. 이 한 벌이 없던 동안 홈이 화면마다
 * 달랐다 — 어디는 `rgba(0,0,0,0.55)` 파인 자국, 어디는 `rgba(255,255,255,0.1)`
 * 옅은 띠였고, 같은 HP가 화면마다 다르게 보였다.
 */
export const BAR_TRACK = {
  overflow: 'hidden',
  border: `${EDGE.bar}px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  background: `linear-gradient(180deg, ${vars.bar.trackTop}, ${vars.bar.trackBottom})`,
} as const

/**
 * 채운 쪽. 색 두 개(`--lit`·`--body`)를 쓰는 쪽이 준다 — HP는 `HP_VARS`,
 * 경험치는 `bar.exp`다.
 *
 * 결 넷은 원작 그대로다: 본색 1줄 · 밝은 쪽 2줄 · 본색 1줄
 * (`PartyMenu_DrawMemberHealthbar`의 `Window_FillRectWithColor` 세 번).
 * 폭과 전환 시간은 쓰는 쪽이 얹는다 — 배틀 게이지는 원작처럼 데미지만큼
 * 오래 줄어들고(`playback.drainFrames`) 요약 화면은 그냥 서 있는다.
 */
export const BAR_FILL = {
  height: '100%',
  background: 'linear-gradient(180deg,'
    + ' var(--body) 0 25%, var(--lit) 25% 75%, var(--body) 75% 100%)',
} as const

/**
 * 색 두 벌씩 넷.
 *
 * ⚠️ **경계는 여기서 안 정한다.** 어느 색인지는 `engine/battle/healthbar`의
 * `hpColor()`가 정한다 — 원작이 비율이 아니라 **픽셀 수**로 가르기 때문이다
 * (`App_BarColor`). 여기 있는 것은 그 이름에 붙는 색뿐이다.
 */
export const HP_VARS: Record<string, { '--lit': string, '--body': string }> = {
  green: { '--lit': vars.hp.greenLit, '--body': vars.hp.green },
  yellow: { '--lit': vars.hp.yellowLit, '--body': vars.hp.yellow },
  red: { '--lit': vars.hp.redLit, '--body': vars.hp.red },
  empty: { '--lit': vars.hp.emptyLit, '--body': vars.hp.empty },
}

// ─────────────────────────────────────────────────────────────────
// 상태 이상 딱지
// ─────────────────────────────────────────────────────────────────

/**
 * 상태 이상 딱지 (DESIGN.md §1.5).
 *
 * 원작 그림은 24×8이고 **첫 줄과 끝 줄이 테두리**다 — 따로 두른 선이 아니라
 * 띠 자체의 위아래 한 줄이다. 그래서 여기도 테두리를 안 두르고 그러데이션
 * 세 칸으로 그린다. 색 셋은 쓰는 쪽이 `STATUS_VARS`로 준다.
 *
 * ⚠️ **한때 이 처방이 두 벌이었다** — 배틀과 파티가 각자 `statusColor` 표를
 * 들고 있었고, 「두 화면에서 같은 상태가 같은 색이어야 한다」는 주석이 그
 * 옆에 있었다. 주석은 그것을 지키지 못한다.
 */
export const STATUS_TAG = {
  padding: `1px ${GAP.small - 1}px`,
  borderRadius: RADIUS.bar,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.status.text,
  background: `linear-gradient(180deg, var(--lit) 0 ${EDGE.bar}px,`
    + ` var(--body) ${EDGE.bar}px calc(100% - ${EDGE.bar}px),`
    + ` var(--dim) calc(100% - ${EDGE.bar}px) 100%)`,
} as const

/**
 * 상태마다 색 셋.
 *
 * ⚠️ **`tox`는 원작에 없다.** `PokemonSummaryScreen_StatusIconAnimIdx`가
 * `MON_CONDITION_POISON | MON_CONDITION_TOXIC`을 한 딱지로 묶는다 — 맹독도
 * 독과 같은 그림이다. 색을 따로 만들면 원작에 없는 구분이 생긴다.
 *
 * ⚠️ **`ko`도 원작에 없는 이름이다.** 원작은 HP가 0이면 `FAINTED` 딱지를
 * 붙이므로(`fnt`) 우리 이름표만 다르다
 */
/** 색 셋을 인라인 style로 넘길 꼴로 묶는다. `--`로 시작하는 이름은 캐스트가 필요하다 */
const tint = (lit: string, body: string, dim: string): CSSProperties =>
  ({ '--lit': lit, '--body': body, '--dim': dim }) as CSSProperties

export const STATUS_VARS: Record<string, CSSProperties> = {
  pkrs: tint(vars.status.pkrsLit, vars.status.pkrs, vars.status.pkrsDim),
  par: tint(vars.status.parLit, vars.status.par, vars.status.parDim),
  frz: tint(vars.status.frzLit, vars.status.frz, vars.status.frzDim),
  slp: tint(vars.status.slpLit, vars.status.slp, vars.status.slpDim),
  psn: tint(vars.status.psnLit, vars.status.psn, vars.status.psnDim),
  tox: tint(vars.status.psnLit, vars.status.psn, vars.status.psnDim),
  brn: tint(vars.status.brnLit, vars.status.brn, vars.status.brnDim),
  fnt: tint(vars.status.fntLit, vars.status.fnt, vars.status.fntDim),
  ko: tint(vars.status.fntLit, vars.status.fnt, vars.status.fntDim),
}

// ─────────────────────────────────────────────────────────────────
// 화면을 덮는 것
// ─────────────────────────────────────────────────────────────────

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

/**
 * 창 뒤를 덮는 것.
 *
 * ⚠️ **흐리게 하지 않는다** (`backdrop-filter`). 반투명 유리는 원본에 없고,
 * 창이 밝아진 뒤로는 뒤를 흐릴 이유도 없다 — 밝은 창과 어두운 3D는 그 자체로
 * 갈린다. `blur`는 프레임마다 화면 전체를 다시 칠하는 비용이기도 하다.
 */
export const scrim = style({
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: GAP.wide,
  background: vars.scrim.over,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  userSelect: 'none',
  animation: `${fadeIn} ${TIME.open} ease-out`,
})

/** 뒤를 거의 안 가리는 것 — 고르는 장면처럼 3D가 주인공인 화면 */
export const scrimLight = style([scrim, { background: 'transparent' }])

// ─────────────────────────────────────────────────────────────────
// 메뉴 개편 처방 (SYSTEM §2.1)
//
// ⚠️ 여기 있는 것은 **처방**이다 — 값(색·치수)은 위의 `vars`와 `scale`에서 온다. 화면은 이 조각을
// 펼치거나 클래스를 붙여 쓰고, 같은 모양을 손으로 다시 적지 않는다.
// ─────────────────────────────────────────────────────────────────

/**
 * 고른 것을 가리키는 띠 하나 (§0 L5). 고정 목록(스크롤 없는 10줄 이하)과 교체 띠 · 타이틀 줄이 쓴다.
 *
 * 목록 칸 안의 `aria-hidden` 요소이고, **줄이 아니라 띠 하나**가 `transform`으로 미끄러진다
 * (`TIME.slide`). 어느 줄에 앉을지는 `common/pickBand.ts`의 `bandAt`이 인라인 `transform`으로 준다.
 * 높이(y)나 폭(x)이 줄과 다르면 인라인으로 덮는다. 안에 `caret`을 둔다.
 *
 * `prefers-reduced-motion`이면 미끄러지지 않고 곧바로 앉는다 (§3 공통 규칙)
 */
const bandBase = {
  position: 'absolute',
  boxSizing: 'border-box',
  pointerEvents: 'none',
  borderRadius: RADIUS.cell,
  background: vars.pick.face,
  boxShadow: `inset 0 0 0 ${EDGE.bar}px ${vars.pick.edge}`,
  color: vars.pick.text,
  transition: `transform ${TIME.slide} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
} as const

export const pickBand = styleVariants({
  y: { ...bandBase, left: 0, right: 0, top: 0, height: LINE.row },
  x: { ...bandBase, top: 0, bottom: 0, left: 0 },
})

/**
 * 고른 **물건**의 금 고리 + 옅은 금빛 (배지 · 박스 격자 원 · 필름 테두리 · 지도 커서 · 도감 모습 아이콘).
 *
 * 목록 줄이 아닌 것을 고를 때다. 그림자(`boxShadow`) 대신 `outline`이다 — 고리는 모서리를 따라가고
 * 안쪽을 가리지 않는다. 모서리는 쓰는 쪽이 정한다(물건이 둥글면 `RADIUS.round`)
 */
export const pickHalo = style({
  outline: `${EDGE.bar}px solid ${vars.pick.edge}`,
  outlineOffset: 0,
  background: `color-mix(in srgb, ${vars.pick.edge} 18%, transparent)`,
})

/**
 * 몸통은 그대로 두고 **테두리만** 금으로 (배틀 타입 판 · 요약 바꾸기 출발 줄 · HUD 묻는 판과 겨눈 판).
 *
 * 모양이 있는 판(사다리꼴)은 테두리도 그 모양을 따라 돌아야 하므로 색을 `--rim`으로도 내보낸다 —
 * 두 겹 `clip-path`나 SVG 테두리가 그 변수를 읽는다 (DECISIONS 사용자 지적 ⑤)
 */
export const pickEdgeOnly = style({
  borderColor: vars.pick.edge,
  boxShadow: `inset 0 0 0 ${EDGE.bar}px ${vars.pick.edge}`,
  vars: { '--rim': vars.pick.edge },
})

/**
 * 9° 판 (§2.1). **배틀 명령 구역만** 쓴다 — 메뉴는 기울이지 않는다 (§0).
 *
 * `bar.edge` 3px 테두리, 몸통은 `--type` 50%를 `bar.trackTop`에 섞은 색, 아래 한 줄. `--type`은 쓰는 쪽이
 * 타입 색으로 준다. 글자는 기울기를 되돌려 반듯이 세운다(안쪽 `face`에서 `skewX(+9deg)`)
 */
export const TYPE_PLATE = {
  position: 'relative',
  boxSizing: 'border-box',
  border: `3px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.cell,
  background: `color-mix(in srgb, var(--type) 50%, ${vars.bar.trackTop})`,
  // 아래 줄: 몸통보다 짙은 같은 계열의 선 한 줄
  boxShadow: `inset 0 -${EDGE.bar}px 0 color-mix(in srgb, var(--type) 70%, ${vars.bar.edge})`,
  color: vars.ink.strong,
  transform: `skewX(-${String(SKEW_DEG)}deg)`,
} as const

/**
 * 뜨는 창의 살갗 — `WINDOW_SMALL`에 자리만 더한 것. 꼭지(`NIB`)는 `popover` 클래스가 단다.
 * 갈래 창 · 예/아니오 · 시작 엿보기 · 더보기 · 타이틀 확인 창이 한 벌을 쓴다
 */
export const POPOVER = {
  ...WINDOW_SMALL,
  position: 'absolute',
  boxSizing: 'border-box',
} as const

/** 꼭지는 45° 돌린 정사각형 — 한 변이 `NIB × √2`라 튀어나온 길이가 `NIB`다 */
const NIB_BOX = Math.round(NIB * Math.SQRT2)
const nibBase = {
  content: '""',
  position: 'absolute',
  width: NIB_BOX,
  height: NIB_BOX,
  boxSizing: 'border-box',
  background: vars.window.faceMid,
  borderStyle: 'solid',
  borderColor: vars.window.edge,
  borderWidth: 0,
  transform: 'rotate(45deg)',
} as const

/**
 * 꼭지가 **어느 변**에 서는가 — 원인이 그쪽에 있다는 뜻이다. 변을 따라 어디에 서는지는
 * `--nib-at`(기본 50%)이 정한다. `popoverSide.left`이면 원인이 왼쪽에 있고 꼭지가 왼쪽을 가리킨다
 */
export const popoverSide = styleVariants({
  left: {
    '::before': {
      ...nibBase,
      left: -(EDGE.window + NIB_BOX / 2),
      top: 'var(--nib-at, 50%)',
      marginTop: -NIB_BOX / 2,
      borderLeftWidth: EDGE.window,
      borderBottomWidth: EDGE.window,
    },
  },
  right: {
    '::before': {
      ...nibBase,
      right: -(EDGE.window + NIB_BOX / 2),
      top: 'var(--nib-at, 50%)',
      marginTop: -NIB_BOX / 2,
      borderTopWidth: EDGE.window,
      borderRightWidth: EDGE.window,
    },
  },
  top: {
    '::before': {
      ...nibBase,
      top: -(EDGE.window + NIB_BOX / 2),
      left: 'var(--nib-at, 50%)',
      marginLeft: -NIB_BOX / 2,
      borderTopWidth: EDGE.window,
      borderLeftWidth: EDGE.window,
    },
  },
  bottom: {
    '::before': {
      ...nibBase,
      bottom: -(EDGE.window + NIB_BOX / 2),
      left: 'var(--nib-at, 50%)',
      marginLeft: -NIB_BOX / 2,
      borderBottomWidth: EDGE.window,
      borderRightWidth: EDGE.window,
    },
  },
})

/** 뜨는 창 한 장 (꼭지는 `popoverSide`를 같이 붙인다) */
export const popover = style({ ...POPOVER })

/** 경험치 막대의 색 둘 — HP의 `HP_VARS`에 대응한다 (요약 · 교체 · HUD) */
export const EXP_VARS = { '--lit': vars.bar.expLit, '--body': vars.bar.exp } as const

/**
 * 키캡 (§2.1 `KEYCAP`). 최소 폭 18, 높이 18, `RADIUS.bar`, 1px `edgeDim`, `faceTop`, `TEXT.tiny` 700.
 * 어두운 판 위(3D 무대 · 덮개)는 `KEYCAP_DARK`를 위에 덮는다
 */
export const KEYCAP = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minWidth: 18,
  height: 18,
  padding: '0 5px',
  border: `${EDGE.rule}px solid ${vars.window.edgeDim}`,
  borderRadius: RADIUS.bar,
  background: vars.window.faceTop,
  color: vars.ink.dim,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
} as const

export const KEYCAP_DARK = {
  background: vars.scrim.deep,
  borderColor: vars.ink.onDarkDim,
  color: vars.ink.onDark,
} as const

/**
 * 덮개와 창 얼굴에 **직사각 구멍**을 낸다 (`MonViewport`). `mask-image` 두 겹을 `exclude`로 겹쳐서
 * 전체에서 구멍 사각형을 뺀다. 구멍의 자리는 `--hole-x/y/w/h`(창 기준 px)로 준다.
 *
 * 구멍을 낼 면은 `::before` 층 하나로 옮겨 그리고 그 층에만 건다 — 자식 글자는 가려지지 않는다
 */
export const HOLE_MASK = {
  maskImage: 'linear-gradient(black 0 0), linear-gradient(black 0 0)',
  maskSize: '100% 100%, var(--hole-w, 0px) var(--hole-h, 0px)',
  maskPosition: '0 0, var(--hole-x, 0px) var(--hole-y, 0px)',
  maskRepeat: 'no-repeat',
  maskComposite: 'exclude',
  WebkitMaskComposite: 'xor',
} as const

// 옆 덮개 · 붙는 창 · 닫힘 (§3 움직임)
const dockFrames = keyframes({
  from: { opacity: 0, transform: 'translateX(var(--dock-from, -12px))' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

const fadeOutFrames = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })

/**
 * 옆 덮개 — 붙는 창(시작 메뉴)이 선 쪽만 옅게 덮는다. 화면 전체를 덮지 않으므로 필드가 그대로 보인다.
 * 레일 폭(`RAIL.width`)에 맞춰 그러데이션이 끝난다
 */
export const scrimSide = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'stretch',
  padding: GAP.wide,
  background: `linear-gradient(90deg, ${vars.scrim.over} 0,`
    + ` ${vars.scrim.over} ${String(RAIL.width + GAP.loose)}px, transparent ${String(RAIL.width + 160)}px)`,
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
  userSelect: 'none',
})

/** 붙는 창이 열린다 — 12px 밀려 들어오며 페이드 (`--dock-from`으로 방향을 바꾼다) */
export const dockIn = style({
  animation: `${dockFrames} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: `${fadeIn} ${TIME.open} ease-out` } },
})

/** 닫힘 — 페이드만. `TIME.close` ease-in */
export const fadeOut = style({
  animation: `${fadeOutFrames} ${TIME.close} ease-in forwards`,
})

const riseFrames = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

/** 덮는 창 · 가운데 창이 열린다 — 덮개는 페이드(`scrim`)이고 창은 6px 위로 올라온다 */
export const riseIn = style({
  animation: `${riseFrames} ${TIME.open} ease-out`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: `${fadeIn} ${TIME.open} ease-out` } },
})
