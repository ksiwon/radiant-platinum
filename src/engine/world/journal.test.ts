import { describe, expect, it } from 'vitest'
import {
  CAVES_USING_DEPARTED, CHAMPIONS, ELITE_FOUR, GYMS, JOURNAL_BUILDINGS, LocationEvent,
  MAP_PLAYER_HOUSE_1F, MAP_RESEARCH_LAB, MapType, MAX_LOCATION_EVENTS, MonResult,
  TrainerKind, checkOpenOnContinue, emptyEntry, eventLocation, eventTrainer, eventType,
  gymTooTough, journalDate, mapTransitionEvent, monVariant, newJournal, packLocationEvent,
  rollPage, saveLocationEvent, saveMon, saveOnline, saveTitle, trainerKind,
} from './journal'

const town = { type: MapType.TOWN_CITY, label: 8 }
const cave = { type: MapType.CAVE, label: 40 }
const indoors = (label: number) => ({ type: MapType.INDOORS, label })

/** 적힌 갈래만 뽑는다 — 묶음 값보다 읽기 쉽다 */
const types = (e: ReturnType<typeof emptyEntry>) => e.locationEvents.map(eventType)

describe('묶음', () => {
  it('자리·트레이너·갈래를 한 u32에 넣고 그대로 되꺼낸다', () => {
    const p = packLocationEvent(0xbeef, 0x2aa, LocationEvent.BEAT_GYM_LEADER)
    expect(eventLocation(p)).toBe(0xbeef)
    expect(eventTrainer(p)).toBe(0x2aa)
    expect(eventType(p)).toBe(LocationEvent.BEAT_GYM_LEADER)
  })

  it('트레이너 번호는 10비트로 잘린다 — 원작 매크로가 그렇다', () => {
    expect(eventTrainer(packLocationEvent(0, 1025, 1))).toBe(1)
  })

  it('높은 자리 번호에서도 음수가 안 나온다', () => {
    // `0xffff << 16`은 32비트 부호를 넘긴다. `>>> 0`이 없으면 여기서 음수가 된다
    const p = packLocationEvent(0xffff, 0, LocationEvent.ITEM_WAS_OBTAINED)
    expect(p).toBeGreaterThan(0)
    expect(eventLocation(p)).toBe(0xffff)
  })
})

describe('쪽 넘기기', () => {
  const today = { year: 26, month: 8, day: 13, week: 4 }

  it('노트를 안 받았으면 아무것도 안 민다', () => {
    const j = newJournal()
    j[0] = saveTitle(j[0]!, { ...today, year: 26, month: 8, day: 1, mapId: 411 })
    expect(rollPage(j, today, false).rolled).toBe(false)
  })

  it('빈 노트는 안 민다 — 첫날에 두 번 불러도 빈 쪽이 안 생긴다', () => {
    expect(rollPage(newJournal(), today, true).rolled).toBe(false)
  })

  it('날이 바뀌면 열 쪽을 한 칸씩 밀고 첫 쪽을 비운다', () => {
    let j = newJournal()
    j[0] = saveTitle(j[0]!, { year: 26, month: 8, day: 12, week: 3, mapId: 411 })
    const got = rollPage(j, today, true)
    expect(got.rolled).toBe(true)
    expect(got.journal[0]!.title.day).toBe(0)
    expect(got.journal[1]!.title.day).toBe(12)
    expect(got.journal).toHaveLength(10)
    j = got.journal
    // 같은 날 다시 부르면 안 민다
    j[0] = saveTitle(j[0]!, { ...today, mapId: 411 })
    expect(rollPage(j, today, true).rolled).toBe(false)
  })

  it('열한 번째 날이 오면 제일 옛 쪽이 떨어져 나간다', () => {
    let j = newJournal()
    for (let d = 1; d <= 11; d++) {
      j = rollPage(j, { year: 26, month: 8, day: d, week: 0 }, true).journal
      j[0] = saveTitle(j[0]!, { year: 26, month: 8, day: d, week: 0, mapId: 400 + d })
    }
    expect(j[0]!.title.day).toBe(11)
    expect(j[9]!.title.day).toBe(2)
  })
})

describe('이어하기에서 저절로 펼치기', () => {
  const then = { year: 26, month: 8, day: 10, week: 1 }
  const at = (d: Partial<typeof then>) => {
    const j = newJournal()
    j[0] = saveTitle(j[0]!, { ...then, mapId: 411 })
    return checkOpenOnContinue(j, { ...then, ...d }, true)
  }

  it('하루 차이로는 안 펼친다', () => { expect(at({ day: 11 })).toBe(false) })
  it('이틀이 지나면 펼친다', () => { expect(at({ day: 12 })).toBe(true) })
  it('해가 바뀌면 펼친다', () => { expect(at({ year: 27 })).toBe(true) })
  it('노트를 안 받았으면 안 펼친다', () => {
    expect(checkOpenOnContinue(newJournal(), then, false)).toBe(false)
  })

  it('12/31과 1/1은 해 차이로만 본다 — 하루 차이인데 날 수로는 못 센다', () => {
    const j = newJournal()
    j[0] = saveTitle(j[0]!, { year: 26, month: 1, day: 1, week: 0, mapId: 411 })
    // 26년 1/1 → 26년 12/31은 그 해 안이라 안 펼친다
    expect(checkOpenOnContinue(j, { year: 26, month: 12, day: 31, week: 4 }, true)).toBe(false)
    // 두 해가 지났으면 펼친다
    expect(checkOpenOnContinue(j, { year: 28, month: 12, day: 31, week: 4 }, true)).toBe(true)
  })
})

describe('머리글', () => {
  it('같은 날이면 안 덮어쓴다 — 그날 처음 선 자리가 남는다', () => {
    const d = { year: 26, month: 8, day: 13, week: 4 }
    const first = saveTitle(emptyEntry(), { ...d, mapId: 411 })
    expect(saveTitle(first, { ...d, mapId: 999 }).title.mapId).toBe(411)
  })

  it('날이 다르면 덮어쓴다', () => {
    const first = saveTitle(emptyEntry(), { year: 26, month: 8, day: 13, week: 4, mapId: 411 })
    const next = saveTitle(first, { year: 26, month: 8, day: 14, week: 5, mapId: 999 })
    expect(next.title.mapId).toBe(999)
  })

  it('오늘 날짜를 원작 모양으로 옮긴다 — 해는 2000을 뺀 값이다', () => {
    expect(journalDate(new Date(2026, 7, 13))).toEqual({ year: 26, month: 8, day: 13, week: 4 })
  })
})

describe('자리 일 — 겹침 거르기', () => {
  it('곁값 없는 일은 바로 앞과 같으면 안 쌓인다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.USED_PC_BOX })
    e = saveLocationEvent(e, { type: LocationEvent.USED_PC_BOX })
    expect(types(e)).toEqual([LocationEvent.USED_PC_BOX, 0, 0, 0])
  })

  it('사이에 다른 일이 끼면 다시 쌓인다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.USED_PC_BOX })
    e = saveLocationEvent(e, { type: LocationEvent.SHOPPED_AT_MART })
    e = saveLocationEvent(e, { type: LocationEvent.USED_PC_BOX })
    expect(types(e)).toEqual([3, 4, 3, 0])
  })

  it('자리 일은 같은 갈래라도 자리가 다르면 쌓인다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: 8 })
    e = saveLocationEvent(e, { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: 8 })
    expect(types(e).filter(Boolean)).toHaveLength(1)
    e = saveLocationEvent(e, { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: 9 })
    expect(types(e).filter(Boolean)).toHaveLength(2)
  })

  it('넷이 차면 앞이 밀려 나간다', () => {
    let e = emptyEntry()
    for (const at of [1, 2, 3, 4, 5]) {
      e = saveLocationEvent(e, { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: at })
    }
    expect(e.locationEvents.map(eventLocation)).toEqual([2, 3, 4, 5])
    expect(e.locationEvents).toHaveLength(MAX_LOCATION_EVENTS)
  })

  it('같은 체육관의 「강적뿐이다」는 이겼을 때 지워진다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.GYM_WAS_TOO_TOUGH, locationId: 0 })
    e = saveLocationEvent(e, { type: LocationEvent.ARRIVED_IN_LOCATION, locationId: 8 })
    e = saveLocationEvent(e, {
      type: LocationEvent.BEAT_GYM_LEADER, locationId: 0, trainerId: GYMS[0]!.trainerId,
    })
    expect(types(e)).toEqual([LocationEvent.ARRIVED_IN_LOCATION, LocationEvent.BEAT_GYM_LEADER, 0, 0])
  })

  it('다른 체육관의 「강적뿐이다」는 안 지운다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.GYM_WAS_TOO_TOUGH, locationId: 1 })
    e = saveLocationEvent(e, { type: LocationEvent.BEAT_GYM_LEADER, locationId: 0, trainerId: 246 })
    expect(types(e)).toEqual([LocationEvent.GYM_WAS_TOO_TOUGH, LocationEvent.BEAT_GYM_LEADER, 0, 0])
  })

  it('사천왕은 넷을 다 이겨도 한 줄만 남는다', () => {
    let e = emptyEntry()
    for (const t of ELITE_FOUR.slice(0, 4)) {
      e = saveLocationEvent(e, { type: LocationEvent.BEAT_ELITE_FOUR_MEMBER, trainerId: t })
    }
    expect(types(e).filter((t) => t === LocationEvent.BEAT_ELITE_FOUR_MEMBER)).toHaveLength(1)
    expect(eventTrainer(e.locationEvents[0]!)).toBe(ELITE_FOUR[3])
  })

  it('챔피언은 안 거른다 — 두 번 이기면 두 줄이다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.BEAT_CHAMPION, trainerId: 267 })
    e = saveLocationEvent(e, { type: LocationEvent.BEAT_CHAMPION, trainerId: 267 })
    expect(types(e).filter((t) => t === LocationEvent.BEAT_CHAMPION)).toHaveLength(2)
  })

  it('도구는 번호가 다르면 쌓인다', () => {
    let e = saveLocationEvent(emptyEntry(), { type: LocationEvent.ITEM_WAS_OBTAINED, item: 4 })
    e = saveLocationEvent(e, { type: LocationEvent.ITEM_WAS_OBTAINED, item: 4 })
    expect(types(e).filter(Boolean)).toHaveLength(1)
    e = saveLocationEvent(e, { type: LocationEvent.ITEM_WAS_OBTAINED, item: 17 })
    expect(e.locationEvents.map(eventLocation).slice(0, 2)).toEqual([4, 17])
  })

  it('표에 없는 갈래는 아무것도 안 적는다', () => {
    expect(saveLocationEvent(emptyEntry(), { type: LocationEvent.UNUSED }).locationEvents)
      .toEqual([0, 0, 0, 0])
  })
})

describe('포켓몬 · 트레이너 · 통신 줄', () => {
  it('포켓몬 줄은 덮어쓴다 — 하루에 남는 것은 한 마리뿐이다', () => {
    let e = saveMon(emptyEntry(), {
      result: MonResult.CAUGHT, variant: 0, timeOfDay: 1, gender: 0, species: 25,
    })
    e = saveMon(e, { result: MonResult.DEFEATED, variant: 1, timeOfDay: 3, gender: 1, species: 396 })
    expect(e.mon.species).toBe(396)
    expect(e.mon.result).toBe(MonResult.DEFEATED)
  })

  it('말투는 플레이 시간의 분이 정한다', () => {
    expect([0, 20, 40].map((m) => monVariant(m))).toEqual([0, 0, 0])
    expect([10, 30].map((m) => monVariant(m))).toEqual([1, 1])
    expect(monVariant(50)).toBe(2)
    // 시간이 넘어가도 분만 본다
    expect(monVariant(3 * 60 + 55)).toBe(2)
  })

  it('통신 줄은 둘까지 쌓이고 넘치면 앞이 밀려 나간다', () => {
    let e = saveOnline(emptyEntry(), { type: 13, result: 1 })
    e = saveOnline(e, { type: 14, result: 0 })
    e = saveOnline(e, { type: 13, result: 3 })
    expect(e.online.map((o) => o.type)).toEqual([14, 13])
    expect(e.online[1]!.result).toBe(3)
  })
})

describe('트레이너 갈래', () => {
  it('관장 여덟을 자리 번호까지 짚는다', () => {
    expect(GYMS.map((g) => trainerKind(g.trainerId).gym)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(trainerKind(GYMS[0]!.trainerId).kind).toBe(TrainerKind.GYM)
  })

  it('사천왕과 챔피언은 재대결 번호까지 안다', () => {
    for (const t of ELITE_FOUR) expect(trainerKind(t).kind).toBe(TrainerKind.ELITE_FOUR)
    for (const t of CHAMPIONS) expect(trainerKind(t).kind).toBe(TrainerKind.CHAMPION)
  })

  it('나머지는 전부 보통 트레이너다', () => {
    expect(trainerKind(1).kind).toBe(TrainerKind.STANDARD)
  })

  it('뱃지 번호가 겹치지 않고 여덟을 다 쓴다', () => {
    expect([...GYMS.map((g) => g.badge)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('아직 못 이긴 체육관', () => {
  it('뱃지가 없으면 그 체육관의 자리 번호를 준다', () => {
    expect(gymTooTough(GYMS[2]!.mapId, 0)).toBe(2)
  })

  it('뱃지가 있으면 안 적는다', () => {
    expect(gymTooTough(GYMS[2]!.mapId, 1 << GYMS[2]!.badge)).toBe(-1)
  })

  it('체육관이 아닌 맵은 -1이다', () => { expect(gymTooTough(411, 0)).toBe(-1) })
})

describe('맵을 넘을 때', () => {
  it('굴에서 밖으로 나오면 적는다', () => {
    expect(mapTransitionEvent(cave, town, 200, 8, 0))
      .toEqual({ type: LocationEvent.LEFT_CAVE, locationId: 40 })
  })

  it('굴에서 굴로는 안 적는다', () => {
    expect(mapTransitionEvent(cave, cave, 200, 201, 0)).toBeNull()
  })

  it('집에서 나오면 「쉬었다」다', () => {
    expect(mapTransitionEvent(indoors(1), town, MAP_PLAYER_HOUSE_1F, 411, 0))
      .toEqual({ type: LocationEvent.RESTED_AT_HOME })
  })

  it('연구소에서 나오면 따로 적는다', () => {
    expect(mapTransitionEvent(indoors(2), town, MAP_RESEARCH_LAB, 412, 0))
      .toEqual({ type: LocationEvent.LEFT_RESEARCH_LAB })
  })

  it('표에 있는 건물만 적는다 — 포켓몬센터는 안 적힌다', () => {
    expect(mapTransitionEvent(indoors(102), town, 300, 8, 0))
      .toEqual({ type: LocationEvent.LEFT_BUILDING, locationId: 102 })
    expect(mapTransitionEvent({ type: MapType.POKECENTER, label: 8 }, town, 300, 8, 0)).toBeNull()
  })

  it('밖에서 아직 못 이긴 체육관으로 들어서면 「강적뿐이다」', () => {
    expect(mapTransitionEvent(town, indoors(11), 8, GYMS[2]!.mapId, 0))
      .toEqual({ type: LocationEvent.GYM_WAS_TOO_TOUGH, locationId: 2 })
    expect(mapTransitionEvent(town, indoors(11), 8, GYMS[2]!.mapId, 1 << GYMS[2]!.badge)).toBeNull()
  })
})

describe('표', () => {
  it('노트에 적히는 건물이 스물일곱이다', () => {
    expect(JOURNAL_BUILDINGS.size).toBe(27)
  })

  it('굴인데 「떠났다」로 적히는 셋이 건물 표에도 있다 — 원작이 둘 다 적어 두었다', () => {
    for (const label of CAVES_USING_DEPARTED) expect(JOURNAL_BUILDINGS.has(label)).toBe(true)
  })
})
