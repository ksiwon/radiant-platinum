// 브라우저 변환 ↔ 노드 산출물 parity (IMPORT.md §6 끝 · §9 · PLAN §4.1)
//
// ⚠️ **이 시험이 전환의 정의다.** "브라우저에서도 돌아간다"로는 부족하다 —
// 브라우저가 만든 것이 개발판이 쓰던 것과 **같아야** 두 경로가 하나의 게임이다.
// 다르면 개발판에서 초록인 시험 1,400개가 공개판을 아무것도 보증하지 않는다.
//
// 그래서 같은 롬에서 두 경로를 돌려 바이트로 맞춘다:
//
//   ① 노드   `raw` → `tools/extract/moves.js` → `public/data/moves.json`
//   ② 브라우저 같은 롬 → `src/import/platinum/convert.ts` → 바이트
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, type ByteSource } from './nds'
import { Cancelled, GROUPS, groupsBlocked, groupsReady, parseMove } from './convert'
import { DATA, withRom, romPath } from '../../data/romData.testkit'

function fileSource(path: string): ByteSource {
  const size = statSync(path).size
  return {
    size,
    slice(start, end) {
      const want = Math.max(0, Math.min(end, size) - start)
      const out = Buffer.alloc(want)
      const fd = openSync(path, 'r')
      try { readSync(fd, out, 0, want, start) } finally { closeSync(fd) }
      return Promise.resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
    },
  }
}

describe('그룹 표', () => {
  it('옮긴 것과 안 옮긴 것이 표에 다 있다', () => {
    // ⚠️ 안 옮긴 것을 표에서 빼면 "다 됐다"로 보인다. 이유까지 적혀 있어야 한다
    for (const g of groupsBlocked()) {
      expect(g.blockedBy, g.name).toBeTruthy()
      expect(g.blockedBy!.length, g.name).toBeGreaterThan(20)
    }
    expect(groupsReady().length).toBeGreaterThan(0)
    expect(groupsReady().length + groupsBlocked().length).toBe(GROUPS.length)
  })

  it('그룹마다 무엇을 만드는지 적혀 있다 — 저널이 그걸로 재개를 판단한다', () => {
    for (const g of GROUPS) expect(g.outputs.length, g.name).toBeGreaterThan(0)
  })

  it('이름이 겹치지 않는다', () => {
    const names = GROUPS.map((g) => g.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('기술 한 줄', () => {
  const bytes = (over: Partial<Record<number, number>> = {}) => {
    const b = new Uint8Array(16)
    for (const [at, v] of Object.entries(over)) b[Number(at)] = v!
    return b
  }

  it('꼬리 2B가 0이 아니면 세운다 — 배치 가정이 깨진 것이다', () => {
    expect(() => parseMove(bytes({ 14: 1 }), 0)).toThrow(/꼬리/)
  })

  it('분류가 범위를 벗어나면 세운다', () => {
    expect(() => parseMove(bytes({ 2: 3 }), 0)).toThrow(/분류/)
  })

  it('명중 0은 필중이다 — 471개 중 127개가 그렇다', () => {
    expect(parseMove(bytes({ 5: 0 }), 0).alwaysHits).toBe(true)
    expect(parseMove(bytes({ 5: 100 }), 0).alwaysHits).toBe(false)
  })

  it('우선도는 부호가 있다 — 울부짖기가 −6이다', () => {
    expect(parseMove(bytes({ 10: 0xfa }), 0).priority).toBe(-6)
  })
})

withRom('en')('브라우저 변환 — 진짜 롬', () => {
  const open = async () => {
    const fs = await openNds(fileSource(romPath('en')!))
    if (!fs) throw new Error('롬을 못 열었다')
    return fs
  }

  it('기술 471개를 만든다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const seen: number[] = []
    const out = await group.convert!({
      fs: await open(),
      locale: 'en',
      onProgress: (done) => seen.push(done),
    })

    const json = JSON.parse(new TextDecoder().decode(out.get('data/moves.json')!)) as {
      count: number
      moves: { id: number; power: number; priority: number }[]
    }
    expect(json.count).toBe(471)
    expect(json.moves).toHaveLength(471)
    // 진행이 실제로 여러 번 보고된다 — 한 번이면 화면이 멈춘 것처럼 보인다
    expect(seen.length).toBeGreaterThan(5)
  })

  it('⚠️ 취소하면 그 자리에서 멈춘다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const signal = { aborted: false }
    await expect(group.convert!({
      fs: await open(),
      locale: 'en',
      signal,
      // 첫 보고에서 끊는다. 취소를 늦게 보면 몇 초를 더 돈다
      onProgress: () => { signal.aborted = true },
    })).rejects.toBeInstanceOf(Cancelled)
  })

  it('알려진 기술 몇 개가 원작 값이다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const out = await group.convert!({ fs: await open(), locale: 'en' })
    const json = JSON.parse(new TextDecoder().decode(out.get('data/moves.json')!)) as {
      moves: { id: number; power: number; priority: number; pp: number; contact: boolean }[]
    }
    // 우선도 핀 (DATA.md §2.5) — 전광석화 +1 · 방어 +3 · 울부짖기 −6.
    // ⚠️ 45는 「울음소리」(0)고 「울부짖기」는 46이다. 처음에 45로 적었다가
    // 0이 나왔다 — 표가 아니라 내가 틀린 것이었다
    expect(json.moves[98]!.priority).toBe(1)
    expect(json.moves[182]!.priority).toBe(3)
    expect(json.moves[46]!.priority).toBe(-6)
    // 몸통박치기: 위력 35 · PP 35 · 접촉
    expect(json.moves[33]!.power).toBe(35)
    expect(json.moves[33]!.pp).toBe(35)
    expect(json.moves[33]!.contact).toBe(true)
  })
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  const nodeFile = resolve(DATA, 'moves.json')

  it('⚠️ 같은 롬에서 두 경로가 같은 바이트를 낸다', async () => {
    let expected: string
    try {
      expected = readFileSync(nodeFile, 'utf8')
    } catch {
      // 노드 산출물이 없으면 대조할 것이 없다. `pnpm extract:moves`가 만든다
      expect.unreachable('public/data/moves.json이 없다 — pnpm extract:moves')
      return
    }

    const fs = await openNds(fileSource(romPath('en')!))
    const group = GROUPS.find((g) => g.name === 'moves')!
    const out = await group.convert!({ fs: fs!, locale: 'en' })
    const actual = new TextDecoder().decode(out.get('data/moves.json')!)

    // 바이트로 같다. 키 순서와 들여쓰기까지 — 직렬화가 갈리면 두 경로가 만든
    // 파일의 해시가 달라지고, 설치 저널이 그걸 "바뀐 것"으로 읽는다
    expect(actual.length).toBe(expected.length)
    expect(actual).toBe(expected)
  })
})
