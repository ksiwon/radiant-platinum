// 스크립트 전수 점검 목록의 계약 (`scriptsSweepList.mjs`)
//
// ⚠️ 여기서 잠그는 것은 둘이다. ① 목록이 읽는 초기화 표가 **제품이 읽는 것과 같다**(규칙이 두 벌이라 맞대어 본다)
// ② 범위 밖을 가르는 규칙이 **프런티어 문 네 곳의 안내**(`engine/world/frontierGate`)와 어긋나지 않는다
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — tools/는 타입 검사 밖의 순수 JS다
import { buildList, parseInit, scopeOf } from './scriptsSweepList.mjs'
import { parseInitScripts } from '../../src/engine/script/initScripts'
import { deferredFacilityNotice } from '../../src/engine/world/frontierGate'

const DATA = resolve(import.meta.dirname, '../../public/data')
const have = existsSync(resolve(DATA, 'scripts.bin'))

describe.skipIf(!have)('스크립트 전수 점검 목록', () => {
  it('초기화 표를 제품과 같게 읽는다 (모든 맵)', () => {
    const meta = JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8'))
    const maps = JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')).maps as { initScripts: number }[]
    const bin = readFileSync(resolve(DATA, 'scripts.bin'))
    let looked = 0
    for (const header of maps) {
      const info = meta.files[header.initScripts]
      if (info?.kind !== 'init' || info.size === 0) continue
      const bytes = bin.subarray(info.at, info.at + info.size)
      const mine = parseInit(bytes)
      const theirs = parseInitScripts(bytes)
      expect([...mine.fixed]).toEqual([...theirs.fixed])
      expect(mine.frame).toEqual(theirs.frame)
      looked++
    }
    // ⚠️ 비어 있으면 뜻이 없다
    expect(looked).toBeGreaterThan(300)
  })

  it('범위 밖은 프런티어 넷 · 콘테스트 · 통신뿐이고 팩토리 · 깨어진 세계 · 프런티어 지상은 범위 안이다', () => {
    const list = buildList(DATA)
    const out = new Map<number, string>(list.excluded.map((e: { map: number, why: string }) => [e.map, e.why]))
    // 막은 시설 네 문(326 타워 · 563 · 564 · 565)이 전부 범위 밖이다
    for (const map of [326, 563, 564, 565]) {
      expect(deferredFacilityNotice(map, 'ko')).not.toBeNull()
      expect(out.has(map), `맵 ${String(map)}`).toBe(true)
    }
    // 팩토리(562) · 프런티어 지상(559) · 관문(560) · 깨어진 세계 1F(573)는 안에 있다
    for (const map of [559, 560, 562, 573]) expect(out.has(map), `맵 ${String(map)}`).toBe(false)
    expect(list.maps.length + list.excluded.length).toBe(593)
  })

  it('scopeOf는 헤더의 스크립트 파일 이름으로만 가른다', () => {
    const meta = { files: [{ name: 'scripts_contest_hall_lobby' }, { name: 'scripts_battle_factory' }] }
    expect(scopeOf({ scripts: 0, name: 'X' }, meta).inScope).toBe(false)
    expect(scopeOf({ scripts: 1, name: 'X' }, meta).inScope).toBe(true)
    // 스크립트가 비어 있는 통신 맵은 헤더 이름이다
    expect(scopeOf({ scripts: 1, name: 'RECORD' }, meta).inScope).toBe(false)
  })
})
