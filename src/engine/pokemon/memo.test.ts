// 어디서 왔는가 · 트레이너 메모 (PARITY §3.8 · §5)
//
// **재는 것 다섯:**
//
//   ① 잡기·알 받기·부화가 서로의 자리를 지운다 — 안 지우면 잡은 마리가
//      "알에서 나왔다"로 읽힌다
//   ② 갈래 번호가 원작 `DeterminePokemonStatus`와 같다
//   ③ 개성이 PID에서 시작해 돌고, **스피드가 셋째**다
//   ④ 좋아하는 맛이 성격이 올리는 능력을 따라간다
//   ⑤ 줄 번호가 갈래마다 다르다 — 사이가 비는 것이 원작의 얼개다
import { describe, expect, it } from 'vitest'
import {
  caughtAt, characteristicLine, eggFrom, flavorLine, hatchedAt, memoStatus, memoTemplate,
  metBank, MET_DAYCARE, metToday, noOrigin, type MetDate,
} from './origin'
import { buildMemo, metName, type MemoNames } from './memo'
import { natureEffect } from './stats'
import type { PokemonInstance } from './instance'

const ME = { name: '나', gender: 'male' } as const
const DAY: MetDate = { year: 10, month: 3, day: 7 }
/** 무성시티 근처 아무 지역명 번호. 값 자체는 뜻이 없고 0이 아니기만 하면 된다 */
const HERE = 12

describe('어디서 왔는가', () => {
  it('잡으면 알 자리가 비고, 알을 받으면 만난 자리가 빈다', () => {
    const caught = caughtAt(ME, HERE, 18, DAY)
    expect(caught.met).toEqual({ location: HERE, date: DAY })
    expect(caught.metLevel).toBe(18)
    // ⚠️ 알 자리가 남아 있으면 `DeterminePokemonStatus`가 부화한 것으로 읽는다
    expect(caught.egg.location).toBe(0)

    const egg = eggFrom(ME, MET_DAYCARE, DAY)
    expect(egg.egg.location).toBe(MET_DAYCARE)
    expect(egg.met.location).toBe(0)
    // 부화한 개체의 메모에는 Lv 줄이 없다 — 그래서 안 새긴다
    expect(egg.metLevel).toBe(0)
  })

  it('깨면 알 자리는 그대로 두고 만난 자리만 채운다', () => {
    const later: MetDate = { year: 10, month: 4, day: 1 }
    const hatched = hatchedAt(eggFrom(ME, MET_DAYCARE, DAY), HERE, later)
    expect(hatched.egg).toEqual({ location: MET_DAYCARE, date: DAY })
    expect(hatched.met).toEqual({ location: HERE, date: later })
  })

  it('2000을 넘으면 다른 표다 (`sub_02017038`)', () => {
    expect(metBank(HERE)).toEqual({ special: false, index: HERE })
    expect(metBank(2000)).toEqual({ special: true, index: 0 })
    expect(metBank(2011)).toEqual({ special: true, index: 11 })
  })

  it('갈래 번호가 원작 표와 같다', () => {
    expect(memoStatus(caughtAt(ME, HERE, 5, DAY), true)).toBe(0)
    expect(memoStatus(caughtAt(ME, HERE, 5, DAY), false)).toBe(1)
    // 통신교환으로 온 것은 원트레이너와 상관없이 2다
    expect(memoStatus(caughtAt(ME, 2001, 5, DAY), true)).toBe(2)
    // 육성가 알은 5/6이고, 표에 없는 알 자리는 3/4다
    expect(memoStatus(hatchedAt(eggFrom(ME, MET_DAYCARE, DAY), HERE, DAY), true)).toBe(5)
    expect(memoStatus(hatchedAt(eggFrom(ME, 2005, DAY), HERE, DAY), true)).toBe(3)
    // 아직 안 깬 알도 알 자리가 차 있으므로 같은 갈래로 읽힌다
    expect(memoStatus(eggFrom(ME, MET_DAYCARE, DAY), true)).toBe(5)
    expect(memoStatus({ ...caughtAt(ME, HERE, 5, DAY), fateful: true }, true)).toBe(7)
  })

  it('갈래 → 문장 틀 번호. 16~20에서 103이 두 번 나온다', () => {
    expect(memoTemplate(0)).toBe(49)
    expect(memoTemplate(15)).toBe(64)
    expect([16, 17, 18, 19, 20].map(memoTemplate)).toEqual([101, 102, 103, 103, 104])
  })

  it('오늘은 2000을 뺀 해다 — 문장 틀이 "20{해}"로 찍는다', () => {
    expect(metToday(new Date(2026, 7, 12))).toEqual({ year: 26, month: 8, day: 12 })
  })
})

describe('개성', () => {
  const ivs = (hp: number, atk: number, def: number, spa: number, spd: number, spe: number) =>
    ({ hp, atk, def, spa, spd, spe })

  it('PID % 6에서 시작해 여섯을 돈다', () => {
    // 전부 같으면 시작 자리가 그대로 이긴다 — 앞선 것이 이기기 때문이다
    for (let start = 0; start < 6; start++) {
      expect(characteristicLine(start, ivs(9, 9, 9, 9, 9, 9))).toBe(71 + start * 5 + 4)
    }
  })

  it('⚠️ 스피드가 셋째다 — 능력 화면 차례가 아니라 개체값 저장 차례다', () => {
    // 스피드만 높은 개체. 능력 화면 차례(…특공·특방·스피드)로 놓으면 5번이
    // 나오는데 원작은 3번이다
    expect(characteristicLine(0, ivs(0, 0, 0, 0, 0, 31))).toBe(71 + 3 * 5 + 1)
    // 특공만 높으면 4번
    expect(characteristicLine(0, ivs(0, 0, 0, 31, 0, 0))).toBe(71 + 4 * 5 + 1)
    // 특방만 높으면 5번
    expect(characteristicLine(0, ivs(0, 0, 0, 0, 31, 0))).toBe(71 + 5 * 5 + 1)
  })

  it('서른 줄 안에 머문다', () => {
    for (let pid = 0; pid < 6; pid++) {
      for (let iv = 0; iv <= 31; iv++) {
        const got = characteristicLine(pid, ivs(iv, 0, 0, 0, 0, 0))
        expect(got).toBeGreaterThanOrEqual(71)
        expect(got).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('좋아하는 맛', () => {
  it('성격이 올리는 능력을 따라간다 (`sNatureFlavorAffinities`)', () => {
    // 매운맛 공격 · 떫은맛 특공 · 단맛 스피드 · 쓴맛 특방 · 신맛 방어
    expect(flavorLine('atk')).toBe(65)
    expect(flavorLine('spa')).toBe(66)
    expect(flavorLine('spe')).toBe(67)
    expect(flavorLine('spd')).toBe(68)
    expect(flavorLine('def')).toBe(69)
  })

  it('무보정 성격은 좋아하는 맛이 없다', () => {
    // 0·6·12·18·24가 무보정이다
    for (const nature of [0, 6, 12, 18, 24]) {
      expect(natureEffect(nature).up).toBeNull()
      expect(flavorLine(natureEffect(nature).up)).toBe(70)
    }
  })
})

const NAMES: MemoNames = {
  location: ['', '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타'],
  special: ['육', '통', '통2', '관', '성', '호', '신', '', '먼', '여', '리', '난', '수'],
  month: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
}

describe('자리 이름', () => {
  it('0번은 지역명 표가 아니라 "수수께끼의 장소"다', () => {
    // ⚠️ 지역명 0번은 빈 글이라 그냥 쓰면 자리가 통째로 사라진다.
    // 원작도 `!(type == 0 && id == 0)`으로 빼낸다
    expect(metName(0, NAMES)).toBe('수')
    expect(metName(HERE, NAMES)).toBe('타')
    expect(metName(2000, NAMES)).toBe('육')
  })
})

function mon(over: Partial<PokemonInstance> = {}): PokemonInstance {
  return {
    species: 387, pid: 0, nickname: null, exp: 0, level: 5,
    ivs: { hp: 31, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
    friendship: 70, isEgg: false, otId: 1, otSecretId: 2, ball: 4,
    origin: noOrigin(ME), form: 0, pokerus: 0, ...over,
  }
}

describe('트레이너 메모', () => {
  it('잡은 마리는 1·2·6·7줄이다 — 3~5가 비는 것이 얼개다', () => {
    const memo = buildMemo(mon({ origin: caughtAt(ME, HERE, 5, DAY) }), true, NAMES)
    expect(memo.lines.map((l) => l.at)).toEqual([1, 2, 6, 7])
    expect(memo.metLine).toBe(2)
  })

  it('부화한 마리는 개성이 한 칸 아래다 (8·9줄)', () => {
    const origin = hatchedAt(eggFrom(ME, MET_DAYCARE, DAY), HERE, DAY)
    const memo = buildMemo(mon({ origin }), true, NAMES)
    expect(memo.lines.map((l) => l.at)).toEqual([1, 2, 8, 9])
  })

  it('알은 만난 자리와 친밀도 두 줄뿐이다 — 성격도 개성도 안 찍는다', () => {
    // 안에 무엇이 들었는지가 새어 나가면 안 된다
    const memo = buildMemo(
      mon({ isEgg: true, friendship: 3, origin: eggFrom(ME, MET_DAYCARE, DAY) }), true, NAMES,
    )
    expect(memo.lines.map((l) => l.at)).toEqual([1, 6])
    // 친밀도 칸이 **남은 부화 걸음**이라 작을수록 곧 깬다
    expect(memo.lines[1]?.message).toBe(105)
    expect(buildMemo(
      mon({ isEgg: true, friendship: 200, origin: eggFrom(ME, MET_DAYCARE, DAY) }), true, NAMES,
    ).lines[1]?.message).toBe(108)
  })

  it('⚠️ 한국어 달 이름은 단위가 이미 붙어 있어 숫자만 넣는다', () => {
    // 문장 틀이 뒤에 "월"을 또 쓴다 — 이름을 그대로 넣으면 "3월월"이 된다
    const memo = buildMemo(mon({ origin: caughtAt(ME, HERE, 18, DAY) }), true, NAMES)
    expect(memo.slots[1]).toBe('3')
    // 미국 표는 숫자로 시작하지 않으므로 이름을 그대로 쓴다
    const en = buildMemo(mon({ origin: caughtAt(ME, HERE, 18, DAY) }), true, {
      ...NAMES, month: ['Jan.', 'Feb.', 'Mar.'],
    })
    expect(en.slots[1]).toBe('Mar.')
  })

  it('아홉 칸이 원작 차례대로 찬다 — 여덟째가 알 자리다', () => {
    const origin = hatchedAt(eggFrom(ME, MET_DAYCARE, DAY), HERE, { year: 11, month: 1, day: 2 })
    const memo = buildMemo(mon({ origin }), true, NAMES)
    expect(memo.slots).toEqual(['11', '1', '2', '0', '타', '10', '3', '7', '육'])
  })

  it('날짜가 안 새겨진 옛 개체도 안 깨진다 — 달을 1로 자른다', () => {
    // 판 12 이전의 리포트다. 원작도 1~12 밖이면 1월로 자른다
    const memo = buildMemo(mon({ origin: noOrigin(ME) }), true, NAMES)
    expect(memo.slots[0]).toBe('00')
    expect(memo.slots[1]).toBe('1')
    expect(memo.slots[4]).toBe('수')
  })
})
