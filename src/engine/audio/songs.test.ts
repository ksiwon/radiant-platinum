// 곡 번호가 지어낸 것이 아님을 못 박는다 (DATA.md §2.18)
//
// 배틀 곡 번호를 처음에 1120·1121로 적었다가 잡았다 — 그 둘은 아카기와
// 디아루가·펄기아라서 야생 포켓몬이 나올 때마다 보스 곡이 흐를 뻔했다.
// 이름을 안 보고 번호를 적으면 그런 일이 난다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TRAINER_BATTLE, WILD_BATTLE, songForMap } from './songs'
import { TimeOfDay, timeOfDayForHour } from '../map/timeOfDay'
import { world, type MapHeader } from '../map/world'

const ROOT = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(ROOT, 'sound/index.json')) && existsSync(resolve(ROOT, 'maps.json'))
const maybe = present ? describe : describe.skip

interface Index { songs: ({ name: string | null } | null)[] }
const index = (): Index =>
  JSON.parse(readFileSync(resolve(ROOT, 'sound/index.json'), 'utf8')) as Index
const maps = (): { maps: MapHeader[] } =>
  JSON.parse(readFileSync(resolve(ROOT, 'maps.json'), 'utf8')) as { maps: MapHeader[] }

maybe('배틀 곡', () => {
  it('1116이 야생, 1119가 트레이너다', () => {
    const songs = index().songs
    expect(songs[WILD_BATTLE]?.name).toBe('SEQ_BA_POKE')
    expect(songs[TRAINER_BATTLE]?.name).toBe('SEQ_BA_TRAIN')
  })

  it('보스 곡이 아니다', () => {
    // 1120·1121은 아카기와 디아루가·펄기아다. 여기 들어오면 안 된다
    const songs = index().songs
    expect(songs[1120]?.name).toBe('SEQ_BA_AKAGI')
    expect(songs[1121]?.name).toBe('SEQ_BA_DPOKE2')
    expect(WILD_BATTLE).not.toBe(1120)
    expect(TRAINER_BATTLE).not.toBe(1121)
  })
})

maybe('맵 헤더의 BGM', () => {
  it('헤더가 내놓는 번호가 전부 실재하는 곡이다', () => {
    const songs = index().songs
    let found = 0
    const missing: number[] = []
    for (const h of maps().maps) {
      for (const id of [h.bgmDay, h.bgmNight]) {
        if (songs[id]) found++
        else missing.push(id)
      }
    }
    // 없는 번호가 하나라도 있으면 헤더를 잘못 읽었거나 곡 목록이 어긋난 것이다
    expect(missing).toEqual([])
    expect(found).toBe(1186)
  })

  it('떡잎마을이 낮엔 TOWN01_D, 밤엔 TOWN01_N이다', () => {
    const songs = index().songs
    world.maps = maps().maps
    const t01 = world.maps.find((m) => m.name === 'T01')
    expect(t01).toBeDefined()

    // 원작 표대로 14시는 낮, 22시는 밤이다
    expect(timeOfDayForHour(14)).toBe(TimeOfDay.DAY)
    expect(timeOfDayForHour(22)).toBe(TimeOfDay.NIGHT)
    expect(songs[songForMap(t01!.id, 14)!]?.name).toBe('SEQ_TOWN01_D')
    expect(songs[songForMap(t01!.id, 22)!]?.name).toBe('SEQ_TOWN01_N')

    // 해질녘(18시)은 낮 곡이고 심야(2시)는 밤 곡이다 — 헤더에 칸이 둘뿐이라서다
    expect(songForMap(t01!.id, 18)).toBe(t01!.bgmDay)
    expect(songForMap(t01!.id, 2)).toBe(t01!.bgmNight)
    world.maps = null
  })

  it('없는 맵이면 null이다', () => {
    world.maps = null
    expect(songForMap(9999, 12)).toBeNull()
  })
})
