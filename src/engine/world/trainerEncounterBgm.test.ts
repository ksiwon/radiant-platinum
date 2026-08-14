// 눈이 마주칠 때의 곡 (PARITY §10 「배틀 진입」)
//
// 표는 `pnpm gen:trainerBgm`이 디컴프에서 굽는다. 여기서는 **다시 구웠을 때
// 조용히 달라지지 않는지**를 본다 — 갈래 번호나 SDAT 세는 법이 어긋나면
// 사천왕 앞에서 꼬맹이 곡이 난다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import { trainerEncounterBgm, TRAINER_ENCOUNTER_BGM_DEFAULT } from './trainerEncounterBgm'

/** `TRAINER_CLASS_ELITE_FOUR_*` 넷과 `TRAINER_CLASS_CHAMPION_CYNTHIA` */
const ELITE_FOUR = [65, 66, 67, 68]
const CHAMPION = 69

it('사천왕 넷이 한 곡을 나눠 쓰고 챔피언만 다르다', () => {
  const four = ELITE_FOUR.map(trainerEncounterBgm)
  expect(new Set(four).size).toBe(1)
  // `SEQ_EYE_TENNO` · `SEQ_EYE_CHAMP`
  expect(four[0]).toBe(1113)
  expect(trainerEncounterBgm(CHAMPION)).toBe(1114)
})

it('갤럭시단은 간부까지 같은 곡이다 (`SEQ_EYE_GINGA`)', () => {
  // 조직원 둘(73·89) + 마스(72)·주피터(87)·새턴(88)
  for (const cls of [73, 89, 72, 87, 88]) expect(trainerEncounterBgm(cls)).toBe(1103)
})

it('표에 없는 갈래는 `SEQ_EYE_KID`다', () => {
  expect(TRAINER_ENCOUNTER_BGM_DEFAULT).toBe(1101)
  expect(trainerEncounterBgm(9999)).toBe(TRAINER_ENCOUNTER_BGM_DEFAULT)
})

const maybe = withData('trainers.json')

maybe('실제 트레이너와 맞물린다', () => {
  const trainers = JSON.parse(readFileSync(resolve(DATA, 'trainers.json'), 'utf8')) as
    { trainers: { id: number, class: number }[] }

  it('928명 전부 곡이 나오고 그 곡이 열다섯 안이다', () => {
    const songs = new Set<number>()
    for (const t of trainers.trainers) songs.add(trainerEncounterBgm(t.class))
    // 표가 곡 열다섯으로 뭉치는데, 실제로 서는 트레이너가 그 전부를 쓰지는
    // 않는다 — 열넷이 나온다 (`SEQ_EYE_*` 하나는 안 쓰는 갈래의 것이다)
    expect(songs.size).toBeGreaterThanOrEqual(10)
    for (const s of songs) expect(s).toBeGreaterThanOrEqual(1100)
    for (const s of songs) expect(s).toBeLessThanOrEqual(1114)
  })

  it('⚠️ 갈래가 없는 트레이너는 없다 — 있으면 전부 꼬맹이 곡이 된다', () => {
    const missing = trainers.trainers.filter((t) => typeof t.class !== 'number')
    expect(missing).toEqual([])
  })
})
