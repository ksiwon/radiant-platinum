// 날이 바뀔 때 (`FieldSystem_HandleDailyEvents` · `dailyEvents.ts`)
import { describe, expect, it } from 'vitest'
import { DAILY_FLAGS_END, DAILY_FLAGS_START, handleDailyEvents } from './dailyEvents'
import { VAR_DAILY_RANDOM_LEVEL, VAR_NEWS_PRESS_DEADLINE } from '../script/commands'
import { VarStore } from '../script/vars'

const FLAG_DAILY_SET_BATTLEGROUND_TRAINERS = 2743
const IRON_ISLAND_STARS = [782, 783, 784, 785]
const FLOAROMA_HONEY = [788, 789, 949, 950, 951, 952]

function withAll(): VarStore {
  const v = new VarStore()
  for (let id = DAILY_FLAGS_START; id <= DAILY_FLAGS_END; id++) v.setFlag(id)
  for (const id of [...IRON_ISLAND_STARS, ...FLOAROMA_HONEY]) v.setFlag(id)
  v.set(VAR_NEWS_PRESS_DEADLINE, 3)
  return v
}

describe('날이 바뀌면', () => {
  it('하루 깃발을 통째로 지운다 — 그 밖의 깃발은 안 건드린다', () => {
    const v = withAll()
    v.setFlag(DAILY_FLAGS_START - 1)
    v.setFlag(DAILY_FLAGS_END + 1)
    handleDailyEvents(v, 1, 0, () => 0)
    expect(v.checkFlag(FLAG_DAILY_SET_BATTLEGROUND_TRAINERS)).toBe(false)
    for (let id = DAILY_FLAGS_START; id <= DAILY_FLAGS_END; id++) expect(v.checkFlag(id)).toBe(false)
    expect(v.checkFlag(DAILY_FLAGS_START - 1)).toBe(true)
    expect(v.checkFlag(DAILY_FLAGS_END + 1)).toBe(true)
  })

  it('신문사 마감이 지난 날만큼 줄고 0 밑으로 안 간다', () => {
    const v = withAll()
    handleDailyEvents(v, 2, 0, () => 0)
    expect(v.get(VAR_NEWS_PRESS_DEADLINE)).toBe(1)
    handleDailyEvents(v, 5, 0, () => 0)
    expect(v.get(VAR_NEWS_PRESS_DEADLINE)).toBe(0)
  })

  it('오늘의 레벨이 2~99다', () => {
    const v = withAll()
    handleDailyEvents(v, 1, 0, () => 0)
    expect(v.get(VAR_DAILY_RANDOM_LEVEL)).toBe(2)
    handleDailyEvents(v, 1, 0, (n) => n - 1)
    expect(v.get(VAR_DAILY_RANDOM_LEVEL)).toBe(99)
  })

  it('숨은 도구 넷 — 무쇠섬 둘 · 꽃밭 둘. 서 있는 맵은 안 되살린다', () => {
    // 오늘의 레벨이 먼저 한 번 굴린다(0) — 그다음 무쇠섬 둘(0 · 3), 꽃밭 둘(1 · 5)
    const rolls = [0, 0, 3, 1, 5]
    let i = 0
    const v = withAll()
    handleDailyEvents(v, 1, 0, (n) => rolls[i++]! % n)
    expect(IRON_ISLAND_STARS.map((f) => v.checkFlag(f))).toEqual([false, true, true, false])
    expect(FLOAROMA_HONEY.map((f) => v.checkFlag(f))).toEqual([true, false, true, true, true, false])
    // 무쇠섬 B1F 오른쪽 방(291)에 서 있으면 그 방의 별의조각은 그대로다 · 꽃밭(256)에 서 있으면 꿀은 안 굴린다
    const w = withAll()
    handleDailyEvents(w, 1, 291, () => 0)
    expect(w.checkFlag(782)).toBe(true)
    const m = withAll()
    handleDailyEvents(m, 1, 256, () => 0)
    expect(FLOAROMA_HONEY.every((f) => m.checkFlag(f))).toBe(true)
  })

  it('하루도 안 지났으면 아무것도 안 한다', () => {
    const v = withAll()
    handleDailyEvents(v, 0, 0, () => 0)
    expect(v.checkFlag(FLAG_DAILY_SET_BATTLEGROUND_TRAINERS)).toBe(true)
    expect(v.get(VAR_NEWS_PRESS_DEADLINE)).toBe(3)
  })
})
