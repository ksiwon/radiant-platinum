import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deferredFacilityNotice, deferredScriptNotice, isDeferredFacility } from './frontierGate'

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

const BINOCULAR_SCRIPT_FILE = 'raw/decomp/res/field/scripts/scripts_pastoria_city_observatory_gate_2f.s'
const BINOCULAR_EVENTS = 'raw/decomp/res/field/events/events_pastoria_city_observatory_gate_2f.json'

describe('막아 둔 롬 스크립트 — 대습초원 전망대 망원경', () => {
  it('전망대 게이트 2F(126)의 1번 스크립트만 막는다', () => {
    expect(deferredScriptNotice(126, 1, 'ko')).toBe('망원경은 아직 준비 중이다.\r차후 업데이트에서 들여다볼 수 있다!')
    expect(deferredScriptNotice(126, 1, 'en')).toBe("The binoculars aren't ready yet.\rThey'll work in a future update.")
    expect(deferredScriptNotice(126, 1, 'ja')?.startsWith('ぼうえんきょうは')).toBe(true)
    // 같은 방의 사람 넷 · 1층 · 다른 맵의 1번은 그대로 돈다
    for (const script of [2, 3, 4, 5]) expect(deferredScriptNotice(126, script, 'ko')).toBeNull()
    expect(deferredScriptNotice(125, 1, 'ko')).toBeNull()
    expect(deferredScriptNotice(326, 1, 'ko')).toBeNull()
  })

  it.runIf(existsSync(HEADERS))('126이 전망대 게이트 2F다', () => {
    const names = readFileSync(HEADERS, 'utf8').split(/\r?\n/)
    expect(names[126]).toBe('MAP_HEADER_PASTORIA_CITY_OBSERVATORY_GATE_2F')
  })

  it.runIf(existsSync(BINOCULAR_SCRIPT_FILE) && existsSync(BINOCULAR_EVENTS))('1번이 망원경이고, 그 스크립트는 전망보다 돈을 먼저 받는다', () => {
    const s = readFileSync(BINOCULAR_SCRIPT_FILE, 'utf8')
    const entries = [...s.matchAll(/^\s*ScriptEntry (\w+)\s*$/gm)].map((m) => m[1])
    expect(entries[0]).toBe('PastoriaCityObservatoryGate2F_Binocular')
    // 막는 자리가 명령이 아니라 스크립트 시작이어야 하는 까닭
    expect(s.indexOf('RemoveMoney 100')).toBeGreaterThan(0)
    expect(s.indexOf('RemoveMoney 100')).toBeLessThan(s.indexOf('StartGreatMarshLookout'))
    // 망원경 셋이 전부 그 스크립트를 부른다
    const events = JSON.parse(readFileSync(BINOCULAR_EVENTS, 'utf8')) as { bg_events: { script: number }[] }
    expect(events.bg_events.map((e) => e.script)).toEqual([1, 1, 1])
  })
})
