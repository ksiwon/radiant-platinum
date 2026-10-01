// 가방의 갈래 메뉴 · 버리기 · 건네주기 · 자리 기억 (`BagScreen.tsx`)
//
// Z가 곧바로 「쓴다」였고, 등록은 DS의 Y로 적힌 따로 키(실제로는 F), 태그는 Tab이었다.
// 버리기는 아예 없었다. 상처약을 먹이고 돌아오면 늘 첫 주머니 첫 칸이었다.
// 원작 차례는 `applications/bag/main.c`의 `MakeItemActionsMenu`다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BAG_MENU, UI_BANK } from '../../data/uiText'
import { withData } from '../../data/romData.testkit'
import { POCKET_BERRIES, POCKET_TMHMS } from '../../engine/bag/bag'
import { FieldUse } from '../../engine/bag/fieldUse'
import { BINDINGS } from '../../engine/input/keys'
import { keyList } from '../../engine/input/keyNames'
import { ITEM_GRISEOUS_ORB, SPECIES_GIRATINA } from '../../engine/pokemon/form'
import { MAIL_ITEM_FIRST } from '../../engine/world/mail'

const {
  BAG_ACTION_LINE, bagActions, bagFoot, bagMemory, giveVerdict, recallCursor, trashStep,
} = await import('./BagScreen')

const POTION = 17
const base = {
  pocket: 1, item: POTION, fieldUseFunc: FieldUse.HEALING, evoItem: false,
  preventToss: false, canRegister: false, registered: 0, cycling: false, berryPatchEmpty: false,
}

describe('갈래 메뉴 (`MakeItemActionsMenu`)', () => {
  it('회복약은 쓴다 · 건네준다 · 버린다 · 그만둔다', () => {
    expect(bagActions(base)).toEqual(['use', 'give', 'trash', 'cancel'])
  })

  it('나무열매 주머니는 태그확인이 맨 위고, 앞이 빈 밭이면 쓴다 자리가 심는다다', () => {
    const berry = { ...base, pocket: POCKET_BERRIES, fieldUseFunc: FieldUse.BERRY }
    expect(bagActions(berry)).toEqual(['checkTag', 'use', 'give', 'trash', 'cancel'])
    expect(bagActions({ ...berry, berryPatchEmpty: true }))
      .toEqual(['checkTag', 'plant', 'give', 'trash', 'cancel'])
  })

  it('기술머신은 못 버린다', () => {
    expect(bagActions({ ...base, pocket: POCKET_TMHMS, fieldUseFunc: FieldUse.TM_HM }))
      .toEqual(['use', 'give', 'cancel'])
  })

  it('중요한 물건은 건네주기·버리기가 없고, 등록할 수 있으면 등록·해제가 붙는다', () => {
    const bike = { ...base, pocket: 7, fieldUseFunc: FieldUse.BICYCLE, preventToss: true, canRegister: true }
    expect(bagActions(bike)).toEqual(['use', 'register', 'cancel'])
    // 타고 있으면 쓴다 자리가 「내린다」다
    expect(bagActions({ ...bike, cycling: true })).toEqual(['walk', 'register', 'cancel'])
    expect(bagActions({ ...bike, registered: POTION })).toEqual(['use', 'deselect', 'cancel'])
  })

  it('메일 주머니는 본다 · 포핀케이스는 연다', () => {
    expect(bagActions({ ...base, pocket: 5, fieldUseFunc: FieldUse.MAIL })[0]).toBe('check')
    expect(bagActions({ ...base, pocket: 7, fieldUseFunc: FieldUse.POFFIN_CASE, preventToss: true })[0])
      .toBe('open')
  })

  it('밖에서 못 쓰는 물건은 쓴다 자리가 없다 — 교환 진화 도구만 예외다', () => {
    expect(bagActions({ ...base, fieldUseFunc: FieldUse.NONE })).toEqual(['give', 'trash', 'cancel'])
    expect(bagActions({ ...base, fieldUseFunc: FieldUse.NONE, evoItem: true })[0]).toBe('use')
    expect(bagActions({ ...base, fieldUseFunc: FieldUse.NONE, preventToss: true })).toEqual(['cancel'])
  })
})

describe('버릴 개수 (`sub_0208C15C`)', () => {
  it('위아래는 하나씩, 끝에서 돈다', () => {
    expect(trashStep(1, 5, 'up')).toBe(2)
    expect(trashStep(5, 5, 'up')).toBe(1)
    expect(trashStep(1, 5, 'down')).toBe(5)
  })

  it('좌우는 열씩, 1과 최대에서 멈춘다', () => {
    expect(trashStep(3, 50, 'right')).toBe(13)
    expect(trashStep(45, 50, 'right')).toBe(50)
    expect(trashStep(13, 50, 'left')).toBe(3)
    expect(trashStep(3, 50, 'left')).toBe(1)
  })
})

describe('건네주기 (`ProcessItemApplication`)', () => {
  it('빈손이면 지닌다 · 무엇을 들었으면 맞바꿀지 묻는다 · 메일이면 떼라고 한다', () => {
    expect(giveVerdict({ species: 1, heldItem: 0 }, POTION)).toBe('given')
    expect(giveVerdict({ species: 1, heldItem: POTION }, 18)).toBe('swap')
    expect(giveVerdict({ species: 1, heldItem: MAIL_ITEM_FIRST }, POTION)).toBe('mustRemoveMail')
  })

  it('백금옥은 기라티나만 — 빈손이어도 못 지닌다', () => {
    expect(giveVerdict({ species: 1, heldItem: 0 }, ITEM_GRISEOUS_ORB)).toBe('cannotHold')
    expect(giveVerdict({ species: SPECIES_GIRATINA, heldItem: 0 }, ITEM_GRISEOUS_ORB)).toBe('given')
  })
})

describe('자리 기억 (`BagCursor`)', () => {
  afterEach(() => { bagMemory.pocket = 0; bagMemory.pos = [] })

  it('주머니마다 커서를 따로 기억하고, 목록이 줄었으면 끝 칸으로 당긴다', () => {
    bagMemory.pos[1] = 4
    bagMemory.pos[3] = 10
    expect(recallCursor(1, 9)).toBe(4)
    expect(recallCursor(3, 4)).toBe(3)
    expect(recallCursor(2, 9)).toBe(0)
    expect(recallCursor(3, 0)).toBe(0)
  })
})

describe('바닥 안내', () => {
  it('Z가 메뉴를 연다고 말하고, 묶이지 않은 키(Y·Tab)를 안 적는다', () => {
    expect(bagFoot('normal')).toContain('Z 메뉴')
    for (const mode of ['normal', 'give', 'pick', 'menu', 'count'] as const) {
      expect(bagFoot(mode)).not.toMatch(/\bY\b|Tab/)
    }
  })

  it('등록 표식은 실제 등록 키 이름이다', () => {
    expect(keyList(BINDINGS.register, 'ko')).toBe('F')
  })
})

withData(`dialogue/ko/${String(UI_BANK.bag)}.json`)('가방 뱅크의 글', () => {
  const bank = (): string[] => JSON.parse(readFileSync(
    resolve(__dirname, `../../../public/data/dialogue/ko/${String(UI_BANK.bag)}.json`), 'utf8',
  )) as string[]

  it('갈래 이름이 롬 줄이다', () => {
    const text = bank()
    expect(text[BAG_ACTION_LINE.use]).toBe('쓴다')
    expect(text[BAG_ACTION_LINE.trash]).toBe('버린다')
    expect(text[BAG_ACTION_LINE.give]).toBe('건네준다')
    expect(text[BAG_ACTION_LINE.register]).toBe('등록')
    expect(text[BAG_ACTION_LINE.deselect]).toBe('해제')
    expect(text[BAG_ACTION_LINE.checkTag]).toBe('태그확인')
    expect(text[BAG_ACTION_LINE.cancel]).toBe('그만둔다')
    expect(text[BAG_MENU.trashOk]).toContain('버려도 괜찮겠습니까?')
  })
})
