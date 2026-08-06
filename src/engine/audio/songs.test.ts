// 곡 번호가 지어낸 것이 아님을 못 박는다 (DATA.md §2.18)
//
// 배틀 곡 번호를 처음에 1120·1121로 적었다가 잡았다 — 그 둘은 아카기와
// 디아루가·펄기아라서 야생 포켓몬이 나올 때마다 보스 곡이 흐를 뻔했다.
// 이름을 안 보고 번호를 적으면 그런 일이 난다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TRAINER_BATTLE, WILD_BATTLE, songForMap, wildSongFor } from './songs'
import { SFX } from './sfx'
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

maybe('야생 곡은 누가 나왔는지가 정한다', () => {
  /** 번호가 실재하는 곡을 가리키는지 SDAT 이름으로 확인한다 */
  const nameOf = (song: number): string | null => index().songs[song]?.name ?? null

  it('평범한 야생은 야생 곡이다', () => {
    expect(wildSongFor(387, 0)).toBe(WILD_BATTLE) // 모부기
    expect(wildSongFor(25, 0)).toBe(WILD_BATTLE) // 피카츄
  })

  it('기라티나는 플래티넘 전용 곡이다', () => {
    // 디컴프는 `SEQ_BATTLE_GIRATINA`, SDAT는 `SEQ_PL_BA_GIRA` — 같은 자리다
    expect(nameOf(wildSongFor(487, 0))).toBe('SEQ_PL_BA_GIRA')
  })

  it('디아루가·펄기아가 같은 곡을 쓴다', () => {
    expect(wildSongFor(484, 0)).toBe(wildSongFor(483, 0))
    expect(nameOf(wildSongFor(483, 0))).toBe('SEQ_BA_DPOKE2')
  })

  it('호수 셋이 같은 곡을 쓴다 — 유크시·엠라이트·아그놈', () => {
    expect(nameOf(wildSongFor(480, 0))).toBe('SEQ_BA_DPOKE1')
    expect(wildSongFor(481, 0)).toBe(wildSongFor(480, 0))
    expect(wildSongFor(482, 0)).toBe(wildSongFor(480, 0))
  })

  it('⚠️ 쉐이미와 크레세리아는 전설인데도 야생 곡이다', () => {
    // 연출만 특별하고 곡은 `SEQ_BATTLE_WILD_POKEMON`이다. "전설이면 특별한 곡"으로
    // 짐작하면 여기서 틀린다 (`enc_effects.c`의 ENCEFF_SHAYMIN·ENCEFF_CRESSELIA)
    expect(wildSongFor(492, 0)).toBe(WILD_BATTLE)
    expect(wildSongFor(488, 0)).toBe(WILD_BATTLE)
  })

  it('레지 삼형제와 관동 새 셋은 파크에서만 평범해진다', () => {
    const PAL_PARK = 251
    expect(nameOf(wildSongFor(377, 0))).toBe('SEQ_PL_BA_REGI')
    expect(wildSongFor(377, PAL_PARK)).toBe(WILD_BATTLE)
    expect(nameOf(wildSongFor(144, 0))).toBe('SEQ_BA_SECRET2')
    expect(wildSongFor(144, PAL_PARK)).toBe(WILD_BATTLE)
    // 그런데 기라티나는 파크에서도 전용 곡이다 — 조건이 붙은 것은 이 여섯뿐이다
    expect(nameOf(wildSongFor(487, PAL_PARK))).toBe('SEQ_PL_BA_GIRA')
  })
})

maybe('배틀 효과음', () => {
  it('타격음 셋이 서로 다른 소리다', () => {
    const songs = index().songs
    expect(songs[SFX.HIT_SUPER]?.name).toBe('SEQ_SE_DP_KOUKA_H')
    expect(songs[SFX.HIT_WEAK]?.name).toBe('SEQ_SE_DP_KOUKA_L')
    expect(songs[SFX.HIT_NORMAL]?.name).toBe('SEQ_SE_DP_KOUKA_M')
    expect(new Set([SFX.HIT_SUPER, SFX.HIT_WEAK, SFX.HIT_NORMAL]).size).toBe(3)
  })

  it('등장·도망·포획이 제 소리를 집는다', () => {
    const songs = index().songs
    expect(songs[SFX.SEND_OUT]?.name).toBe('SEQ_SE_DP_BOWA2')
    expect(songs[SFX.FLEE]?.name).toBe('SEQ_SE_DP_NIGERU')
    expect(songs[SFX.CAUGHT]?.name).toBe('SEQ_SE_DP_GETTING')
    expect(songs[SFX.BALL_SHAKE]?.name).toBe('SEQ_SE_DP_KON')
  })

  it('전부 실재하는 곡이다 — 없는 번호를 적으면 조용히 아무 소리도 안 난다', () => {
    const songs = index().songs
    for (const [name, id] of Object.entries(SFX)) {
      expect(songs[id], `${name}(${String(id)})`).toBeTruthy()
    }
  })
})
