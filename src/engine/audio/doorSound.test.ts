// 문 종류별 소리 — 원작 `ov5_021D431C.c`의 갈래와 같은가
import { describe, expect, it } from 'vitest'
import { doorCloseSe, doorOpenSe } from './doorSound'
import { SFX } from './sfx'
import { DOOR_KIND } from '../../import/platinum/propAnims'

describe('문 소리', () => {
  it('열 때: 미닫이 DOOR10 · 상점 문 PL_DOOR_OPEN5 · 나머지 DOOR_OPEN', () => {
    expect(doorOpenSe('sliding')).toBe(1544)
    expect(doorOpenSe('chime')).toBe(1492)
    expect(doorOpenSe('hinged')).toBe(SFX.DOOR)
    expect(doorOpenSe(undefined)).toBe(1541)
  })

  it('닫을 때: 미닫이와 상점 문은 소리가 없고 나머지는 DOOR_CLOSE2', () => {
    expect(doorCloseSe('sliding')).toBeNull()
    expect(doorCloseSe('chime')).toBeNull()
    expect(doorCloseSe('hinged')).toBe(1543)
    expect(doorCloseSe(undefined)).toBe(1543)
  })

  it('원작의 미닫이 여섯과 상점 문 하나가 문 표와 같다', () => {
    // pokecenter · gym · gts_inside · pokecenter_inside · card · elevator (`DoorAnimation_GetSoundEffectType`)
    const sliding = Object.entries(DOOR_KIND).filter(([, k]) => k === 'sliding').map(([m]) => Number(m)).sort((a, b) => a - b)
    expect(sliding).toEqual([70, 75, 298, 427, 456, 484])
    const chime = Object.entries(DOOR_KIND).filter(([, k]) => k === 'chime').map(([m]) => Number(m))
    expect(chime).toEqual([442])
  })
})
