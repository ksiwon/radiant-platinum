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
import { keyframes, style } from '@vanilla-extract/css'
import { vars } from './contract.css'
import { EDGE, GAP, LINE, RADIUS, TEXT, TIME } from './scale'

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
 */
export const row = style({
  position: 'relative',
  display: 'block',
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
