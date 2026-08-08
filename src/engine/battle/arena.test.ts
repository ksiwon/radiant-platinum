// 무대 고르기 검증 (DATA.md §7.4)
//
// 여기서 지키는 것은 **어느 맵에서 싸워도 설 무대가 있다**는 것 하나다. 표에
// 구멍이 하나 있으면 그 배경을 쓰는 맵 수십 곳에서 배틀이 빈 땅 위에 열린다 —
// 그 맵에 실제로 들어가 보기 전에는 아무도 모른다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ARENA, EVERY_ARENA, arenaFor, cameraFit, hasSky } from './arena'
import { SHOT_REACH } from './shots'
import type { MapHeader } from '../map/world'
import { withData } from '../../data/romData.testkit'

const header = (battleBg: number, name = ''): MapHeader =>
  ({ battleBg, name } as MapHeader)

describe('배틀 무대 고르기', () => {
  it('파도타기 중이면 맵을 안 보고 바다가 선다', () => {
    // 원작 `SetBackgroundAndTerrain`이 그렇게 한다 — 물 위에서 싸우는데
    // 굴이나 방이 깔리면 안 된다
    for (const bg of [6, 9, 17]) {
      expect(arenaFor(header(bg), true).caption).toBe('淡水')
    }
    expect(arenaFor(header(1), true).caption).toBe('海水')
    expect(arenaFor(header(9), false).caption).toBe('洞窟')
  })

  it('맵이 없어도 서기는 선다', () => {
    expect(arenaFor(null, false)).toBe(ARENA[0])
    expect(arenaFor(header(999), false)).toBe(ARENA[0])
  })

  it('좁은 무대에서는 카메라를 당긴다', () => {
    // 실내 방(반지름 6m)은 조금 당기고, 넓은 들판은 그대로
    const room = ARENA.find((a) => a.radius === 6)!
    const field = ARENA[0]!
    expect(cameraFit(room)).toBeCloseTo(0.88, 2)
    expect(cameraFit(field)).toBe(1)
    // 당긴 뒤 카메라가 무대 안에 들어와야 의미가 있다
    expect(SHOT_REACH * cameraFit(room)).toBeLessThan(room.radius)
    // 굴(10m)과 들판은 안 당기거나 거의 안 당긴다 — BDSP 리그가 5.68m라 넉넉하다
    expect(cameraFit({ ...field, radius: 10 })).toBe(1)
  })

  it('큰 종 앞에서는 물러난다 — 벽이 없을 때만', () => {
    const field = ARENA[0]!
    const room = ARENA.find((a) => a.radius === 6)!
    // 화면에 서는 키의 중앙값이 1.17이다. 1.2까지는 기본 샷이 담는다
    expect(cameraFit(field, 0.79)).toBe(1)   // 모부기
    expect(cameraFit(field, 1.5)).toBeCloseTo(1.25, 3)   // 잉어킹쯤
    // 토대부기(1.89)는 이미 한계에 닿는다
    // ⚠️ BDSP의 두 번째 리그(8.63m = 1.52배)까지만 물러난다
    for (const tall of [1.89, 7.31]) {
      expect(cameraFit({ ...field, radius: 24 }, tall)).toBeCloseTo(8.63 / SHOT_REACH, 5)
    }
    // 방에서는 벽이 이긴다 — 물러날 데가 없으면 잘리는 편이 벽을 뚫는 것보다 낫다
    expect(cameraFit(room, 7.31)).toBeCloseTo(0.88, 2)
  })

  it('밟고 선 땅이 배경을 이긴다', () => {
    // 원작 `CalcTerrain`이 맵보다 발밑을 먼저 본다. 대습원이 그 자리다 —
    // 배경은 숲(3)인데 진흙(0xa6)을 밟고 싸우므로 늪이 서야 맞다
    expect(arenaFor(header(3), false, 0xa6).caption).toBe('沼地')
    expect(arenaFor(header(3), false, null).caption).toBe('森')
    // 모래(0x21)와 얼음(0x20)도 BDSP에 그 땅의 무대가 있다
    expect(arenaFor(header(0), false, 0x21).caption).toBe('砂浜')
    expect(arenaFor(header(10), false, 0x20).caption).toBe('キッサキしんでん')
    // 풀숲은 안 바꾼다 — 배경이 이미 그 그림을 세우고 있다
    expect(arenaFor(header(3), false, 0x02).caption).toBe('森')
  })

  it('체육관 여덟은 저마다 다른 무대다', () => {
    // 원작은 여덟을 `INDOORS_1` 하나로 묶었지만 BDSP는 따로 만들어 두었다
    const gyms = ['C02GYM0101', 'C03GYM0101', 'C04GYM0101', 'C05GYM0101',
      'C06GYM0101', 'C07GYM0101', 'C08GYM0101', 'C09GYM0101']
    const files = gyms.map((n) => arenaFor(header(6, n), false).file)
    expect(new Set(files).size).toBe(8)
    expect(arenaFor(header(6, 'C03GYM0101'), false).caption).toContain('クロガネ')
    // 축복시티에는 체육관이 없다. 그 자리는 실내 기본값이다
    expect(arenaFor(header(6, 'C01GYM0101'), false).caption).toBe('室内_木目')
    // 로스트타워 다섯 층
    expect(arenaFor(header(8, 'R209R0103'), false).caption).toBe('ロストタワー')
  })

  it('물은 바다와 민물로 갈린다', () => {
    // 원작이 바다 수로 여섯 곳만 `BACKGROUND_WATER`로 찍어 두었다
    expect(arenaFor(header(1), true).caption).toBe('海水')
    expect(arenaFor(header(0), true).caption).toBe('淡水')
  })

  it('하늘은 야외에만 선다', () => {
    // 굴·실내는 BDSP도 `s006`(하늘 없음)을 얹는다
    expect(hasSky(ARENA[0]!)).toBe(true)
    expect(hasSky(ARENA[9]!)).toBe(false)
    expect(ARENA.filter(hasSky)).toHaveLength(7)
  })
})

const maybe = withData('maps.json')

maybe('무대 표가 롬을 다 덮는다', () => {
  interface Maps { maps: { battleBg: number }[] }
  const rows = (JSON.parse(
    readFileSync(resolve(__dirname, '../../../public/data/maps.json'), 'utf8'),
  ) as Maps).maps

  it('593개 맵이 쓰는 배경 열여덟 가지가 모두 표에 있다', () => {
    const used = new Set(rows.map((m) => m.battleBg))
    expect(rows).toHaveLength(593)
    expect([...used].sort((a, b) => a - b)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    )
    for (const bg of used) {
      expect(ARENA[bg], `배경 ${String(bg)}`).toBeDefined()
    }
  })

  it('표가 가리키는 glb가 실제로 있다', () => {
    // `public/models`는 리포에 안 들어가므로(§14.1) 없으면 건너뛴다.
    // 있는데 이름이 틀렸으면 배틀이 열리다 멈춘다
    const dir = resolve(__dirname, '../../../public/models/arena')
    if (!existsSync(dir)) return
    for (const a of EVERY_ARENA) {
      expect(existsSync(resolve(dir, a.file)), a.file).toBe(true)
    }
  })
})
