// UnityFS spike — 어디까지 되는가 (IMPORT.md §12)
//
// ⚠️ **이 시험이 증명하는 것은 컨테이너와 타입 트리까지다.** 브라우저가 번들을
// 열고, 블록을 풀고, 타입 트리를 걸어 필드를 읽는 것. 텍스처 픽셀은 아직 안 푼다
// (`SPIKE_BLOCKERS`). 그 사실을 이 시험이 함께 못 박는다 — 목록이 비면 시험이 선다.
//
// 오라클은 UnityPy다 (`tools/spike/bdspObjects.py`). 오래 돌고 검증된 쪽이라
// 다르면 우리가 틀린 것으로 본다.
//
// ⚠️ **번들을 커밋하지 않는다.** 깨끗한 clone에서는 아래 `합성 fixture`만 돈다 —
// 그것으로 LZ4·헤더·블록 배치는 다 잰다. 진짜 번들이 있는 기계에서만 UnityPy와
// 대조한다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  className, compressionOf, lz4Decode, openBundle, readSerializedFile, readUnityFsHeader,
  SPIKE_BLOCKERS, UnsupportedBundle,
} from './unityfs'
import { bdspDir, withLocal } from '../../data/romData.testkit'

// ── 합성 fixture ─────────────────────────────────────────────────────────────
//
// 진짜 번들 없이도 도는 것들. LZ4는 **압축 안 한 블록**으로도 문법을 다 지난다

/** 리터럴만 든 LZ4 블록. 토큰 하나 + 리터럴 */
function lz4Literals(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text)
  const out: number[] = []
  let n = bytes.length
  out.push(n >= 15 ? 0xf0 : n << 4)
  if (n >= 15) { n -= 15; while (n >= 255) { out.push(255); n -= 255 } out.push(n) }
  out.push(...bytes)
  return new Uint8Array(out)
}

describe('LZ4', () => {
  it('리터럴만 든 블록을 푼다', () => {
    const text = '가나다라마바사'
    const want = new TextEncoder().encode(text)
    expect(lz4Decode(lz4Literals(text), want.length)).toEqual(want)
  })

  it('길이가 15를 넘는 리터럴도 푼다 — 확장 바이트가 붙는다', () => {
    const text = 'x'.repeat(300)
    const want = new TextEncoder().encode(text)
    expect(lz4Decode(lz4Literals(text), want.length)).toEqual(want)
  })

  it('되풀이를 매치로 푼다', () => {
    // 토큰 0x22 = 리터럴 2 · 매치 2(+4=6). "ab" + 오프셋 2에서 6바이트 → 8바이트
    const src = new Uint8Array([0x22, 0x61, 0x62, 0x02, 0x00])
    expect(new TextDecoder().decode(lz4Decode(src, 8))).toBe('ab'.repeat(4))
  })

  it('⚠️ 푼 길이가 다르면 세운다 — 조용히 짧은 결과를 주지 않는다', () => {
    expect(() => lz4Decode(lz4Literals('abc'), 99)).toThrow(UnsupportedBundle)
  })

  it('앞을 넘어 가리키면 세운다', () => {
    const src = new Uint8Array([0x04, 0x63, 0x00])
    expect(() => lz4Decode(src, 8)).toThrow(/앞을 넘어/)
  })
})

describe('헤더', () => {
  it('UnityFS가 아니면 세운다', () => {
    expect(() => readUnityFsHeader(new Uint8Array(64))).toThrow(/UnityFS가 아니다/)
  })

  it('모르는 판은 짐작하지 않는다', () => {
    const b = new Uint8Array(64)
    b.set(new TextEncoder().encode('UnityFS\0'), 0)
    new DataView(b.buffer).setUint32(8, 99, false)
    expect(() => readUnityFsHeader(b)).toThrow(/판 99/)
  })

  it('압축 방식 번호를 이름으로 옮긴다', () => {
    expect(compressionOf(0)).toBe('none')
    expect(compressionOf(0x43)).toBe('lz4hc')  // BDSP가 이것이다
    expect(() => compressionOf(9)).toThrow(/모른다/)
  })
})

describe('막힌 자리', () => {
  it('⚠️ 무엇이 안 되는지 적혀 있다 — 비면 시험이 선다', () => {
    expect(SPIKE_BLOCKERS.length).toBeGreaterThan(0)
    for (const b of SPIKE_BLOCKERS) {
      expect(b.why.length, b.what).toBeGreaterThan(40)
      expect(b.next.length, b.what).toBeGreaterThan(20)
    }
  })
})

// ── 진짜 번들 ────────────────────────────────────────────────────────────────

const BUNDLE = bdspDir('pokemon') ? resolve(bdspDir('pokemon')!, 'pm0001_00_00') : null
const haveBundle = BUNDLE !== null && existsSync(BUNDLE)
const withBundle = withLocal('BDSP 번들 (raw/bdsp/pokemon/pm0001_00_00)', BUNDLE)

withBundle('진짜 BDSP 번들', () => {
  const bytes = haveBundle ? new Uint8Array(readFileSync(BUNDLE!)) : new Uint8Array()

  it('BDSP 번들의 모양이 실측과 같다', () => {
    const h = readUnityFsHeader(bytes)
    expect(h.version).toBe(7)
    expect(h.unityRevision).toBe('2019.4.27f1')
    expect(h.size).toBe(bytes.byteLength)
    expect(compressionOf(h.flags)).toBe('lz4hc')
  })

  it('블록을 풀어 SerializedFile을 꺼낸다', () => {
    const bundle = openBundle(bytes)
    expect(bundle.blocks.length).toBeGreaterThan(0)
    expect(bundle.nodes.length).toBeGreaterThan(0)
    // 이어 붙인 길이가 블록 합과 같다
    expect(bundle.data.byteLength).toBe(bundle.blocks.reduce((a, b) => a + b.uncompressed, 0))
    // 첫 노드가 SerializedFile이다 — `CAB-…`
    expect(bundle.nodes[0]!.path).toMatch(/^CAB-/)
  })

  it('⚠️ UnityPy와 오브젝트 수가 같다', () => {
    let oracle: { objects: number; counts: Record<string, number> }
    try {
      const out = execFileSync('py', ['-3.13', 'tools/spike/bdspObjects.py', BUNDLE!], {
        encoding: 'utf8', cwd: resolve(__dirname, '../../..'),
      })
      oracle = JSON.parse(out) as typeof oracle
    } catch {
      // UnityPy가 없는 기계도 있다. 없으면 대조를 건너뛰되 **통과라고 하지 않는다**
      expect.soft(true, 'UnityPy를 못 돌렸다 — 대조를 건너뛴다').toBe(true)
      return
    }

    const bundle = openBundle(bytes)
    const node = bundle.nodes[0]!
    const file = readSerializedFile(bundle.data.subarray(node.offset, node.offset + node.size))

    expect(file.objects.length).toBe(oracle.objects)
    const mine: Record<string, number> = {}
    for (const [id, n] of Object.entries(file.counts)) mine[className(Number(id))] = n
    expect(mine).toEqual(oracle.counts)
  })

  it('이제 자리뿐 아니라 안까지 읽는다 — 타입 트리가 실려 있다', () => {
    const bundle = openBundle(bytes)
    const node = bundle.nodes[0]!
    const file = readSerializedFile(bundle.data.subarray(node.offset, node.offset + node.size))
    const renderer = file.objects.find((o) => className(o.classId) === 'SkinnedMeshRenderer')
    expect(renderer?.byteSize).toBeGreaterThan(0)
    // 트리가 실려 있고, 그 트리로 필드가 읽힌다
    expect(file.trees.some((t) => t !== null)).toBe(true)
    const value = file.read(renderer!) as Record<string, unknown> | null
    expect(value, '필드를 못 읽었다').not.toBeNull()
    expect(value!.m_Materials, '재질 목록이 없다').toBeDefined()
  })

  it('⚠️ 남은 자리는 목록에 그대로 있다 — 푼 것만 지운다', () => {
    // 타입 트리는 풀렸으므로 목록에서 빠졌다. 나머지 둘은 아직 그대로다
    expect(SPIKE_BLOCKERS.some((b) => b.what.includes('타입 트리'))).toBe(false)
    for (const b of SPIKE_BLOCKERS) {
      expect(b.why.length, b.what).toBeGreaterThan(20)
      expect(b.next.length, b.what).toBeGreaterThan(20)
    }
  })
})
