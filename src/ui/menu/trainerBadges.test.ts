// 트레이너 카드의 배지 표 (`trainerBadges.ts`) — 관장 갈래가 롬과 맞는지, 배지 이름이 뽑히는지, 커서가 받은 배지만 밟는지.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, decodePng, withData, withDecomp } from '../../data/romData.testkit'
import {
  BADGE_BIT_OF_LINE, BADGE_COUNT, BADGE_LEADERS, BADGE_WINDOW, BADGE_WINDOW_TOP, badgeNames, earnedBits, firstPick, stepBadge, usableName,
} from './trainerBadges'

const readJson = <T>(file: string): T => JSON.parse(readFileSync(resolve(DATA, file), 'utf8')) as T

describe('earnedBits · firstPick', () => {
  it('받은 비트만 작은 번호부터 센다', () => {
    expect(earnedBits(0b00011111)).toEqual([0, 1, 2, 3, 4])
    expect(earnedBits(0)).toEqual([])
  })

  it('처음에는 받은 것 중 가장 높은 번호를 고른다 · 하나도 없으면 null', () => {
    expect(firstPick(0b00011111)).toBe(4)
    expect(firstPick(0b10000001)).toBe(7)
    expect(firstPick(0)).toBeNull()
  })
})

describe('stepBadge — 받은 배지만 밟는다', () => {
  const got = 0b10100101 // 비트 0 2 5 7

  it('←→는 받은 것을 하나씩, 끝에서 처음으로 돈다', () => {
    expect(stepBadge(got, 0, 'right')).toBe(2)
    expect(stepBadge(got, 7, 'right')).toBe(0)
    expect(stepBadge(got, 0, 'left')).toBe(7)
    expect(stepBadge(got, 5, 'left')).toBe(2)
  })

  it('↑↓는 받은 것을 두 칸씩 감는다', () => {
    expect(stepBadge(got, 0, 'down')).toBe(5)
    expect(stepBadge(got, 2, 'down')).toBe(7)
    expect(stepBadge(got, 0, 'up')).toBe(5)
  })

  it('못 받은 비트는 한 번도 밟지 않는다', () => {
    let at: number | null = 0
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) {
      at = stepBadge(got, at, (['right', 'down', 'left', 'up'] as const)[i % 4]!)
      if (at !== null) seen.add(at)
    }
    expect([...seen].every((b) => (got & (1 << b)) !== 0)).toBe(true)
  })

  it('옮길 데가 없으면 null이다(소리를 안 낸다) — 하나뿐이거나 하나도 없을 때', () => {
    expect(stepBadge(0b100, 2, 'right')).toBeNull()
    expect(stepBadge(0, null, 'right')).toBeNull()
  })

  it('고른 것이 없거나 못 받은 것이면 가장 높은 받은 배지에서 출발한다', () => {
    expect(stepBadge(got, null, 'left')).toBe(5)
    expect(stepBadge(got, 1, 'left')).toBe(5)
  })
})

describe('badgeNames — 리그 문지기 대사에서 배지 이름', () => {
  it('한국어 · 영어 · 일본어 모양에서 토막마다 이름을 뽑고 비트 차례로 놓는다', () => {
    const ko = '확인!\r무쇠시티의 콜배지!\r영원시티의 포리스트배지!\r연고시티의 레릭배지!\r장막시티의 코블배지!\r들판시티의 펜배지!\r'
      + '운하시티의 마인배지!\r선단시티의 글레이셔배지!\r그리고!\n물가시티의 비컨배지!\r'
    expect(badgeNames([ko])).toEqual([
      '콜배지', '포리스트배지', '코블배지', '펜배지', '레릭배지', '마인배지', '글레이셔배지', '비컨배지',
    ])
    const en = 'x\rOreburgh City’s Coal Badge!\rEterna City’s Forest Badge!\rHearthome City’s Relic Badge!\r'
      + 'Veilstone City’s Cobble Badge!\rPastoria City’s Fen Badge!\rCanalave City’s Mine Badge!\r'
      + 'Snowpoint City’s Icicle Badge!\rAnd...\nSunyshore City’s Beacon Badge!\r'
    expect(badgeNames([en])[4]).toBe('Relic Badge')
    const ja = 'x\rクロガネの　コ－ルバッジ！\rハクタイの　フォレストバッジ！\rヨスガの　レリックバッジ！\rトバリの　コボルバッジ！\r'
      + 'ノモセの　フェンバッジ！\rミオの　マインバッジ！\rキッサキの　グレイシャバッジ！\rそして！\nナギサの　ビ－コンバッジ！\r'
    expect(badgeNames([ja])[7]).toBe('ビ－コンバッジ')
  })

  it('여덟 토막이 안 나오면 빈 칸으로 둔다 — 이름을 지어내지 않는다', () => {
    expect(badgeNames(['배지 없음', '무쇠시티의 콜배지!\r']).every((n) => n === null)).toBe(true)
  })

  it('틀 부호가 남은 이름은 안 쓴다 (영어 판의 관장 이름은 `{TRNAME}`)', () => {
    expect(usableName('{TRNAME}')).toBeNull()
    expect(usableName('')).toBeNull()
    expect(usableName(undefined)).toBeNull()
    expect(usableName('강석')).toBe('강석')
  })

  it('대사 차례 → 비트 표는 일대일이다', () => {
    expect([...BADGE_BIT_OF_LINE].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

withData(
  'dialogue/ko/184.json', 'dialogue/en/184.json', 'dialogue/ja/184.json',
  'names/trainers.ko.json', 'names/locations.ko.json',
)('롬 글 — 배지 이름 · 관장 · 도시', () => {
  it.each(['ko', 'en', 'ja'])('%s 판 184번 뱅크에서 여덟 이름이 다 뽑힌다', (lg) => {
    const names = badgeNames(readJson<string[]>(`dialogue/${lg}/184.json`))
    expect(names).toHaveLength(BADGE_COUNT)
    expect(names.every((n) => n !== null && n !== '')).toBe(true)
  })

  it('한국어 이름이 관장 도시와 짝이 맞는다 (비트 차례)', () => {
    const names = badgeNames(readJson<string[]>('dialogue/ko/184.json'))
    expect(names).toEqual(['콜배지', '포리스트배지', '코블배지', '펜배지', '레릭배지', '마인배지', '글레이셔배지', '비컨배지'])
    const gate = readJson<string[]>('dialogue/ko/184.json').find((s) => s.includes('콜배지'))!
    const places = readJson<string[]>('names/locations.ko.json')
    // 문지기 대사의 「○○시티의 ○○배지」가 우리 표의 도시와 같은 쌍인가
    BADGE_LEADERS.forEach((leader, bit) => {
      expect(gate).toContain(`${places[leader.place]!}의 ${names[bit]!}`)
    })
  })

  it('관장 이름이 한국어 표에 있다', () => {
    const trainers = readJson<string[]>('names/trainers.ko.json')
    expect(BADGE_LEADERS.map((l) => trainers[l.trainer])).toEqual(
      ['강석', '유채', '자두', '맥실러', '멜리사', '동관', '무청', '전진'],
    )
  })
})

withDecomp('generated/trainer_classes.txt')('관장 갈래 — 디컴프 `TRAINER_CLASS_LEADER_*`', () => {
  it('갈래 번호가 줄 번호 − 1이다 (비트 차례 로크 · 가드니아 · 메이플 · 웨이크 · 페이션 · 바이런 · 캔디스 · 볼커)', () => {
    const lines = readFileSync(resolve(__dirname, '../../../raw/decomp/generated/trainer_classes.txt'), 'utf8')
      .split(/\r?\n/).map((s) => s.trim())
    const classOf = (name: string): number => lines.indexOf(`TRAINER_CLASS_LEADER_${name}`)
    expect(BADGE_LEADERS.map((l) => l.cls)).toEqual(
      ['ROARK', 'GARDENIA', 'MAYLENE', 'WAKE', 'FANTINA', 'BYRON', 'CANDICE', 'VOLKNER'].map(classOf),
    )
  })
})

withData('trainerCase/badges.png')('배지 그림 — 홈 정사각 창에 도트가 다 든다', () => {
  it('받은 줄(때 줄 1)의 여덟 칸 도트가 40×40 창(`BADGE_WINDOW_TOP`) 안에 있다', async () => {
    const { width, height, pixels } = decodePng(resolve(DATA, 'trainerCase/badges.png'))
    const cell = { w: 40, h: 63 }
    expect(width).toBe(cell.w * 8)
    expect(height).toBe(cell.h * 4)
    for (let bit = 0; bit < 8; bit++) {
      let min = Infinity
      let max = -Infinity
      for (let y = 0; y < cell.h; y++) {
        for (let x = 0; x < cell.w; x++) {
          if (pixels[((cell.h + y) * width + bit * cell.w + x) * 4 + 3]! > 0) { min = Math.min(min, y); max = Math.max(max, y) }
        }
      }
      expect(min).toBeGreaterThanOrEqual(BADGE_WINDOW_TOP[bit]!)
      expect(max).toBeLessThan(BADGE_WINDOW_TOP[bit]! + BADGE_WINDOW)
    }
  })
})
