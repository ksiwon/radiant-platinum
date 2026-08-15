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
}

export const stubFieldMoves: NonNullable<FieldServices['fieldMoves']> = {
  badges: () => 0,
  knows: () => false,
  use: () => false,
  strength: () => false,
}
