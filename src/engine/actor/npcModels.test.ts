// NPC 그림 → BDSP 모델 잇기 (DATA.md §2.16)
//
// 여기서 지키는 것 하나: **그럴듯한 짝을 못 만들게 한다.** 느슨하게 맞추면
// `PARASOL_LADY → lady`(진짜는 `parasollady`)나 `MIDDLE_AGED_WOMAN → man`이
// 조용히 섞인다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  NPC_MODEL_ALIAS, bundlesByTag, modelTagFor, normalize, type NpcModelTable,
} from './npcModels'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'bdspNpc.json')) && existsSync(resolve(DATA, 'npcSprites.json'))
const maybe = present ? describe : describe.skip

const models = (): NpcModelTable =>
  JSON.parse(readFileSync(resolve(DATA, 'bdspNpc.json'), 'utf8')) as NpcModelTable
const sprites = (): Record<string, { name: string }> =>
  JSON.parse(readFileSync(resolve(DATA, 'npcSprites.json'), 'utf8')) as Record<string, { name: string }>

describe('이름 다듬기', () => {
  it('대소문자와 밑줄을 지운다', () => {
    expect(normalize('BUG_CATCHER')).toBe('bugcatcher')
    expect(normalize('bugcatcher')).toBe('bugcatcher')
    expect(normalize('cyclistM')).toBe('cyclistm')
  })
})

describe('짝 짓는 규칙', () => {
  const vocab = ['parasollady', 'lady', 'man', 'women', 'bugcatcher']

  it('⚠️ 부분 일치로는 안 붙는다 — 그럴듯한 오답이 나오는 자리다', () => {
    // `PARASOL_LADY`가 `lady`에 붙으면 양산 든 사람 자리에 다른 사람이 선다
    expect(modelTagFor('PARASOL_LADY', vocab)).toBe('parasollady')
    // 표에도 없고 글자도 안 같으면 없는 것이다
    expect(modelTagFor('MIDDLE_AGED_WOMAN', vocab)).toBeNull()
    expect(modelTagFor('MIDDLE_AGED_MAN', vocab)).toBeNull()
  })

  it('글자가 같으면 붙는다', () => {
    expect(modelTagFor('BUG_CATCHER', vocab)).toBe('bugcatcher')
  })

  it('표에 있어도 그 낱말이 실제로 없으면 안 붙는다', () => {
    expect(modelTagFor('POLICEMAN', vocab)).toBeNull()
    expect(modelTagFor('POLICEMAN', [...vocab, 'police'])).toBe('police')
  })
})

maybe('실제 자료', () => {
  it('손으로 적은 짝이 전부 실재하는 낱말을 가리킨다', () => {
    // 여기가 깨지면 BDSP 쪽 이름을 잘못 적은 것이다
    const vocab = new Set(models().vocabulary)
    const dangling = Object.entries(NPC_MODEL_ALIAS).filter(([, tag]) => !vocab.has(tag))
    expect(dangling).toEqual([])
  })

  it('손으로 적은 짝이 글자 일치와 안 겹친다 — 겹치면 표가 군더더기다', () => {
    const vocab = models().vocabulary
    const redundant = Object.keys(NPC_MODEL_ALIAS).filter(
      (name) => vocab.some((tag) => normalize(tag) === normalize(name)),
    )
    expect(redundant).toEqual([])
  })

  it('그림 하나가 두 낱말에 붙지 않는다', () => {
    const vocab = models().vocabulary
    for (const { name } of Object.values(sprites())) {
      const same = vocab.filter((tag) => normalize(tag) === normalize(name))
      expect(same.length, name).toBeLessThanOrEqual(1)
    }
  })

  it('붙는 것과 안 붙는 것을 세어 둔다', () => {
    const table = models()
    const list = Object.values(sprites())
    const matched = list.filter((s) => modelTagFor(s.name, table.vocabulary) !== null)
    // ⚠️ **절반이 안 붙는다.** 남은 것은 일본어 갈래 이름을 짚어야 아는 것들이라
    // 지어내지 않고 비워 뒀다. 이 수가 늘면 이 자리도 같이 올린다
    expect(matched.length).toBeGreaterThanOrEqual(44)
    expect(matched.length).toBeLessThan(list.length)
  })

  it('번들 이름의 뒤 두 자리는 옷이다', () => {
    const byTag = bundlesByTag(models())
    const stem = (b: string) => b.slice(0, 6)

    // 주인공은 갈아입을 옷이 많다 — `fc0001_00`과 `_10`~`_22`로 열넷이다
    const hero = byTag.get('hero') ?? []
    expect(hero.filter((b) => stem(b) === 'fc0001')).toHaveLength(14)

    // ⚠️ 그런데 `hero`는 `fc0004_00`에도 있다. 낱말 하나가 번호 하나를 뜻한다고
    // 보면 여기서 틀린다 — 같은 사람이 다른 자리에 한 벌 더 있는 것이다
    expect(new Set(hero.map(stem))).toEqual(new Set(['fc0001', 'fc0004']))
    // 여주인공도 같은 모양이다. 우연이 아니라 규칙이라는 뜻이다
    const heroine = byTag.get('heroine') ?? []
    expect(new Set(heroine.map(stem))).toEqual(new Set(['fc0002', 'fc0005']))
  })
})
