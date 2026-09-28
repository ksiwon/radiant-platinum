import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deferredFacilityNotice, isDeferredFacility } from './frontierGate'

const HEADERS = 'raw/decomp/generated/map_headers.txt'

describe('차후 업데이트까지 막는 시설 넷', () => {
  it('타워 · 스테이지 · 캐슬 · 룰렛만 막고 팩토리와 프런티어 바깥은 연다', () => {
    expect([326, 563, 564, 565].every(isDeferredFacility)).toBe(true)
    expect(isDeferredFacility(562)).toBe(false)
    expect(isDeferredFacility(559)).toBe(false)
  })

  it('안내 — 한국어 조사가 받침을 따른다', () => {
    expect(deferredFacilityNotice(326, 'ko')).toBe('배틀타워는 아직 준비 중이다.\r차후 업데이트에서 문을 연다!')
    expect(deferredFacilityNotice(564, 'ko')?.startsWith('배틀캐슬은 ')).toBe(true)
    expect(deferredFacilityNotice(565, 'ko')?.startsWith('배틀룰렛은 ')).toBe(true)
    expect(deferredFacilityNotice(563, 'ko')?.startsWith('배틀스테이지는 ')).toBe(true)
    expect(deferredFacilityNotice(563, 'en')?.startsWith('The Battle Hall ')).toBe(true)
    expect(deferredFacilityNotice(565, 'ja')?.startsWith('バトルル－レットは')).toBe(true)
    expect(deferredFacilityNotice(562, 'ko')).toBeNull()
  })

  it.runIf(existsSync(HEADERS))('맵 번호가 헤더 차례와 같다', () => {
    const names = readFileSync(HEADERS, 'utf8').split(/\r?\n/)
    expect(names[326]).toBe('MAP_HEADER_BATTLE_TOWER')
    expect(names[563]).toBe('MAP_HEADER_BATTLE_HALL')
    expect(names[564]).toBe('MAP_HEADER_BATTLE_CASTLE')
    expect(names[565]).toBe('MAP_HEADER_BATTLE_ARCADE')
    expect(names[562]).toBe('MAP_HEADER_BATTLE_FACTORY')
  })
})
