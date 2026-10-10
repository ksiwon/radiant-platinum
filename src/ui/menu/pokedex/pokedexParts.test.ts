// 도감 쪽 부품의 규칙 — 열림 · 모습 이름 · 울음 볼 판 · 분포 칸 · 롬 줄 번호.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PokedexHabitat } from '../../../data/gameData'
import { NO_TUNE } from '../../../engine/audio/music'
import {
  CELL, MAP_CROP, MAP_SCALE, areaTimeOf, cellRect, dungeonCenter, livesAnywhere, nextTime, spotsFor,
} from './areaMath'
import {
  LOOP_COOLDOWN_MS, PITCH_LOW, markerOf, nudgeTune, playAction, pointTune,
} from './cryTune'
import {
  PAGE_AREA, PAGE_CRY, PAGE_FORMS, PAGE_INFO, PAGE_KEYS, PAGE_SIZE, PAGE_TEXT_FIRST, keepPage, openPages, pageLabel,
} from './dexPages'
import { DEX_LINE } from './dexText'
import { formLine, formName } from './formNames'
import { gridX, gridY } from '../../../engine/map/townMap'

const DATA = resolve(__dirname, '../../../../public/data')
const read = <T>(path: string): T | null => {
  const file = resolve(DATA, path)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null
}
const bank = read<string[]>('dialogue/ko/697.json')

describe('쪽 열림 규칙 (`ov21_021E29DC.c:541-555`)', () => {
  it('쪽 다섯의 차례는 설명 · 분포 · 울음소리 · 크기 · 모습이다', () => {
    expect([PAGE_INFO, PAGE_AREA, PAGE_CRY, PAGE_SIZE, PAGE_FORMS]).toEqual([0, 1, 2, 3, 4])
    expect(PAGE_KEYS).toHaveLength(5)
  })

  it('안 본 칸은 설명뿐이다 — 「?」', () => {
    expect(openPages({ seen: false, caught: false, forms: 1 })).toEqual([PAGE_INFO])
  })

  it('본 종은 분포 · 울음소리가 열리고 **크기는 닫힌다**', () => {
    expect(openPages({ seen: true, caught: false, forms: 1 })).toEqual([PAGE_INFO, PAGE_AREA, PAGE_CRY])
  })

  it('잡은 종은 크기까지 열린다', () => {
    expect(openPages({ seen: true, caught: true, forms: 1 })).toEqual([PAGE_INFO, PAGE_AREA, PAGE_CRY, PAGE_SIZE])
  })

  it('모습이 둘 이상인 본 종은 모습이 열린다 — 잡지 않아도', () => {
    expect(openPages({ seen: true, caught: false, forms: 28 })).toEqual([PAGE_INFO, PAGE_AREA, PAGE_CRY, PAGE_FORMS])
    expect(openPages({ seen: true, caught: true, forms: 2 })).toEqual([0, 1, 2, 3, 4])
  })

  it('크기 표가 안 왔으면 잡은 종도 크기가 닫힌다 — 빈 쪽을 열지 않는다', () => {
    expect(openPages({ seen: true, caught: true, forms: 1, sized: false })).toEqual([0, 1, 2])
  })

  it('종을 넘겨 지금 쪽이 닫히면 설명으로 돌아간다', () => {
    expect(keepPage(PAGE_SIZE, [0, 1, 2])).toBe(PAGE_INFO)
    expect(keepPage(PAGE_CRY, [0, 1, 2])).toBe(PAGE_CRY)
  })

  it.runIf(bank)('쪽 이름은 롬 102~106이다', () => {
    expect(PAGE_TEXT_FIRST).toBe(102)
    expect(PAGE_KEYS.map((_, i) => pageLabel(i, bank!))).toEqual(['설명', '분포', '울음소리', '크기', '모습'])
  })

  it('뱅크가 아직 안 왔으면 빈 글이다', () => {
    expect(pageLabel(0, [])).toBe('')
  })
})

describe('모습 이름 (`formmain.c`)', () => {
  it('종마다 롬의 다른 줄이다', () => {
    expect(formLine(412, 2)).toBe(19) // 도롱충이 슈레도롱
    expect(formLine(413, 0)).toBe(17) // 도롱마담 초목도롱
    expect(formLine(422, 1)).toBe(16) // 조개두 동쪽바다
    expect(formLine(386, 3)).toBe(114) // 테오키스 스피드폼
    expect(formLine(492, 1)).toBe(116) // 쉐이미 스카이폼
    expect(formLine(487, 1)).toBe(118) // 기라티나 오리진폼
    expect(formLine(479, 5)).toBe(124) // 로토무 커트
  })

  it('안농 스물여덟은 다 같은 한 줄이다', () => {
    expect(formLine(201, 0)).toBe(20)
    expect(formLine(201, 27)).toBe(20)
  })

  it('원작에도 이름이 없는 종(캐스퐁 · 벚꼬리 · 아르세우스)은 지어 붙이지 않는다', () => {
    expect(formLine(351, 1)).toBeNull()
    expect(formLine(421, 1)).toBeNull()
    expect(formLine(493, 5)).toBeNull()
    expect(formName(493, 5, new Array<string>(130).fill('x'))).toBe('')
  })

  it.runIf(bank)('롬 글로 읽는다', () => {
    expect(formName(412, 0, bank!)).toBe('초목도롱')
    expect(formName(386, 1, bank!)).toBe('어택폼')
    expect(formName(487, 0, bank!)).toBe('어나더폼')
    expect(formName(479, 0, bank!)).toBe('로토무')
    expect(formName(479, 1, bank!)).toBe('히트로토무')
    expect(formName(201, 4, bank!)).toBe('형태별 모습')
  })
})

describe('울음 볼 판 (`crysub.c`)', () => {
  it('높낮이는 두 자리뿐이다: 위쪽 보통(0), 아래쪽 두 옥타브 아래(−1536)', () => {
    expect(PITCH_LOW).toBe(-1536)
    expect(nudgeTune(NO_TUNE, 'chorus', 0, 1).pitch).toBe(-1536)
    expect(nudgeTune({ ...NO_TUNE, pitch: -1536 }, 'chorus', 0, -1).pitch).toBe(0)
  })

  it('코러스 모드의 가로는 코러스 음량 0~127이고 좌우는 건드리지 않는다', () => {
    const t = nudgeTune(NO_TUNE, 'chorus', 1, 0)
    expect(t.echo).toBe(16)
    expect(t.pan).toBe(0)
    expect(nudgeTune({ ...NO_TUNE, echo: 120 }, 'chorus', 1, 0).echo).toBe(127)
    expect(nudgeTune(NO_TUNE, 'chorus', -1, 0).echo).toBe(0)
  })

  it('팬 모드의 가로는 좌우 −127~127이고 코러스는 건드리지 않는다', () => {
    const t = nudgeTune(NO_TUNE, 'pan', -1, 0)
    expect(t.pan).toBe(-32)
    expect(t.echo).toBe(0)
    expect(nudgeTune({ ...NO_TUNE, pan: 120 }, 'pan', 1, 0).pan).toBe(127)
  })

  it('판의 한 점: 가로가 음량 또는 좌우고 세로 아래 반이 낮은 높낮이다', () => {
    expect(pointTune(NO_TUNE, 'chorus', 1, 0.2)).toEqual({ pitch: 0, pan: 0, echo: 127 })
    expect(pointTune(NO_TUNE, 'pan', 0, 0.8)).toEqual({ pitch: -1536, pan: -127, echo: 0 })
    expect(pointTune(NO_TUNE, 'pan', 0.5, 0.2).pan).toBe(0)
    expect(pointTune(NO_TUNE, 'chorus', 3, 0).echo).toBe(127)
  })

  it('볼의 자리는 조절값의 거울이다', () => {
    expect(markerOf(NO_TUNE, 'chorus')).toEqual({ x: 0, y: 0 })
    expect(markerOf({ pitch: -1536, pan: 127, echo: 0 }, 'pan')).toEqual({ x: 1, y: 1 })
    expect(markerOf({ pitch: 0, pan: 0, echo: 0 }, 'pan').x).toBeCloseTo(0.5, 6)
  })

  it('재생 단추: 반복이 꺼져 있으면 늘 새로 울고, 켜져 있으면 울리는 중일 때 끊는다 (`AdvancePlayButton`)', () => {
    expect(playAction(false, false)).toBe('play')
    expect(playAction(false, true)).toBe('play')
    expect(playAction(true, false)).toBe('play')
    expect(playAction(true, true)).toBe('stop')
  })

  it('반복은 60분의 1초 열 칸 쉬었다 다시 운다 (`CRY_COOLDOWN`)', () => {
    expect(LOOP_COOLDOWN_MS).toBe(167)
  })
})

describe('분포 — 타운맵 그림 위의 칸', () => {
  /** 들판 하나: 가로 2 · 세로 1 = 비트 [1,1] (x가 세로 줄, y가 가로 칸) */
  const habitat = {
    dungeons: [{ x: 5, y: 22, mtCoronet: false }, { x: 7, y: 23, mtCoronet: false }],
    fields: [
      { x: 22, y: 1, width: 2, height: 1, cells: [1, 1, ...new Array<number>(30).fill(0)] },
      { x: 10, y: 3, width: 1, height: 1, cells: [1, ...new Array<number>(31).fill(0)] },
    ],
    species: {
      '25': {
        fieldMorning: [0], fieldNight: [1], dungeonDay: [0], dungeonSpecialNational: [1],
      },
    },
  } as unknown as PokedexHabitat

  it('⚠️ 들판의 `x`는 세로 줄이고 `y`가 가로 칸이다 — 열 우선 비트열 (`LocateFieldOnMap`)', () => {
    const s = spotsFor(habitat, 25, 0, false)
    // 들판 0: x=22(세로 줄) · y=1(가로 칸), 폭 2 높이 1 → 세로 줄 22 · 23, 가로 칸 1
    expect(s.cells).toEqual([{ col: 1, row: 22 }, { col: 1, row: 23 }])
  })

  it('시간대마다 다른 들판이 선다 — 밤에는 아침 칸이 없다', () => {
    expect(spotsFor(habitat, 25, 0, false).cells).toHaveLength(2)
    expect(spotsFor(habitat, 25, 2, false).cells).toEqual([{ col: 3, row: 10 }])
    expect(spotsFor(habitat, 25, 1, false).cells).toHaveLength(0)
  })

  it('동굴은 던전 좌표 그대로다 (가로 x · 세로 y). 전국 특별은 전국도감을 받은 뒤에만 든다', () => {
    expect(spotsFor(habitat, 25, 1, false).dungeons).toEqual([{ x: 5, y: 22 }])
    expect(spotsFor(habitat, 25, 1, true).dungeons).toEqual([{ x: 5, y: 22 }, { x: 7, y: 23 }])
  })

  it('표에 없는 종 · 표가 없으면 비었다 — 「서식지 불명」', () => {
    expect(spotsFor(habitat, 1, 0, false)).toEqual({ cells: [], dungeons: [] })
    expect(spotsFor(null, 25, 0, false)).toEqual({ cells: [], dungeons: [] })
    expect(livesAnywhere(habitat, 1, true)).toBe(false)
    expect(livesAnywhere(habitat, 25, false)).toBe(true)
  })

  it('칸은 타운맵 격자(7px)를 정수 2배로 옮긴다', () => {
    expect(CELL).toBe(7)
    expect(MAP_SCALE).toBe(2)
    const r = cellRect({ col: 5, row: 22 })
    expect(r).toEqual({
      left: (gridX(5) - MAP_CROP.x) * 2, top: (gridY(22) - MAP_CROP.y) * 2, size: 14,
    })
    const c = dungeonCenter({ x: 5, y: 22 })
    expect(c).toEqual({ cx: r.left + 7, cy: r.top + 7 })
  })

  it('지도로 자른 곳은 칸이 있는 곳을 다 품는다', () => {
    // 칸이 있는 가장 바깥은 좌 x=1 · 우 x=28 · 위 z=6 · 아래 z=28 (townMap.json 실측)
    for (const col of [1, 28]) {
      const r = cellRect({ col, row: 6 })
      expect(r.left).toBeGreaterThanOrEqual(0)
      expect(r.left + r.size).toBeLessThanOrEqual(MAP_CROP.w * MAP_SCALE)
    }
    const bottom = cellRect({ col: 1, row: 28 })
    expect(bottom.top + bottom.size).toBeLessThanOrEqual(MAP_CROP.h * MAP_SCALE)
  })

  it('시간대는 아침 → 낮 → 밤으로 돈다. 해질녘은 낮으로, 심야는 밤으로 센다', () => {
    expect(nextTime(0)).toBe(1)
    expect(nextTime(1)).toBe(2)
    expect(nextTime(2)).toBe(0)
    expect([0, 1, 2, 3, 4].map(areaTimeOf)).toEqual([0, 1, 1, 2, 2])
  })
})

describe('분포 — 실제 자료와 타운맵이 같은 좌표계다', () => {
  const hab = read<PokedexHabitat>('pokedexHabitat.json')
  const town = read<{ cells: { x: number, z: number }[] }>('townMap.json')

  it.runIf(hab && town)('들판 칸의 거의 전부가 타운맵 칸 위에 떨어진다 (실측 123/124)', () => {
    const on = new Set(town!.cells.map((c) => `${String(c.x)},${String(c.z)}`))
    let total = 0, hit = 0
    for (const f of hab!.fields) {
      for (let x = 0; x < f.width; x++) {
        for (let y = 0; y < f.height; y++) {
          if (!f.cells[x * f.height + y]) continue
          total++
          if (on.has(`${String(f.y + y)},${String(f.x + x)}`)) hit++
        }
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(hit / total).toBeGreaterThan(0.97)
  })

  it.runIf(hab && town)('지도로 자른 곳 안에 모든 타운맵 칸이 든다', () => {
    for (const c of town!.cells) {
      const r = cellRect({ col: c.x, row: c.z })
      expect(r.left, `칸 ${String(c.x)},${String(c.z)}`).toBeGreaterThanOrEqual(0)
      expect(r.top).toBeGreaterThanOrEqual(0)
      expect(r.left + r.size).toBeLessThanOrEqual(MAP_CROP.w * MAP_SCALE)
      expect(r.top + r.size).toBeLessThanOrEqual(MAP_CROP.h * MAP_SCALE)
    }
  })
})

describe('롬 줄 번호 (도감 뱅크 697)', () => {
  it.runIf(bank)('쓰는 줄이 그 글이다', () => {
    const b = bank!
    expect(b[DEX_LINE.areaUnknown]).toBe('서식지 불명')
    expect([0, 1, 2].map((i) => b[DEX_LINE.timeFirst + i])).toEqual(['아침', '낮', '밤'])
    expect(b[DEX_LINE.chorus]).toBe('코러스')
    expect(b[DEX_LINE.pan]).toBe('팬')
    expect(b[DEX_LINE.heightCheck]).toBe('키 비교')
    expect(b[DEX_LINE.weightCheck]).toBe('몸무게 비교')
    expect([DEX_LINE.searchName, DEX_LINE.searchType, DEX_LINE.searchForm, DEX_LINE.searchOrder].map((i) => b[i]))
      .toEqual(['이름', '타입', '형태', '순서'])
    expect(b[DEX_LINE.none]).toBe('-')
    expect(b[DEX_LINE.noResult]).toBe('조건을 충족하는 포켓몬이\n발견되지 않았습니다...')
    expect(b[DEX_LINE.lucasHeight]).toBe('1.45m')
    expect(b[DEX_LINE.dawnHeight]).toBe('1.4m')
    expect(b[DEX_LINE.lucasWeight]).toBe('38.0kg')
    expect(b[DEX_LINE.dawnWeight]).toBe('34.0kg')
    expect(b[DEX_LINE.blank]).toBe('-----')
    expect(b[DEX_LINE.found]).toBe('발견한 수')
  })
})
