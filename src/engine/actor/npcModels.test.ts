// NPC 그림 → BDSP 모델 잇기 (DATA.md §2.16)
//
// 여기서 지키는 것 둘:
//
//   ① **그럴듯한 짝을 못 만들게 한다.** 느슨하게 맞추면 `PARASOL_LADY → lady`
//      (진짜는 `parasollady`)나 `MIDDLE_AGED_WOMAN → man`이 조용히 섞인다.
//   ② **등신을 먼저 쓴다.** 치비 쪽을 먼저 보면 정해 둔 아트 방향과 반대로
//      간다 (PLAN §4.3). 실제로 한 번 그렇게 만들어 놨었다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  NPC_MODEL_ALIAS, bundlesByTag, modelFor, modelTagFor, normalize, type NpcModelTable,
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

describe('등신이 먼저다', () => {
  const table: NpcModelTable = {
    battle: { bundles: { tr0001_00: ['bugcatcher'] }, vocabulary: ['bugcatcher'] },
    field: { bundles: { fc0001_00: ['bugcatcher', 'maid'] }, vocabulary: ['bugcatcher', 'maid'] },
  }

  it('양쪽에 다 있으면 등신을 고른다', () => {
    expect(modelFor('BUG_CATCHER', table)).toEqual({ build: 'battle', tag: 'bugcatcher' })
  })

  it('등신에 없으면 치비로 내려간다 — 판때기보다는 낫다', () => {
    expect(modelFor('MAID', table)).toEqual({ build: 'field', tag: 'maid' })
  })

  it('둘 다 없으면 없는 것이다', () => {
    expect(modelFor('MIDDLE_AGED_MAN', table)).toBeNull()
  })
})

maybe('실제 자료', () => {
  it('손으로 적은 짝이 전부 실재하는 낱말을 가리킨다', () => {
    // 여기가 깨지면 BDSP 쪽 이름을 잘못 적은 것이다. 두 뭉치를 합쳐서 본다 —
    // `nursejoy`처럼 오버월드에만 있는 사람이 있다
    const table = models()
    const vocab = new Set([...table.battle.vocabulary, ...table.field.vocabulary])
    const dangling = Object.entries(NPC_MODEL_ALIAS).filter(([, tag]) => !vocab.has(tag))
    expect(dangling).toEqual([])
  })

  it('손으로 적은 짝이 글자 일치와 안 겹친다 — 겹치면 표가 군더더기다', () => {
    const table = models()
    const vocab = [...table.battle.vocabulary, ...table.field.vocabulary]
    const redundant = Object.keys(NPC_MODEL_ALIAS).filter(
      (name) => vocab.some((tag) => normalize(tag) === normalize(name)),
    )
    expect(redundant).toEqual([])
  })

  it('그림 하나가 한 뭉치 안의 두 낱말에 붙지 않는다', () => {
    const table = models()
    for (const set of [table.battle, table.field]) {
      for (const { name } of Object.values(sprites())) {
        const same = set.vocabulary.filter((tag) => normalize(tag) === normalize(name))
        expect(same.length, name).toBeLessThanOrEqual(1)
      }
    }
  })

  it('붙는 것과 안 붙는 것을 세어 둔다', () => {
    const table = models()
    const list = Object.values(sprites())
    const found = list.map((s) => modelFor(s.name, table)).filter((m) => m !== null)
    // ⚠️ **절반이 안 붙는다.** 남은 것은 일본어 갈래 이름을 짚어야 아는 것들이라
    // 지어내지 않고 비워 뒀다. 이 수가 늘면 이 자리도 같이 올린다
    expect(found.length).toBeGreaterThanOrEqual(44)
    expect(found.length).toBeLessThan(list.length)
    // 대부분이 등신이다. 치비로 내려가는 것은 트레이너가 아닌 사람들뿐이다
    const chibi = found.filter((m) => m.build === 'field')
    expect(chibi.length).toBeLessThan(found.length / 4)
  })

  it('번들 이름의 뒤 두 자리는 옷이다', () => {
    const byTag = bundlesByTag(models().battle)
    const stem = (b: string) => b.slice(0, 6)

    // 주인공은 갈아입을 옷이 많다 — `_00`과 `_10`~`_22`로 열넷씩이다
    const hero = byTag.get('hero') ?? []
    const heroine = byTag.get('heroine') ?? []
    expect(hero.filter((b) => stem(b) === 'pc0001')).toHaveLength(14)
    expect(heroine.filter((b) => stem(b) === 'pc0002')).toHaveLength(14)

    // ⚠️ **번들 하나가 갈래 하나를 뜻하지 않는다.** `pc0001_12`에는 두 이름표가
    // 다 들어 있다 — 남주인공 옷 한 벌 안에 `heroine` 텍스처가 섞여 있다.
    // "낱말 하나 = 사람 하나"로 보면 여기서 틀린다
    expect(hero).toContain('pc0001_12')
    expect(heroine).toContain('pc0001_12')
    expect(heroine).toHaveLength(15)
  })
})
