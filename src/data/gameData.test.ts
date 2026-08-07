// 추출된 종족·기술 데이터 회귀 고정 (DATA.md §2.4~§2.6).
//
// 여기 박힌 숫자는 전부 원작과 눈으로 대조한 값이다. 추출기가 롬을 다르게 읽어서
// 이 값이 흔들리면 그건 개선이 아니라 회귀다 — 4세대 데이터는 이제 변하지 않는다.
//
// 특히 스탯: 롬 내부 순서가 HP/공/방/**스피드**/특공/특방이라 재배열이 필요했다.
// 모부기의 스피드 31과 특방 55가 뒤바뀌어도 "그럴듯한" 값이라 눈으로는 안 보인다.
// 그래서 순서 착각이 실제로 잡히는 종(스탯이 서로 다른 종)으로 고정한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { moveFileSchema, speciesFileSchema, labelsSchema, nameListSchema } from './schema'
import { femaleChance } from './gameData'
import { withData } from './romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

// 추출물은 롬이 있어야 만들어진다. 없는 환경에서는 스키마 테스트를 건너뛴다
const maybe = withData('species.json')

maybe('종족 데이터', () => {
  const parsed = speciesFileSchema.parse(read('species.json'))
  const byId = new Map(parsed.species.map((s) => [s.id, s]))

  it('507종이 스키마를 통과한다', () => {
    expect(parsed.species.length).toBe(507)
    expect(parsed.count).toBe(parsed.species.length)
  })

  it('모부기(#387)가 원작과 일치한다', () => {
    const s = byId.get(387)!
    expect(s.stats).toEqual({ hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31 })
    expect(s.types).toEqual([12, 12]) // 풀 단일
    expect(s.catchRate).toBe(45)
    expect(s.baseExp).toBe(64)
    expect(s.ev).toEqual({ hp: 0, atk: 1, def: 0, spa: 0, spd: 0, spe: 0 })
    expect(s.genderRatio).toBe(31) // 수컷 87.5%
    expect(s.eggCycles).toBe(20)
    expect(s.baseFriendship).toBe(70)
    expect(s.growthRate).toBe(3) // Medium Slow
    expect(s.eggGroups).toEqual([1, 7]) // 괴수 / 식물
    expect(s.abilities).toEqual([65, 0]) // 심록
  })

  it('스탯 순서가 뒤집히면 잡힌다 — 스피드와 특방이 크게 다른 종으로', () => {
    // 팬텀(#94): 60/65/60/130/75/110 (HP/공/방/특공/특방/스피드)
    const gengar = byId.get(94)!
    expect(gengar.stats.spa).toBe(130)
    expect(gengar.stats.spe).toBe(110)
    expect(gengar.stats.spd).toBe(75)
    // 딱구리(#95): 방어 160, 스피드 70 — 방/스피드 혼동도 잡는다
    expect(byId.get(95)!.stats.def).toBe(160)
    expect(byId.get(95)!.stats.spe).toBe(70)
  })

  it('진화 분기가 원작과 일치한다', () => {
    expect(byId.get(387)!.evolutions).toEqual([{ method: 4, param: 18, to: 388 }])
    // 이브이(#133) 7갈래: 친밀도 낮/밤 + 돌 3종 + 이끼/얼음바위
    const eevee = byId.get(133)!
    expect(eevee.evolutions).toHaveLength(7)
    expect(eevee.evolutions.map((e) => e.to).sort((a, b) => a - b))
      .toEqual([134, 135, 136, 196, 197, 470, 471])
    // 피카츄는 천둥의돌(아이템 83)
    expect(byId.get(25)!.evolutions).toEqual([{ method: 7, param: 83, to: 26 }])
  })

  it('레벨업 기술이 원작과 일치한다', () => {
    const l = byId.get(387)!.learnset
    expect(l.slice(0, 5)).toEqual([
      { level: 1, move: 33 },   // 몸통박치기
      { level: 5, move: 110 },  // 껍질에숨기
      { level: 9, move: 71 },   // 흡수
      { level: 13, move: 75 },  // 잎날가르기
      { level: 17, move: 174 }, // 저주
    ])
  })

  it('모든 레벨·기술 id가 유효 범위 안에 있다', () => {
    // 범위를 벗어나면 u16 패킹 가정(하위 9비트 기술 / 다음 7비트 레벨)이 깨진 것이다
    const total = parsed.species.reduce((n, s) => n + s.learnset.length, 0)
    expect(total).toBe(6753)
  })
})

maybe('기술 데이터', () => {
  const parsed = moveFileSchema.parse(read('moves.json'))
  const byId = new Map(parsed.moves.map((m) => [m.id, m]))

  it('471개가 스키마를 통과한다', () => {
    expect(parsed.moves.length).toBe(471)
  })

  it('위력·명중·PP·타입이 원작과 일치한다', () => {
    expect(byId.get(1)).toMatchObject({ power: 40, accuracy: 100, pp: 35, type: 0, category: 'physical' })
    expect(byId.get(7)).toMatchObject({ power: 75, accuracy: 100, pp: 15, type: 10, effectChance: 10 })
    expect(byId.get(63)).toMatchObject({ power: 150, accuracy: 90, pp: 5, category: 'special' })
    expect(byId.get(94)).toMatchObject({ power: 90, type: 14, category: 'special', effectChance: 10 })
  })

  it('우선도가 4세대 값과 일치한다', () => {
    expect(byId.get(98)!.priority).toBe(1)   // 전광석화
    expect(byId.get(245)!.priority).toBe(1)  // 신속 — 5세대부터 +2, 4세대는 +1
    expect(byId.get(182)!.priority).toBe(3)  // 방어
    expect(byId.get(46)!.priority).toBe(-6)  // 울부짖기
    // 443개가 0인 분포 자체가 이 바이트가 우선도라는 근거다
    expect(parsed.moves.filter((m) => m.priority === 0).length).toBe(443)
  })

  it('명중률 0은 필중으로 해석된다', () => {
    const swift = byId.get(129)! // 스피드스타
    expect(swift.accuracy).toBe(0)
    expect(swift.alwaysHits).toBe(true)
    expect(parsed.moves.filter((m) => m.alwaysHits).length).toBe(127)
  })

  it('접촉 플래그가 물리·특수와 맞아떨어진다', () => {
    expect(byId.get(7)!.contact).toBe(true)   // 불꽃펀치
    expect(byId.get(63)!.contact).toBe(false) // 파괴광선
  })

  it('분류 분포가 4세대 물리·특수 분리와 일치한다', () => {
    const n = (c: string) => parsed.moves.filter((m) => m.category === c).length
    expect([n('physical'), n('special'), n('status')]).toEqual([192, 109, 170])
  })
})

maybe('이름 테이블', () => {
  it('3로케일 종족명이 같은 길이이고 한국어가 제대로 디코드된다', () => {
    const en = nameListSchema.parse(read('names/species.en.json'))
    const ko = nameListSchema.parse(read('names/species.ko.json'))
    const ja = nameListSchema.parse(read('names/species.ja.json'))
    expect(ko.length).toBe(en.length)
    expect(ja.length).toBe(en.length)
    // 이름 배열은 **종족 번호로** 색인한다 (배열 순서가 아니다)
    expect(ko[387]).toBe('모부기')
    expect(en[387].toLowerCase()).toBe('turtwig')
    expect(ja[387]).toBe('ナエトル')
  })

  it('기술명이 한국어로 디코드된다', () => {
    const ko = nameListSchema.parse(read('names/moves.ko.json'))
    expect(ko[1]).toBe('막치기')
    expect(ko[94]).toBe('사이코키네시스')
    expect(ko[98]).toBe('전광석화')
  })

  it('타입 18종과 특성 이름이 있다', () => {
    const ko = labelsSchema.parse(read('names/labels.ko.json'))
    expect(ko.types).toHaveLength(18)
    expect(ko.types[12]).toBe('풀')
    expect(ko.abilities[65]).toBe('심록')
  })
})

describe('성비 해석', () => {
  it('255는 무성이다', () => expect(femaleChance(255)).toBeNull())
  it('31은 암컷 12.5% 근처다', () => expect(femaleChance(31)).toBeCloseTo(0.125, 2))
  it('127은 반반이다', () => expect(femaleChance(127)).toBeCloseTo(0.5, 2))
})
