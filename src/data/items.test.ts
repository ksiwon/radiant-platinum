// 아이템 자료 검증 (DATA.md §2.12)
//
// 값이 맞는지는 추출기가 증명한다 — 디컴프의 res/items/data/*.json 446개와 필드별로
// 대조해 불일치 0이다 (`pnpm extract:items`, 롬과 디컴프가 있어야 돈다).
//
// 여기서는 **산출물이 그 결과와 어긋나지 않았는지**를 본다. 주머니 번호가 밀리면
// 가방이 통째로 잘못 나뉘는데, 문법상으로는 아무 문제가 없어서 눈으로는 안 잡힌다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { itemFileSchema, itemIconsSchema, POCKET_COUNT } from './schema'
import { withData } from './romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('items.json')

maybe('아이템', () => {
  const file = itemFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8')))
  const names: string[] = JSON.parse(readFileSync(resolve(DATA, 'names/items.ko.json'), 'utf8'))
  const descriptions: string[] =
    JSON.parse(readFileSync(resolve(DATA, 'names/itemDescriptions.ko.json'), 'utf8'))

  it('468종이고 자료가 있는 것은 446종이다', () => {
    // 468 = 열거형 전체, 446 = pl_item_data.narc 파일 수. 차이 22가 ITEM_UNUSED_*다
    expect(file.items).toHaveLength(468)
    expect(file.items.filter((i) => i.data === null)).toHaveLength(22)
    expect(file.items.filter((i) => i.constant.startsWith('ITEM_UNUSED_'))).toHaveLength(22)
    expect(names).toHaveLength(468)
    expect(descriptions).toHaveLength(468)
  })

  it('자료 번호가 빠짐없이 이어진다', () => {
    // dataID는 아카이브 안의 자리다. 하나라도 건너뛰면 그 뒤가 전부 밀린다
    const ids = file.items.filter((i) => i.dataID !== undefined).map((i) => i.dataID)
    expect(ids).toEqual(Array.from({ length: 446 }, (_, i) => i))
  })

  it('주머니가 원작대로 나뉜다', () => {
    expect(file.pockets).toHaveLength(POCKET_COUNT)
    expect(file.pockets[2]).toBe('balls')
    const at = (name: string) => file.items.findIndex((i) => i.name === name)
    expect(file.items[at('poke_ball')]?.pocket).toBe(2)      // 볼
    expect(file.items[at('potion')]?.pocket).toBe(1)         // 회복
    expect(file.items[at('cheri_berry')]?.pocket).toBe(4)    // 나무열매
    expect(file.items[at('bicycle')]?.pocket).toBe(7)        // 중요한 물건
    expect(file.items[at('x_attack')]?.pocket).toBe(6)       // 배틀용
  })

  it('회복량과 값이 원작 그대로다', () => {
    // 상처약 20 · 좋은상처약 50 · 고급상처약 200 · 풀회복약은 최대치(255로 표시한다)
    const by = (n: string) => file.items.find((i) => i.name === n)
    expect(by('potion')?.param?.hpRestored).toBe(20)
    expect(by('potion')?.price).toBe(300)
    expect(by('super_potion')?.param?.hpRestored).toBe(50)
    expect(by('hyper_potion')?.param?.hpRestored).toBe(200)
    expect(by('max_potion')?.param?.hpRestored).toBe(255)
    expect(by('full_restore')?.param?.hpRestored).toBe(255)
    // 마스터볼은 팔 수 없다 — 값이 0이다
    expect(by('master_ball')?.price).toBe(0)
  })

  it('중요한 물건은 버릴 수 없다', () => {
    const keyItems = file.items.filter((i) => i.pocket === 7)
    expect(keyItems).toHaveLength(40)
    expect(keyItems.every((i) => i.preventToss === 1)).toBe(true)
  })

  it('한국어 이름이 붙는다', () => {
    expect(names[1]).toBe('마스터볼')
    expect(names[4]).toBe('몬스터볼')
    expect(names[17]).toBe('상처약')
    expect(descriptions[17]).toContain('20')
  })

  it('아이콘 칸이 아이템 수를 덮는다', () => {
    const icons = itemIconsSchema.parse(
      JSON.parse(readFileSync(resolve(DATA, 'itemIcons.json'), 'utf8')),
    )
    expect(icons.count).toBe(468)
    expect(icons.cols * icons.rows).toBeGreaterThanOrEqual(468)
    expect(existsSync(resolve(DATA, 'itemIcons.png'))).toBe(true)
  })
})
