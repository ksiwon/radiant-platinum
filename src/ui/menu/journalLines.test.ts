// 모험노트가 내는 글 (PARITY §7.4)
//
// 두 가지를 지킨다:
//
//   ① 줄 번호 표(`J`)가 **롬 뱅크의 그 줄**을 가리키는가 — 하나만 밀려도
//      「풀베기!」 자리에 「파도타기!」가 뜬다. 글자가 나오긴 하므로 눈으로는
//      넘어가기 쉽다
//   ② 어느 문장을 고르는가 — 말투 셋, 굴 셋의 예외, 글자 수 네 갈래
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LocationEvent, MonResult, emptyEntry, packLocationEvent, saveMon, saveTitle, saveTrainer,
} from '../../engine/world/journal'
import {
  J, TRAINER_CLASS_RIVAL, journalPage, locationEventLine, monLine, trainerLine,
  type JournalNames,
} from './journalLines'

/** 실제 롬 글이 있으면 그것을, 없으면 자리만 세는 가짜를 쓴다 */
const KO_JOURNAL = resolve(__dirname, '../../../public/data/dialogue/ko/366.json')
const realEntries: string[] | null = existsSync(KO_JOURNAL)
  ? JSON.parse(readFileSync(KO_JOURNAL, 'utf8')) as string[]
  : null

/** 자리를 눈으로 짚을 수 있게 번호를 그대로 낸다 */
const numbered = (n: number): string[] => Array.from({ length: n }, (_, i) => `#${String(i)}`)

const names = (over: Partial<JournalNames> = {}): JournalNames => ({
  entries: realEntries ?? numbered(103),
  gyms: ['무쇠체육관', '영원체육관', '들판체육관', '장막체육관',
    '연고체육관', '선단체육관', '운하체육관', '물가체육관'],
  times: ['아침', '낮', '저녁', '밤', '심야'],
  months: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
  locations: (() => {
    const list = numbered(126)
    list[8] = '무쇠시티'
    list[40] = '천관산'
    list[47] = '골짜기발전소'
    list[102] = '게임코너'
    list[91] = '포켓치주식회사'
    list[1] = '떡잎마을'
    return list
  })(),
  items: (() => { const list = numbered(500); list[4] = '몬스터볼'; return list })(),
  species: (() => { const list = numbered(494); list[25] = '피카츄'; return list })(),
  trainers: (() => { const list = numbered(928); list[246] = '강석'; list[1] = '영수'; return list })(),
  trainerClass: () => 0,
  rivalName: '진구',
  // 자리 번호를 그대로 쓴다 — 맵과 지역명이 1:1인 가짜 세계다
  labelOf: (mapId) => mapId,
  ...over,
})

describe('뱅크 줄 번호', () => {
  it.runIf(realEntries)('한국어 롬의 그 줄을 가리킨다', () => {
    const e = realEntries!
    expect(e[J.startedFrom]).toContain('시작')
    expect(e[J.sunday]).toBe('일요일')
    expect(e[J.sunday + 6]).toBe('토요일')
    expect(e[J.restedAtHome]).toContain('느긋하게 쉬었다')
    expect(e[J.usedPcBox]).toBe('박스를 썼다')
    expect(e[J.gymTooTough]).toContain('강적뿐이다')
    expect(e[J.beatEliteFour]).toContain('사천왕')
    expect(e[J.beatChampion]).toContain('챔피언')
    expect(e[J.arrived]).toContain('도착')
    expect(e[J.gotThrough]).toContain('빠져나왔다')
    expect(e[J.departed]).toContain('떠났다')
    expect(e[J.exited]).toContain('나왔다')
    expect(e[J.itemObtained]).toContain('손에 넣었다')
    expect(e[J.usedCut]).toContain('풀베기')
    expect(e[J.flewTo]).toContain('날아갔다')
    expect(e[J.usedSurf]).toContain('파도타기')
    expect(e[J.usedStrength]).toContain('괴력')
    expect(e[J.usedFlash]).toContain('플래시')
    expect(e[J.usedRockSmash]).toContain('바위깨기')
    expect(e[J.usedWaterfall]).toContain('폭포오르기')
    expect(e[J.usedRockClimb]).toContain('락클라임')
    expect(e[J.usedDefog]).toContain('안개제거')
    expect(e[J.usedDig]).toContain('구멍파기')
    expect(e[J.warpedTo]).toContain('순간이동')
    expect(e[J.usedSoftboiled]).toContain('알낳기')
    expect(e[J.usedMilkDrink]).toContain('우유마시기')
    expect(e[J.caught]).toContain('잡았다')
    expect(e[J.wasDefeated]).toContain('쓰러뜨렸다')
    expect(e[J.gameCorner]).toContain('게임코너')
    expect(e[J.battleTower]).toContain('배틀타워')
    expect(e[J.placedInContest]).toContain('콘테스트')
    expect(e[J.madePoffins]).toContain('포핀')
  })
})

describe('자리 일 한 줄', () => {
  const line = (packed: number, over?: Partial<JournalNames>) =>
    locationEventLine(packed, names(over))

  it('빈 칸은 아무것도 안 낸다', () => {
    expect(line(0)).toBeNull()
  })

  it.runIf(realEntries)('곁값 없는 일은 그 문장 그대로다', () => {
    expect(line(packLocationEvent(0, 0, LocationEvent.USED_PC_BOX))).toBe('박스를 썼다')
  })

  it.runIf(realEntries)('자리 이름을 맵의 지역명에서 가져온다', () => {
    expect(line(packLocationEvent(8, 0, LocationEvent.ARRIVED_IN_LOCATION)))
      .toBe('무쇠시티에 도착!')
  })

  it.runIf(realEntries)('체육관 이름과 관장 이름이 같이 들어간다', () => {
    expect(line(packLocationEvent(0, 246, LocationEvent.BEAT_GYM_LEADER)))
      .toBe('무쇠체육관의 강석에게 이겼다!')
  })

  it.runIf(realEntries)('도구는 도구 이름을 쓴다 — 같은 칸이지만 표가 다르다', () => {
    expect(line(packLocationEvent(4, 0, LocationEvent.ITEM_WAS_OBTAINED)))
      .toBe('몬스터볼을 손에 넣었다')
  })

  it.runIf(realEntries)('굴은 「빠져나왔다」지만 셋만 「떠났다」다', () => {
    expect(line(packLocationEvent(40, 0, LocationEvent.LEFT_CAVE)))
      .toBe('천관산을 빠져나왔다')
    // 골짜기발전소(47)는 굴로 적혀 있지만 「떠났다」로 나온다
    expect(line(packLocationEvent(47, 0, LocationEvent.LEFT_CAVE)))
      .toBe('골짜기발전소를 떠났다')
  })

  it.runIf(realEntries)('건물은 표의 참·거짓이 「나왔다」와 「떠났다」를 가른다', () => {
    // 게임코너(102)는 참 → 「나왔다」
    expect(line(packLocationEvent(102, 0, LocationEvent.LEFT_BUILDING)))
      .toBe('게임코너를 나왔다')
    // 포켓치주식회사(91)는 거짓 → 「떠났다」
    expect(line(packLocationEvent(91, 0, LocationEvent.LEFT_BUILDING)))
      .toBe('포켓치주식회사를 떠났다')
  })

  it('표에 없는 갈래는 그릴 것이 없다', () => {
    expect(line(packLocationEvent(0, 0, LocationEvent.UNUSED))).toBeNull()
  })
})

describe('포켓몬 한 줄', () => {
  const mon = (over: Partial<{ result: number; variant: number; gender: number }>) =>
    monLine(saveMon(emptyEntry(), {
      result: MonResult.CAUGHT, variant: 0, timeOfDay: 1, gender: 0, species: 25, ...over,
    }), names())

  it('아무것도 없으면 null이다', () => {
    expect(monLine(emptyEntry(), names())).toBeNull()
  })

  it.runIf(realEntries)('말투 셋이 서로 다른 문장을 낸다', () => {
    const zero = mon({ variant: 0 })
    const one = mon({ variant: 1 })
    const two = mon({ variant: 2 })
    expect(new Set([zero, one, two]).size).toBe(3)
    for (const text of [zero, one, two]) expect(text).toContain('피카츄')
  })

  it.runIf(realEntries)('말투 2는 성별 문장을 쓴다', () => {
    expect(mon({ variant: 2, gender: 0 })).toContain('수컷')
    expect(mon({ variant: 2, gender: 1 })).toContain('암컷')
  })

  it.runIf(realEntries)('무성은 성별 문장이 없어서 첫 갈래로 돌아간다', () => {
    expect(mon({ variant: 2, gender: 2 })).toBe(mon({ variant: 0 }))
  })

  it.runIf(realEntries)('시간대 이름이 들어간다', () => {
    expect(mon({})).toContain('낮')
  })

  it.runIf(realEntries)('쓰러뜨린 것은 다른 문장이다', () => {
    expect(mon({ result: MonResult.DEFEATED })).toContain('쓰러뜨렸다')
  })
})

describe('보통 트레이너 한 줄', () => {
  const withNames = (place: string, who: string) => trainerLine(
    saveTrainer(emptyEntry(), { standard: 1, trainerId: 1, mapId: 8 }),
    names({
      locations: (() => { const l = numbered(126); l[8] = place; return l })(),
      trainers: (() => { const l = numbered(928); l[1] = who; return l })(),
    }),
  )

  it('안 싸웠으면 null이다', () => {
    expect(trainerLine(emptyEntry(), names())).toBeNull()
  })

  it.runIf(realEntries)('글자 수가 늘수록 짧은 문장을 고른다', () => {
    const short = withNames('무쇠시티', '영수')
    const mid = withNames('무쇠시티', '영수영수영')
    const long = withNames('무쇠시티', '영수영수영수영')
    const longest = withNames('무쇠시티', '영수영수영수영수영수')
    // 넷이 서로 다른 문장 틀이다
    expect(new Set([short, mid, long, longest]).size).toBe(4)
  })

  it.runIf(realEntries)('라이벌은 주인공이 지은 이름으로 나온다', () => {
    const line = trainerLine(
      saveTrainer(emptyEntry(), { standard: 1, trainerId: 1, mapId: 8 }),
      names({ trainerClass: () => TRAINER_CLASS_RIVAL }),
    )
    expect(line).toContain('진구')
  })
})

describe('쪽 한 장', () => {
  it('안 쓴 쪽은 null이다', () => {
    expect(journalPage(emptyEntry(), names())).toBeNull()
  })

  it.runIf(realEntries)('날짜·요일·시작 자리를 낸다', () => {
    const page = journalPage(
      saveTitle(emptyEntry(), { year: 26, month: 8, day: 13, week: 4, mapId: 1 }),
      names(),
    )
    // ⚠️ **달 이름을 그대로 넣으면 「8월월」이 된다.** 한국 표가 `8월`인데
    // 문장 틀이 뒤에 `월`을 또 쓴다 — 숫자만 넣는 규칙을 `memo`와 함께 쓴다
    expect(page?.date).toBe('8월 13일')
    expect(page?.weekday).toBe('목요일')
    expect(page?.from).toBe('떡잎마을에서 시작!')
  })

  it.runIf(realEntries)('자리 일 · 포켓몬 · 트레이너 차례로 이어 붙인다', () => {
    let e = saveTitle(emptyEntry(), { year: 26, month: 8, day: 13, week: 4, mapId: 1 })
    e = { ...e, locationEvents: [packLocationEvent(8, 0, LocationEvent.ARRIVED_IN_LOCATION), 0, 0, 0] }
    e = saveMon(e, { result: MonResult.CAUGHT, variant: 0, timeOfDay: 1, gender: 0, species: 25 })
    e = saveTrainer(e, { standard: 1, trainerId: 1, mapId: 8 })
    const page = journalPage(e, names())
    expect(page?.lines).toHaveLength(3)
    expect(page?.lines[0]).toBe('무쇠시티에 도착!')
    expect(page?.lines[1]).toContain('피카츄')
    expect(page?.lines[2]).toContain('무쇠시티')
  })

  it('빈 칸을 만나면 뒤는 안 본다 — 원작 인쇄기가 거기서 멈춘다', () => {
    let e = saveTitle(emptyEntry(), { year: 26, month: 8, day: 13, week: 4, mapId: 1 })
    e = {
      ...e,
      locationEvents: [packLocationEvent(0, 0, LocationEvent.USED_PC_BOX), 0,
        packLocationEvent(0, 0, LocationEvent.GAME_CORNER), 0],
    }
    expect(journalPage(e, names())?.lines).toHaveLength(1)
  })
})
