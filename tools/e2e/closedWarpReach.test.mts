// 닫는 맵으로 가는 `Warp`의 출처 허용 목록 (PARITY §9 · 범위 밖 맵)
//
// 디컴프의 이동 명령(`Warp` · `WarpToColosseum` · `SetSpecialLocation` · `TakeShip*`)을 전부 거슬러 올라 이벤트(NPC · 간판 ·
// 좌표 사건 · 프레임 표)까지 잇고(`staticWarps.mjs`), 목적지가 **닫는 맵**인 사이트의 진입점을 추린다. 그 진입점이 아래
// 허용 목록 밖이면 시험이 선다 — 새 맵 · 새 스크립트가 닫는 맵으로 가는 길을 몰래 여는 것을 막는다.
//
// ⚠️ 허용 목록은 「막혀 있다」가 증명된 것만 올린다. 막는 방법은 갈래마다 다르다 — 각 줄의 이유를 읽는다.
// 새 줄을 더하기 전에 그 길이 정말 막혀 있는지(`start()`를 진짜로 몰아 워프 0인지) 먼저 잰다
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — tools/는 타입 검사 밖의 순수 JS다
import { buildStaticWarps } from './staticWarps.mjs'
import { deferredScriptNotice } from '../../src/engine/world/frontierGate'

const ROOT = resolve(import.meta.dirname, '../..')
const have = existsSync(resolve(ROOT, 'public/data/scripts.bin'))
  && existsSync(resolve(ROOT, 'public/data/events.json'))
  && existsSync(resolve(ROOT, 'raw/decomp/generated/map_headers.txt'))
  && existsSync(resolve(ROOT, 'raw/decomp/res/field/scripts'))

/**
 * 닫는 맵 — 범위 밖(콘테스트 · 통신 · 지하통로 · 리본신드롬)과 프런티어 넷, 이 맵들로 가는 길이 이 시험의 대상이다.
 * 326 타워 · 327~331 · 493 타워 안 · 563~565 스테이지 · 캐슬 · 룰렛 · 117 · 118 · 558 콘테스트 · 332 · 333 콜로세움 ·
 * 466 유니온룸 · 586 Wi-Fi 광장 · 251 · 393 팔파크 · 461~463 리본신드롬. (팩토리 562는 열린 시설이라 뺀다)
 */
const CLOSED = new Set([326, 327, 328, 329, 330, 331, 493, 563, 564, 565, 117, 118, 558, 332, 333, 466, 586, 251, 393, 461, 462, 463])

/** 타워 안 맵 — 이 맵들로 들어오는 문 워프가 326(막힘) 하나뿐이라 안에서 안으로만 간다 */
const TOWER_INTERIOR = new Set([326, 327, 328, 329, 330, 331, 493])

interface Site { file: string, n: number, kind: string, destId: number | undefined, entries: { fname: string, entry: number, src: { map: number, kind: string }[] }[] }

/** 걸어서 닿는 출처를 가진 진입점 → 그 출처 맵. 키는 `파일#진입점` (`ScriptEntry` 차례, 0부터) */
function reachableEntries(sites: Site[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  for (const s of sites) {
    if (s.destId === undefined || !CLOSED.has(s.destId)) continue
    for (const e of s.entries) {
      for (const src of e.src) {
        const key = `${e.fname}#${String(e.entry)}`
        if (!out.has(key)) out.set(key, new Set())
        out.get(key)!.add(src.map)
      }
    }
  }
  return out
}

/**
 * 허용 목록. 이유는 줄마다.
 * - 프런티어 559 좌표 사건 셋: `frontierGate.deferredScriptNotice`가 `start()` 맨 앞에서 끊는다(아래 시험이 그 셋을 못 박는다)
 * - 콘테스트 접수원 셋(117): `OpenPartyMenuForContest` 등 세 명령이 「참가를 취소합니까?」 갈래로 닫는다 (`comm.test.ts`)
 * - 팔파크 접수원(393 로비 #1)·팔파크 안(251): `GetGBACartridgeVersion` · `CheckHasEnoughMonForCatchingShow`가 0이라 닫힌다
 * - 센터 2F 접수원 #1(콜로세움 332·333): `StartBattleClient/Server`가 통신 오류로 답한다
 * - 센터 B1F 접수원 #4(광장 586): `CheckNoWiFiPlazaCooldown`이 0, 클럽 저장이 「안 됨」
 * - 리본신드롬 승강기 #0(463): 입구 판정이 막는 건물 안이다(들어올 길이 없다)
 */
const ALLOWED: Readonly<Record<string, readonly number[]>> = {
  'scripts_battle_frontier#33': [559],
  'scripts_battle_frontier#34': [559],
  'scripts_battle_frontier#35': [559],
  'scripts_contests#6': [117],
  'scripts_contests#7': [117],
  'scripts_contests#8': [117],
  'scripts_pal_park#4': [251],
  'scripts_pal_park#5': [251],
  'scripts_pal_park_lobby#1': [393],
  'scripts_pokemon_center_2f_common#1': [],
  'scripts_pokemon_center_b1f_common#4': [],
  'scripts_resort_area_ribbon_syndicate_elevator#0': [463],
}

describe.skipIf(!have)('닫는 맵으로 가는 Warp의 걸어서 닿는 출처 (PARITY §9)', () => {
  const sites = buildStaticWarps(ROOT) as Site[]
  const reach = reachableEntries(sites)

  it('이동 사이트를 읽었다 — 비어 있으면 뜻이 없다', () => {
    expect(sites.length).toBeGreaterThan(80)
    expect(reach.size).toBeGreaterThan(20)
  })

  it('닫는 맵으로 가는 Warp의 출처는 허용 목록 안이거나 타워 안끼리다', () => {
    const stray: string[] = []
    for (const [key, maps] of reach) {
      const file = key.slice(0, key.indexOf('#'))
      if (file.startsWith('scripts_battle_tower')) {
        // 타워 안 스크립트의 출처가 타워 안 맵이다 — 바깥에서 부르는 이벤트가 생기면 문 326의 방어가 뚫린 것이다
        for (const m of maps) if (!TOWER_INTERIOR.has(m)) stray.push(`${key} ← 맵 ${String(m)}`)
        continue
      }
      const allowed = ALLOWED[key]
      if (allowed === undefined) { stray.push(`${key} ← 맵 ${[...maps].join(',')} (허용 목록에 없다)`); continue }
      // 출처 맵이 허용된 것 밖으로 늘었는지 (센터 접수원 둘은 맵이 여럿이라 맵을 안 가린다)
      if (allowed.length > 0) for (const m of maps) if (!allowed.includes(m)) stray.push(`${key} ← 맵 ${String(m)}`)
    }
    expect(stray, '닫는 맵으로 새는 길이 생겼다 — 막기를 먼저 만들고 허용 목록에 이유와 함께 더한다').toEqual([])
  })

  it('허용 목록의 줄은 전부 실제로 있다 — 낡은 줄이 안 남는다', () => {
    for (const key of Object.keys(ALLOWED)) expect(reach.has(key), key).toBe(true)
  })

  it('프런티어 559 좌표 사건 셋(34 · 35 · 36)은 스크립트가 서기 전에 막혀 있다', () => {
    for (const script of [34, 35, 36]) expect(deferredScriptNotice(559, script, 'ko'), `script ${String(script)}`).not.toBeNull()
  })
})
