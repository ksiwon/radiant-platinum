import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deferredFacilityNotice, deferredScriptNotice } from './frontierGate'

const HEADERS = 'raw/decomp/generated/map_headers.txt'

describe('차후 업데이트까지 막는 시설 넷', () => {
  it('타워 · 스테이지 · 캐슬 · 룰렛만 막고 팩토리와 프런티어 바깥은 연다', () => {
    expect([326, 563, 564, 565].every((m) => deferredFacilityNotice(m, 'ko') !== null)).toBe(true)
    expect(deferredFacilityNotice(562, 'ko')).toBeNull()
    expect(deferredFacilityNotice(559, 'ko')).toBeNull()
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

const FRONTIER_SCRIPTS = 'raw/decomp/res/field/scripts/scripts_battle_frontier.s'
const FRONTIER_EVENTS = 'raw/decomp/res/field/events/events_battle_frontier.json'

describe('프런티어 좌표 사건 — 문 옆 칸에서 스크립트 Warp로 들어가는 길', () => {
  it('559의 34 · 35 · 36은 문 앞 안내와 같은 글로 막고 팩토리(37)와 다른 맵은 연다', () => {
    expect(deferredScriptNotice(559, 34, 'ko')).toBe(deferredFacilityNotice(563, 'ko'))
    expect(deferredScriptNotice(559, 35, 'en')).toBe(deferredFacilityNotice(564, 'en'))
    expect(deferredScriptNotice(559, 36, 'ja')).toBe(deferredFacilityNotice(565, 'ja'))
    expect(deferredScriptNotice(559, 37, 'ko')).toBeNull()
    expect(deferredScriptNotice(559, 33, 'ko')).toBeNull()
    expect(deferredScriptNotice(560, 34, 'ko')).toBeNull()
  })

  it.runIf(existsSync(FRONTIER_SCRIPTS) && existsSync(FRONTIER_EVENTS))('34 · 35 · 36이 563 · 564 · 565로 Warp하고 37이 팩토리로 간다', () => {
    const events = JSON.parse(readFileSync(FRONTIER_EVENTS, 'utf8')) as { coord_events: { script: number; x: number; z: number }[] }
    const at = (script: number): [number, number] | undefined => {
      const e = events.coord_events.find((c) => c.script === script)
      return e === undefined ? undefined : [e.x, e.z]
    }
    expect(at(34)).toEqual([22, 34])
    expect(at(35)).toEqual([35, 62])
    expect(at(36)).toEqual([61, 62])
    expect(at(37)).toEqual([74, 34])
    const s = readFileSync(FRONTIER_SCRIPTS, 'utf8')
    for (const [label, header] of [['EnterBattleHall', 'BATTLE_HALL'], ['EnterBattleCastle', 'BATTLE_CASTLE'], ['EnterBattleArcade', 'BATTLE_ARCADE'], ['EnterBattleFactory', 'BATTLE_FACTORY']] as const) {
      const body = s.slice(s.indexOf(`BattleFrontier_CoordEvent_${label}:`))
      expect(body.slice(0, body.indexOf('End')), label).toContain(`Warp MAP_HEADER_${header},`)
    }
  })
})

const SCRATCH_SCRIPT = 'raw/decomp/res/field/scripts/scripts_scratch_off_cards.s'

describe('막아 둔 롬 스크립트 — 스크래치 카드 접수원', () => {
  it('559의 10490만 막고 안내는 롬 표기 이름을 쓴다', () => {
    expect(deferredScriptNotice(559, 10490, 'ko')).toBe('스크래치 카드는 아직 준비 중이다.\r차후 업데이트에서 이용할 수 있다!')
    expect(deferredScriptNotice(559, 10490, 'en')?.startsWith("The Scratch-Off Cards aren't ready yet.")).toBe(true)
    expect(deferredScriptNotice(559, 10490, 'ja')?.startsWith('スクラッチカ－ドは')).toBe(true)
    expect(deferredScriptNotice(560, 10490, 'ko')).toBeNull()
  })

  it.runIf(existsSync(SCRATCH_SCRIPT))('그 스크립트는 BP를 먼저 떼고 앱을 부른다', () => {
    const s = readFileSync(SCRATCH_SCRIPT, 'utf8')
    expect(s.indexOf('RemoveBattlePoints 1')).toBeGreaterThan(0)
    expect(s.indexOf('RemoveBattlePoints 1')).toBeLessThan(s.indexOf('ScrCmd_2E2'))
  })
})
