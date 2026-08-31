// 토큰 **값**. 여기 적힌 색은 전부 원본에서 잰 것이고 출처는 DESIGN.md §1이다.
//
// ⚠️ **눈으로 고른 값을 여기 넣지 않는다.** 한때 HP 빨강이 Material Red 400,
// 기절이 Tailwind gray-500, HUD 강조가 Android 브랜드 초록이었다. 예뻐 보여서
// 고른 값이라 다른 게임의 화면처럼 보였다.
import { createTheme } from '@vanilla-extract/css'
import { vars } from './contract.css'
import { STACK } from './fonts.css'

export const dayTheme = createTheme(vars, {
  // BDSP `UIs/shareduiassets/sharedui` 아틀라스 단면 실측
  window: {
    edge: '#7bb1e7',
    edgeLit: '#8ac1f2',
    edgeDim: '#6fa0d2',
    faceTop: '#f7fdfe',
    faceMid: '#e5ffff',
    faceBottom: '#c3dae2',
    rule: 'rgba(63, 110, 150, 0.30)',
    // 창 안에 깔린 1px 가로 결. 원본은 아틀라스에 구워져 있고 우리는 반복
    // 그러데이션으로 깐다 — 아주 옅어야 글자를 안 방해한다
    grain: 'rgba(63, 110, 150, 0.075)',
  },

  // 고른 것의 금 테두리. 같은 아틀라스에서 잰 값
  pick: {
    edge: '#d7b319',
    face: 'rgba(247, 224, 138, 0.55)',
    text: '#231c05',
  },

  // 창이 밝으므로 글자는 어둡다. 창 바닥색(#c3dae2)에 대해 4.5:1을 넘긴다
  ink: {
    strong: '#101c28',
    normal: '#1d2c3a',
    dim: '#4a6076',
    faint: '#6b8296',
    onDark: '#eef4fb',
    onDarkDim: '#9fb2c6',
  },

  // 막대는 짙은 테두리 안에 광택. 같은 아틀라스 실측
  bar: {
    edge: '#474747',
    trackTop: '#ffffff',
    trackBottom: '#f5f5f5',
    expLit: '#8fd3ff',
    exp: '#2f8fd0',
  },

  // `raw/decomp/res/graphics/party_menu/menu.pal` 실측 (색 9·10 × 세 벌).
  // 경계는 App_BarColor — 1/2과 1/5이다
  hp: {
    greenLit: '#62ff62', green: '#18c520',
    yellowLit: '#ffde00', yellow: '#eeac00',
    redLit: '#ff9c9c', red: '#ff4a39',
    emptyLit: '#a4ac94', empty: '#6a7362',
  },

  state: {
    bad: '#c02a1c',
    good: '#18760f',
    // 원작 성별 기호 색 (`party_menu/menu.pal` 계열 파랑·빨강)
    male: '#2f6ad0',
    female: '#d0417e',
  },

  status: {
    psn: '#a25bc4', tox: '#8b3fae', brn: '#e8763a',
    par: '#d8b12a', slp: '#7b8794', frz: '#4aa8d8',
    text: '#ffffff',
  },

  cmd: { fight: '#e2574c', bag: '#e0a83a', party: '#4fa96b', run: '#4a8fd0' },

  match: { superEff: '#b06f00', resisted: '#3d6c8e', immune: '#a8322a' },

  ball: { top: '#e8554e', band: '#1b1f27', bottom: '#f4f6fa' },

  paper: {
    face: '#fffdf4',
    faceDim: '#e8dfc4',
    edge: '#b39a5c',
    rule: 'rgba(52, 86, 130, 0.16)',
    text: '#2c2a22',
    textDim: '#7a6a44',
    gilt: '#9a7f3e',
  },

  device: {
    shell: '#d8d8d0', shellDim: '#74746c',
    bezel: '#ecece4', bezelDim: '#9a9a92',
    edge: '#4a4a44',
    text: '#1c1c18', textDim: '#5a5a52',
  },

  card: {
    faceTop: '#3f6db4', faceBottom: '#1b2a4c',
    edge: '#7bb1e7',
    text: '#f2f7ff', textDim: '#b8cbe4',
    badgeOn: '#f7d24a', badgeOff: 'rgba(242, 247, 255, 0.26)',
  },

  emphasis: {
    one: '#c0301c', two: '#22459c',
    oneOnDark: '#ffd76a', twoOnDark: '#9fd8ff',
  },

  map: { town: '#4aa3ff', city: '#ff6b5c', locked: '#6a7362' },

  // 간판 나무. `data/signposts.png`가 그 위에 얹히므로 그림의 나무색에 맞춘다
  sign: {
    face: '#d8b483',
    faceDim: '#b08a58',
    edge: '#6b4a29',
    text: '#33210f',
  },

  dev: {
    bg: 'rgba(9, 13, 22, 0.88)',
    edge: 'rgba(150, 176, 224, 0.34)',
    text: '#e8ecf4',
    mark: '#f0b429',
    markFace: 'rgba(240, 180, 41, 0.18)',
    markText: '#241a02',
  },

  scrim: {
    over: 'rgba(10, 24, 40, 0.34)',
    deep: 'rgba(6, 14, 24, 0.62)',
    black: '#000000',
  },

  font: { ui: STACK.ui, pixel: STACK.pixel, mono: STACK.mono },
})
