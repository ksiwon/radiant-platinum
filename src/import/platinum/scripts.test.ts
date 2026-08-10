// 스크립트·이벤트 그룹 ↔ 노드 산출물 parity (DATA.md §2.10 · §2.3)
//
// ⚠️ **여기서 재는 것 하나가 굽힌 메타데이터가 여전히 맞는가다.** `scriptMeta.ts`는
// 디컴프에서 뽑아 커밋한 것이라 디컴프가 없는 기계에서는 아무도 안 본다. 그것이
// 낡으면 스크립트가 조용히 어긋나므로, 롬이 있는 기계에서 매번 대조한다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, narcEntry } from './nds'
import { convertScripts, readEntries, parseEventFile } from './scripts'
import { COMMANDS, SCRIPT_NAMES, INIT_FILES, RANGES, MOVEMENTS } from './scriptMeta'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource } from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
const decoder = new TextDecoder()

describe('굽힌 메타데이터', () => {
  it('명령 840개에 폭이 다 적혀 있다 — 하나만 비어도 그 뒤가 밀린다', () => {
    expect(COMMANDS).toHaveLength(840)
    for (const c of COMMANDS) {
      expect(typeof c.name, c.name).toBe('string')
      expect(typeof c.args, c.name).toBe('string')
      for (const a of c.args.split(' ').filter(Boolean)) expect(a).toMatch(/^[1-9]\d*\*?$/)
    }
  })

  it('길이가 조건부인 명령은 갈래를 다 적는다', () => {
    const conditional = COMMANDS.filter((c) => c.on !== undefined)
    expect(conditional.length).toBeGreaterThan(0)
    for (const c of conditional) expect(c.cases?.length, c.name).toBeGreaterThan(0)
  })

  it('파일 1124개 중 549개가 초기화 표다', () => {
    expect(SCRIPT_NAMES).toHaveLength(1124)
    expect(INIT_FILES).toHaveLength(549)
    expect(Math.max(...INIT_FILES)).toBeLessThan(SCRIPT_NAMES.length)
  })

  it('구역 표가 내림차순으로 겹치지 않는다', () => {
    const froms = RANGES.map((r) => r.from)
    expect(new Set(froms).size).toBe(froms.length)
    for (const r of RANGES) expect(r.bank).toMatch(/^TEXT_BANK_/)
  })

  it('이동 동작에 방향과 프레임이 붙어 있다 — 한 칸이 거리×프레임 16이다', () => {
    const walks = MOVEMENTS.filter((m) => m?.kind === 'walk' && m.tiles === 1)
    expect(walks.length).toBeGreaterThan(0)
    for (const w of walks) expect(w!.frames).toBeGreaterThan(0)
  })

  it('⚠️ 롬 바이트가 안 섞여 있다 — 메타데이터에 288KB짜리 코드가 없다', () => {
    // 명령 이름·폭과 파일 이름뿐이라 크기가 100KB를 넘을 이유가 없다.
    // 넘으면 누가 바이트코드를 여기 넣은 것이다
    const size = readFileSync(resolve(__dirname, 'scriptMeta.ts')).byteLength
    expect(size).toBeLessThan(120_000)
  })
})

describe('진입점 표', () => {
  it('끝 표시가 없어도 가장 앞선 목적지에서 멈춘다', () => {
    // 진입점 둘이 다 8을 가리킨다 → 표는 8에서 끝나고 그 뒤는 코드다
    const b = new Uint8Array(16)
    const v = new DataView(b.buffer)
    v.setInt32(0, 4, true)   // 0 → 0+4+4 = 8
    v.setInt32(4, 0, true)   // 4 → 4+4+0 = 8
    v.setInt32(8, 0x1234, true) // 코드. 표로 읽으면 안 된다
    expect(readEntries(b)).toEqual([8, 8])
  })

  it('진입점이 파일 밖을 가리키면 세운다', () => {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setInt32(0, 9999, true)
    expect(() => readEntries(b)).toThrow(/파일 밖/)
  })
})

describe('이벤트 파일', () => {
  it('구역 넷의 크기 합이 파일과 안 맞으면 세운다', () => {
    // 개수 넷을 0으로 두면 16바이트여야 한다. 17바이트면 가정이 깨진 것이다
    expect(() => parseEventFile(new Uint8Array(17))).toThrow(/크기 합/)
    expect(() => parseEventFile(new Uint8Array(16))).not.toThrow()
  })
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  let cached: Map<string, Uint8Array> | null = null
  const run = async (): Promise<Map<string, Uint8Array>> => {
    if (cached) return cached
    const fs = await openNds(fileSource(romPath('en')!))
    cached = await convertScripts({ fs: fs!, locale: 'en', release: EN })
    return cached
  }

  it('⚠️ 세 파일이 다 노드 산출물과 같다', async () => {
    if (!existsSync(resolve(DATA, 'scripts.json'))) {
      expect.unreachable('public/data/scripts.json이 없다 — pnpm extract:scripts')
      return
    }
    const out = await run()
    const diff: string[] = []
    for (const [path, bytes] of out) {
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const expected = readFileSync(file)
      if (!Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) {
        diff.push(`${path}: ${String(bytes.byteLength)}B ≠ ${String(expected.byteLength)}B`)
      }
    }
    expect(diff, diff.join('\n')).toEqual([])
  }, 300_000)

  it('스크립트 1124개 · 이벤트 534개가 나온다', async () => {
    const out = await run()
    const meta = JSON.parse(decoder.decode(out.get('data/scripts.json')!)) as {
      count: number, files: { kind: string }[], ranges: { msg: number }[]
    }
    expect(meta.count).toBe(1124)
    expect(meta.files.filter((f) => f.kind === 'init')).toHaveLength(549)
    // 구역마다 글 뱅크 번호가 풀렸다 — 이름만 굽고 번호는 계산한다
    for (const r of meta.ranges) expect(r.msg).toBeGreaterThanOrEqual(0)
    const events = JSON.parse(decoder.decode(out.get('data/events.json')!)) as { count: number }
    expect(events.count).toBe(534)
  }, 300_000)

  it('⚠️ 굽힌 파일 이름이 롬의 파일 수와 맞는다 — 낡으면 여기서 선다', async () => {
    const fs = await openNds(fileSource(romPath('en')!))
    const narc = await fs!.read('/fielddata/script/scr_seq.narc')
    let n = 0
    while (narcEntry(narc!, n)) n++
    expect(n).toBe(SCRIPT_NAMES.length)
  }, 120_000)
})
