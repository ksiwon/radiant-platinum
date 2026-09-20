// 시험이 쓰는 빈 서비스 한 벌 (`FieldServices`)
//
// 인터페이스가 넓어서 시험마다 다 적으면 **무엇을 보는 시험인지가 안 보인다.**
// 여기에 아무것도 안 하는 판을 두고 시험은 보려는 것만 갈아 끼운다:
//
//     party: { ...stubParty, addFriendship: (slot, amount) => { … } }
//
// 명령을 하나 만들 때마다 세 시험 파일을 고치던 것을 여기 한 곳으로 모은 것이다.
import type { FieldServices } from './world'

export const stubParty: NonNullable<FieldServices['party']> = {
  count: () => 0,
  species: () => 0,
  nickname: () => '',
  hasSpecies: () => false,
  aliveExcept: () => 0,
  give: () => false,
  giveFateful: () => false,
  level: () => 0,
  nature: () => 0,
  friendship: () => 0,
  addFriendship: () => { /* 안 본다 */ },
  hasMove: () => false,
  move: () => 0,
  form: () => 0,
  setForm: () => { /* 안 본다 */ },
  giratinaForm: () => { /* 안 본다 */ },
  revertForms: () => 0,
  rotomForms: () => 0,
  rotomCount: () => ({ count: 0, first: 0xff }),
  moveCount: () => 0,
  hasHeldItem: () => false,
  types: () => [0, 0],
  countAtOrBelowLevel: () => 0,
  isOutsider: () => false,
  evTotal: () => 0,
  // 못 찾았을 때의 값이 명령마다 다르다 — 기술만 6이고 나머지는 0xFF다
  findWithMove: () => 6,
  findWithNature: () => 0xff,
  findWithSpecies: () => 0xff,
  findFateful: () => 0xff,
  clearMoveSlot: () => { /* 안 본다 */ },
  setMoveSlot: () => { /* 안 본다 */ },
  sizeOf: () => null,
  heightOf: () => 0,
}

export const stubLabels: NonNullable<FieldServices['labels']> = {
  berry: () => '',
  accessory: () => '',
  move: () => '',
  pocket: () => '',
  species: () => '',
  type: () => '',
  nature: () => '',
  trainer: () => '',
  trainerClass: () => '',
  map: () => '',
  tmMove: () => '',
  item: () => '',
  itemWithArticle: () => '',
  itemPlural: () => '',
  speciesWithArticle: () => '',
  trainerClassWithArticle: () => '',
}

export const stubTrainerInfo: NonNullable<FieldServices['trainerInfo']> = {
  gender: () => 0,
  id: () => 0,
  hasBadge: () => false,
  giveBadge: () => { /* 안 본다 */ },
  nationalDex: () => false,
  unownFormsSeen: () => 0,
  hasSeen: () => false,
  randomSeen: () => 25,
  dexCount: () => 0,
  dexCompleted: () => false,
  turnOnDetection: () => { /* 안 본다 */ },
}

export const stubFieldMoves: NonNullable<FieldServices['fieldMoves']> = {
  badges: () => 0,
  knows: () => false,
  use: () => false,
  strength: () => false,
}

/**
 * 바깥 일감을 전부 "끝났다"로 답하는 판.
 *
 * 값은 스크립트가 갈래를 타는 데 필요한 최소한이다 — 파티가 있고, 배틀은
 * 이기고, 화면은 곧바로 닫힌다
 */
export const allDoneServices = {
  startTrainerBattle: () => {},
  startFirstBattle: () => {},
  startScriptedWildBattle: () => {},
  startTagBattle: () => {},
  battleResult: () => 'win' as const,
  trainer: () => ({ double: false, msg: {}, class: 0 }),
  trainerMessage: () => '',
  aliveMons: () => 6,
  party: {
    ...stubParty,
    count: () => 6,
    species: () => 387,
    hasSpecies: () => true,
    aliveExcept: () => 5,
    give: () => true,
    level: () => 5,
    friendship: () => 70,
    hasMove: () => true,
    move: () => 33,
    moveCount: () => 4,
  },
  trainerInfo: { ...stubTrainerInfo, hasBadge: () => true },
  labels: stubLabels,
  chooseMon: { open: () => {}, picked: () => 0 },
  boxes: { nickname: () => '', lotteryEntries: () => ({ party: [], boxes: [] }) },
  tablet: { name: () => '', open: () => {} },
  appearance: { get: () => 0, set: () => {} },
  bag: {
    pocketOf: () => 0,
    add: () => true,
    remove: () => true,
    canFit: () => true,
    quantity: () => 1,
    pocketHasItems: () => true,
    name: () => '',
  },
  money: { get: () => 3_000, add: () => {}, spend: () => true },
  openStartMenu: () => {},
  menuOpen: () => false,
  openShop: () => {},
  openStorage: () => {},
  boxFreeSlots: () => 30,
  aliveAndBoxMons: () => 6,
  martStock: { common: () => [], specialties: () => [] },
  fieldMoves: { ...stubFieldMoves, badges: () => 0xff, knows: () => true },
  sound: {
    playEffect: () => {},
    stopEffect: () => {},
    effectPlaying: () => false,
    playCry: () => {},
    cryPlaying: () => false,
    playFanfare: () => {},
    fanfarePlaying: () => false,
    setMusic: () => {},
    sequencePlaying: () => false,
    fadeVolume: () => {},
  },
  healParty: () => {},
  setHealSpot: () => {},
  blackOut: () => {},
  timeOfDay: () => 1,
  gear: { giveRunningShoes: () => {}, hasRunningShoes: () => true },
  warpEvents: { setPos: () => {} },
  door: {
    load: () => {}, open: () => {}, close: () => {}, busy: () => false, unload: () => {},
  },
  chooseStarter: { open: () => {}, chosen: () => 387 },
  breakObstacle: { start: () => {}, done: () => true },
  hmCutIn: { start: () => {}, done: () => true },
  seeSpecies: () => {},
  naming: { openForParty: () => {}, named: () => '' },
  giveEgg: () => {},
  survivePoison: () => true,
  camera: { free: () => {}, restore: () => {} },
}
