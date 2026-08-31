// 토큰 **이름**만 있는 골격 (PLAN §2.3 · DESIGN.md §2). 값은 `day.css.ts`가 준다.
//
// ⚠️ **여기 없는 색은 화면에 없다.** 화면 파일이 `#`으로 시작하는 값을 적으면
// `pnpm lint`가 막는다 (`eslint.config.js`). 창이 여덟 벌로 갈라졌던 자리다 —
// 주석으로 「같은 것을 쓴다」고 적는 것은 안 통한다는 것을 이미 확인했다.
import { createThemeContract } from '@vanilla-extract/css'

export const vars = createThemeContract({
  /** 창 하나의 살갗. 실측 출처는 DESIGN.md §1.1 */
  window: {
    /** 테두리 본색 */
    edge: null,
    /** 테두리 위쪽 밝은 쪽 */
    edgeLit: null,
    /** 테두리 안쪽 어두운 쪽 */
    edgeDim: null,
    /** 안쪽 위 → 아래 */
    faceTop: null,
    faceMid: null,
    faceBottom: null,
    /** 창 안을 가르는 선 */
    rule: null,
    /** 창 안에 깔린 가로 결 */
    grain: null,
  },

  /** 고른 것. 원작은 색이 아니라 **금 테두리**로 가리킨다 (DESIGN.md §1.2) */
  pick: {
    edge: null,
    face: null,
    text: null,
  },

  /** 글자. 창이 밝으므로 글자는 어둡다 */
  ink: {
    strong: null,
    normal: null,
    dim: null,
    faint: null,
    /** 어두운 바탕(타이틀·설치 화면 배경) 위의 글자 */
    onDark: null,
    onDarkDim: null,
    /**
     * 색 판 위의 글자 — 타입 조각·머리 띠.
     *
     * ⚠️ 한때 이 자리에 `status.text`가 쓰였다. 상태 이상의 글자색이 타입
     * 조각과 배틀 가방 머리 띠까지 나르고 있었고, 그러면 그 이름이 무엇도
     * 안 가리킨다 (DESIGN.md §1.2의 `hud.warn`과 같은 갈래)
     */
    onTint: null,
  },

  /** 막대 (HP·경험치·게이지). 짙은 테두리 안에 광택이 있는 채움 */
  bar: {
    edge: null,
    trackTop: null,
    trackBottom: null,
    /** 경험치 막대. 원작도 HP와 다른 색이다 */
    expLit: null,
    exp: null,
  },

  /** HP 색. `party_menu/menu.pal` 실측 (DESIGN.md §1.4) */
  hp: {
    greenLit: null, green: null,
    yellowLit: null, yellow: null,
    redLit: null, red: null,
    emptyLit: null, empty: null,
  },

  /**
   * 파티 화면의 칸 (DESIGN.md §1.6).
   *
   * 원작 파티는 목록이 아니라 **판 여섯**이고, 그 판이 상태마다 색이 다르다.
   * 여기 있는 것은 그 판의 색이지 「카드」라는 장식이 아니다
   */
  panel: {
    face: null, edge: null,
    faintedFace: null, faintedEdge: null,
  },

  /** 뜻이 있는 색. **장식으로 쓰지 않는다** */
  state: {
    /** 못 하는 것·모자란 것 */
    bad: null,
    /** 잘된 것 */
    good: null,
    /** 남·여 */
    male: null,
    female: null,
  },

  /**
   * 상태 이상 딱지 (DESIGN.md §1.5).
   *
   * 딱지 하나가 색 셋이다 — 위 한 줄이 밝고, 몸통, 아래 한 줄이 어둡다.
   * 원작 그림이 24×8인데 그중 첫 줄과 끝 줄이 그 두 색이다
   */
  status: {
    pkrsLit: null, pkrs: null, pkrsDim: null,
    parLit: null, par: null, parDim: null,
    frzLit: null, frz: null, frzDim: null,
    slpLit: null, slp: null, slpDim: null,
    psnLit: null, psn: null, psnDim: null,
    brnLit: null, brn: null, brnDim: null,
    fntLit: null, fnt: null, fntDim: null,
    text: null,
  },

  /**
   * 배틀 명령 넷의 색.
   *
   * 원작 배틀 메뉴는 칸마다 색이 다르다 — 싸운다는 붉고, 가방은 노랗고,
   * 포켓몬은 푸르고, 도망친다는 하늘색이다. 글자를 안 읽어도 손이 먼저 간다
   */
  cmd: { fight: null, bag: null, party: null, run: null },

  /** 상성 (PARITY §2.22). 「굉장함」·「별로」·「효과 없음」 */
  match: { superEff: null, resisted: null, immune: null },

  /** 몬스터볼 표시 — 위 빨강 · 가운데 검은 띠 · 아래 흰색 */
  ball: { top: null, band: null, bottom: null },

  /**
   * 간판 판 (`DrawSignpostFrame`).
   *
   * 창이 아니라 **물건**이라 창 언어를 안 따른다 (DESIGN.md §3). 원작도
   * 마을 이름표를 대사창이 아니라 나무 판에 띄운다
   */
  sign: {
    face: null,
    faceDim: null,
    edge: null,
    text: null,
  },

  /**
   * 개발용 계기판 (`?dev=1`에서만 뜬다).
   *
   * ⚠️ **일부러 게임 창이 아니다.** 게임 화면 위에 얹히는 **연장**이라
   * 창 언어를 쓰면 게임 UI로 잘못 읽힌다 (DESIGN.md §3). 배포물에는 안 실린다
   */
  dev: {
    bg: null,
    edge: null,
    text: null,
    /** 개발 화면임을 표시하는 색. **게임 화면에는 안 쓴다** */
    mark: null,
    markFace: null,
    markText: null,
  },

  /**
   * 종이 — 모험노트·상장.
   *
   * 창이 아니라 **물건**이라 창 언어를 안 따른다 (DESIGN.md §3). 원작도 이 둘은
   * 창틀이 아니라 종이 그림 위에 글을 찍는다
   */
  paper: {
    face: null,
    faceDim: null,
    edge: null,
    rule: null,
    text: null,
    textDim: null,
    /** 금박 — 상장 제목, 전당 이름 */
    gilt: null,
  },

  /**
   * 포켓치 — **물건**이다 (DESIGN.md §3). 회색 몸체와 초록 LCD가 그 기계의
   * 것이지 창의 것이 아니다
   */
  device: {
    shell: null, shellDim: null,
    bezel: null, bezelDim: null,
    edge: null,
    text: null, textDim: null,
  },

  /**
   * 트레이너 카드 — 이것도 **물건**이다.
   *
   * ⚠️ 대각 그러데이션과 코팅 광택을 안 쓴다. 원작 카드는 납작한 2색 판에
   * 무늬이지 핀테크 앱의 카드 목업이 아니다 (DESIGN.md §0)
   */
  card: {
    faceTop: null, faceBottom: null,
    edge: null,
    text: null, textDim: null,
    badgeOn: null, badgeOff: null,
  },

  /**
   * `{COLOR n}` — 롬 글 안의 강조색.
   *
   * 원작은 글꼴 팔레트 번호라 그대로 못 쓴다. 실제로 쓰이는 것은 1(빨강)과
   * 2(파랑) 둘뿐이고 도구 이름·사람 이름을 강조할 때 나온다. 밝은 창과
   * 검은 크레딧 화면에서 각각 읽혀야 해서 두 벌이다
   */
  emphasis: {
    one: null, two: null,
    oneOnDark: null, twoOnDark: null,
  },

  /**
   * 타운맵 표식 (`flyScreen`).
   *
   * 원작 지도도 마을과 도시를 다른 색 점으로 찍는다
   */
  map: { town: null, city: null, locked: null },

  /** 화면 뒤를 덮는 것. 창이 밝으므로 옅게만 깐다 */
  scrim: {
    over: null,
    deep: null,
    /** 원작이 실제로 까맣게 덮는 자리 — 화면 전환·컷인·엔딩 */
    black: null,
  },

  font: { ui: null, pixel: null, mono: null },
})
