// 트레이너 추출 검증 (DATA.md §2.9).
//
// trpoke는 항목마다 크기가 다르고, 그 크기는 trdata의 플래그와 파티 인원에서
// 계산된다. **그 계산이 틀리면 두 번째 마리부터 통째로 밀린다** — 레벨 자리에서
// 종족 번호를 읽어 그럴듯한 쓰레기가 나오고, 스키마는 그걸 못 잡는다.
//
// 그래서 원작 대조로 고정한다. 강석·난천의 파티는 공개된 값이라 독립 출처다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { trainerFileSchema, type Trainer } from './schema'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const present = existsSync(resolve(DATA, 'trainers.json'))
const maybe = present ? describe : describe.skip

const file = present ? trainerFileSchema.parse(read('trainers.json')) : null
const trainers: Trainer[] = file ? file.trainers : []
const names: string[] = present ? read('names/trainers.ko.json') : []
const classes: string[] = present ? read('names/trainerClasses.ko.json') : []

const party = (id: number) => trainers[id]!.party.map((m) => `${m.species}/${m.level}`)

maybe('트레이너 데이터', () => {
  it('928명 전부 있고 번호가 배열 위치와 같다', () => {
    expect(trainers).toHaveLength(928)
    trainers.forEach((t, i) => expect(t.id, `${i}번 자리`).toBe(i))
  })

  it('이름과 분류가 짝이 맞는다', () => {
    expect(names).toHaveLength(928)
    expect(classes).toHaveLength(105)
    for (const t of trainers) {
      expect(classes[t.class], `#${t.id} 분류 ${t.class}`).toBeTruthy()
    }
  })

  it('강석(#250)이 원작과 같다', () => {
    // 자철석37 / 강철톤38 / 바리톱스41. 바리톱스는 자당열매를 든다
    expect(names[250]).toBe('동관')
    expect(classes[trainers[250]!.class]).toBe('체육관 관장')
    expect(party(250)).toEqual(['82/37', '208/38', '411/41'])
    expect(trainers[250]!.party[2]!.item, '바리톱스가 도구를 안 들었다').toBeGreaterThan(0)
    // 관장은 지정 기술을 갖는다 — 레벨업 기술로 싸우지 않는다
    expect(trainers[250]!.party[0]!.moves.length).toBeGreaterThan(0)
  })

  it('난천(#267)이 원작과 같다', () => {
    // 챔피언 6마리. 여기가 맞으면 가변 길이 계산이 6마리까지 안 밀린다는 뜻이다
    expect(names[267]).toBe('난천')
    expect(classes[trainers[267]!.class]).toBe('챔피언')
    expect(party(267)).toEqual(['442/58', '407/58', '468/60', '448/60', '350/58', '445/62'])
  })

  it('레벨과 종족 번호가 4세대 범위 안이다', () => {
    // 배치가 한 칸 밀리면 레벨 자리에서 종족 번호를 읽어 수백이 나온다
    const mons = trainers.flatMap((t) => t.party)
    expect(mons).toHaveLength(1878)
    for (const m of mons) {
      expect(m.level, `종족 ${m.species}`).toBeGreaterThanOrEqual(1)
      expect(m.level).toBeLessThanOrEqual(100)
      expect(m.species).toBeLessThanOrEqual(493)
      for (const mv of m.moves) expect(mv, `종족 ${m.species}의 기술`).toBeLessThanOrEqual(467)
    }
  })

  it('폼 지정은 도롱충이 계열뿐이다', () => {
    // 하위 10비트가 종족이라는 근거다. 11비트로 끊으면 이 열 마리가 1400번대의
    // 존재하지 않는 종이 된다
    const formed = trainers.flatMap((t) => t.party).filter((m) => m.form)
    expect(formed).toHaveLength(10)
    expect(new Set(formed.map((m) => m.species))).toEqual(new Set([412, 413, 422, 423]))
    for (const m of formed) expect(m.form).toBeLessThanOrEqual(2)
  })

  it('더블 배틀 트레이너는 전부 두 마리다', () => {
    // 이 필드가 더블 플래그라는 근거. 28명 전부 정확히 2마리이고, 나머지
    // 900명의 파티 크기는 1~6으로 퍼져 있다
    const doubles = trainers.filter((t) => t.double)
    expect(doubles).toHaveLength(28)
    for (const t of doubles) expect(t.party, `#${t.id}`).toHaveLength(2)
  })

  it('AI 플래그가 아홉 가지뿐이고 미지의 비트가 없다', () => {
    // 928명을 통틀어 실제로 쓰이는 비트는 하위 여섯 개뿐이다. 그 여섯 개만
    // 구현하면 게임 전체가 덮인다 (PLAN §7.7)
    const used = new Set(trainers.map((t) => t.ai))
    expect([...used].sort((a, b) => a - b)).toEqual([0, 1, 3, 5, 7, 15, 17, 33, 35])
    const bits = trainers.reduce((acc, t) => acc | t.ai, 0)
    expect(bits, '쓰이는 비트가 늘었다').toBe(0b111111)
  })

  it('0번은 자리표시자다', () => {
    // 파티가 비어 있다. 이걸 실제 트레이너로 착각하면 빈 배틀이 열린다
    expect(trainers[0]!.party).toHaveLength(0)
    expect(trainers[0]!.ai).toBe(0)
  })
})
