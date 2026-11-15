// 게임 기록과 트레이너 스코어 (PARITY §7.5)
//
// ⚠️ **표는 디컴프에서 구운 것이다** (`pnpm gen:records`). 여기서 못 박는 것은
// **모양과 규칙**이지 값 하나하나가 아니다 — 값은 굽는 쪽이 책임진다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addRecord, addTrainerScore, MAX_RECORDS, MAX_TRAINER_SCORE_EVENTS, newGameRecords,
  RANKED_RECORDS, RECORD_CAUGHT_POKEMON, RECORD_STEPS, RECORD_TIMES_STUCK_IN_DEEP_MUD, RECORD_TRAINER_SCORE,
  rankedValue, recordLimit, recordValue,
  RECORD_TIMES_MAIL_WRITTEN, SCORE_BADGE_EARNED, SCORE_BERRY_HARVESTED, SCORE_CAUGHT_SPECIES,
  SCORE_HALL_OF_FAME_ENTRY, SCORE_MAIL_WRITTEN, SCORE_WON_WILD_BATTLE,
} from './gameRecords'
import { FLAG_MET_BEBE } from '../script/vars'
import {
  HIGH_LIMIT_U16, HIGH_LIMIT_U32, LOW_LIMIT_U16, LOW_LIMIT_U32, NUM_U32_RECORDS,
  TRAINER_SCORE_INCREMENT, USES_HIGH_LIMIT,
} from './gameRecordsTable'
import { withDecomp } from '../../data/romData.testkit'

describe('표의 모양', () => {
  it('기록 148칸 · 앞 71칸이 u32다', () => {
    expect(MAX_RECORDS).toBe(148)
    expect(NUM_U32_RECORDS).toBe(71)
    expect(USES_HIGH_LIMIT).toHaveLength(MAX_RECORDS)
    expect(newGameRecords()).toHaveLength(MAX_RECORDS)
  })

  it('스코어 사건 51 · 값이 1부터 10,000까지 있다', () => {
    expect(MAX_TRAINER_SCORE_EVENTS).toBe(51)
    expect(TRAINER_SCORE_INCREMENT).toHaveLength(MAX_TRAINER_SCORE_EVENTS)
    expect(Math.min(...TRAINER_SCORE_INCREMENT)).toBe(1)
    expect(Math.max(...TRAINER_SCORE_INCREMENT)).toBe(10000)
  })

  it('⚠️ 상한 넷이 폭과 따로 갈린다', () => {
    // u32 칸: 높은 상한이면 999,999,999, 아니면 999,999
    expect(recordLimit(RECORD_STEPS)).toBe(HIGH_LIMIT_U32)
    expect(recordLimit(RECORD_CAUGHT_POKEMON)).toBe(LOW_LIMIT_U32)
    // u16 칸에도 두 상한이 다 있다 — 폭만 보고 짐작하면 안 된다
    const u16 = Array.from({ length: MAX_RECORDS - NUM_U32_RECORDS }, (_, i) => NUM_U32_RECORDS + i)
    const limits = new Set(u16.map(recordLimit))
    expect(limits).toEqual(new Set([HIGH_LIMIT_U16, LOW_LIMIT_U16]))
  })
})

describe('올리기', () => {
  it('하나씩 쌓인다', () => {
    let r = newGameRecords()
    r = addRecord(r, RECORD_CAUGHT_POKEMON, 1)
    r = addRecord(r, RECORD_CAUGHT_POKEMON, 3)
    expect(recordValue(r, RECORD_CAUGHT_POKEMON)).toBe(4)
  })

  it('⚠️ 상한을 넘으면 0으로 안 돌아간다 — 상한을 채운다', () => {
    const r = addRecord(newGameRecords(), RECORD_CAUGHT_POKEMON, LOW_LIMIT_U32 + 500)
    expect(recordValue(r, RECORD_CAUGHT_POKEMON)).toBe(LOW_LIMIT_U32)
  })

  it('없는 번호는 아무 일도 안 한다', () => {
    const r = addRecord(newGameRecords(), MAX_RECORDS + 5, 1)
    expect(r).toHaveLength(MAX_RECORDS)
    expect(r.every((v) => v === 0)).toBe(true)
  })
})

describe('트레이너 스코어', () => {
  it('⚠️ 사건 번호가 아니라 표의 값만큼 오른다', () => {
    let r = addTrainerScore(newGameRecords(), SCORE_WON_WILD_BATTLE)
    expect(recordValue(r, RECORD_TRAINER_SCORE)).toBe(2)
    r = addTrainerScore(r, SCORE_BADGE_EARNED)
    expect(recordValue(r, RECORD_TRAINER_SCORE)).toBe(2 + 30)
    r = addTrainerScore(r, SCORE_HALL_OF_FAME_ENTRY)
    expect(recordValue(r, RECORD_TRAINER_SCORE)).toBe(2 + 30 + 35)
  })

  it('⚠️ 따로 있는 칸이 아니라 기록 1번이다', () => {
    const r = addTrainerScore(newGameRecords(), SCORE_BADGE_EARNED)
    expect(r[RECORD_TRAINER_SCORE]).toBe(30)
    expect(RECORD_TRAINER_SCORE).toBe(1)
  })

  it('표에 없는 사건은 아무 일도 안 한다', () => {
    const r = addTrainerScore(newGameRecords(), MAX_TRAINER_SCORE_EVENTS + 3)
    expect(recordValue(r, RECORD_TRAINER_SCORE)).toBe(0)
  })
})

describe('랭킹 열세 줄', () => {
  it('줄 수가 원작 그대로다', () => {
    expect(RANKED_RECORDS).toHaveLength(13)
  })

  it('⚠️ 아홉 줄은 §9라 늘 0이다 — 그래도 줄을 안 지운다', () => {
    const blank = RANKED_RECORDS.filter((id) => id < 0)
    expect(blank).toHaveLength(9)
    const r = addRecord(newGameRecords(), RECORD_CAUGHT_POKEMON, 7)
    for (let row = 0; row < RANKED_RECORDS.length; row++) {
      if ((RANKED_RECORDS[row] ?? -1) < 0) expect(rankedValue(r, row)).toBe(0)
    }
    expect(rankedValue(r, 7)).toBe(7)
  })
})

// ⚠️ `raw/`는 리포에 안 들어간다(§14.1). 표가 있을 때만 돌린다
withDecomp('generated/game_records.txt')('원작 번호와 맞대기', () => {
  it('깊은 진흙 칸이 원작 표의 그 자리다 — 붙들릴 때마다 하나씩 쌓인다', () => {
    const names = readFileSync(resolve(__dirname, '../../../raw/decomp/generated/game_records.txt'), 'utf8')
      .split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
    expect(names.indexOf('RECORD_TIMES_STUCK_IN_DEEP_MUD')).toBe(RECORD_TIMES_STUCK_IN_DEEP_MUD)
    expect(RECORD_TIMES_STUCK_IN_DEEP_MUD).toBe(56)
    let r = newGameRecords()
    r = addRecord(r, RECORD_TIMES_STUCK_IN_DEEP_MUD)
    r = addRecord(r, RECORD_TIMES_STUCK_IN_DEEP_MUD)
    expect(recordValue(r, RECORD_TIMES_STUCK_IN_DEEP_MUD)).toBe(2)
  })
})

withDecomp('generated/game_records.txt', 'src/game_records.c', 'generated/vars_flags.txt')('스코어 사건 · 기록 번호 — 원문과 맞대기', () => {
  const raw = (at: string): string => readFileSync(resolve(__dirname, '../../../raw/decomp', at), 'utf8')

  it('스코어 사건 번호가 `sTrainerScoreIncrements`의 줄 순서와 같다', () => {
    const events = [...raw('src/game_records.c').matchAll(/\[(TRAINER_SCORE_EVENT_\w+)\] = (\d+),/g)]
    const at = (name: string): number => events.findIndex((m) => m[1] === name)
    expect(at('TRAINER_SCORE_EVENT_BERRY_HARVESTED')).toBe(SCORE_BERRY_HARVESTED)
    expect(at('TRAINER_SCORE_EVENT_MAIL_WRITTEN')).toBe(SCORE_MAIL_WRITTEN)
    expect(at('TRAINER_SCORE_EVENT_CAUGHT_SPECIES')).toBe(SCORE_CAUGHT_SPECIES)
    events.forEach((m, i) => { expect(TRAINER_SCORE_INCREMENT[i], m[1]).toBe(Number(m[2])) })
  })

  it('편지를 쓴 횟수 칸이 원작 표의 그 자리다', () => {
    const names = raw('generated/game_records.txt').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
    expect(names.indexOf('RECORD_TIMES_MAIL_WRITTEN')).toBe(RECORD_TIMES_MAIL_WRITTEN)
  })

  it('`=` 줄을 세지 않고 이름만 있는 줄을 센 번호가 `FLAG_MET_BEBE`다', () => {
    const names = raw('generated/vars_flags.txt').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.includes('='))
    expect(names.indexOf('FLAG_MET_BEBE')).toBe(FLAG_MET_BEBE)
  })
})

describe('새로 거는 스코어', () => {
  it('열매 · 편지는 1, 새 종은 20이 오른다', () => {
    expect(recordValue(addTrainerScore(newGameRecords(), SCORE_BERRY_HARVESTED), RECORD_TRAINER_SCORE)).toBe(1)
    expect(recordValue(addTrainerScore(newGameRecords(), SCORE_MAIL_WRITTEN), RECORD_TRAINER_SCORE)).toBe(1)
    expect(recordValue(addTrainerScore(newGameRecords(), SCORE_CAUGHT_SPECIES), RECORD_TRAINER_SCORE)).toBe(20)
  })
})
