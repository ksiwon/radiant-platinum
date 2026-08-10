// 타입 트리 · 메시 — 브라우저에서 (IMPORT.md §12)
//
// ⚠️ **여기서 재는 것은 "돌아간다"가 아니라 "맞다"다.** 타입 트리를 잘못 걸으면
// 값이 그럴듯하게 나오다가 어느 필드부터 쓰레기가 되는데, 어디서부터인지 안 보인다.
// 그래서 두 축으로 잰다:
//
//   ① 오라클 — UnityPy가 깔린 기계에서는 같은 번들을 양쪽으로 읽어 맞댄다
//   ② 불변식 — 오라클이 없어도 성립해야 하는 것들. 정점 자료 크기가 채널에서
//      계산한 stride와 맞는가, 부분메시 색인이 색인 버퍼 안에 드는가
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { openBundle, readSerializedFile, className } from './unityfs'
import { buildTree, TreeReader, stringAt, type TypeNode } from './typetree'
import { readMesh, streamLayout, float16, MeshError, type Channel } from './mesh'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const node = (o: Partial<TypeNode> & { type: string, name: string, level: number }): TypeNode => ({
  byteSize: -1, index: 0, typeFlags: 0, metaFlag: 0, children: [], ...o,
})

describe('트리 세우기', () => {
  it('level이 곧 깊이다', () => {
    const tree = buildTree([
      node({ type: 'Mesh', name: 'Base', level: 0 }),
      node({ type: 'string', name: 'm_Name', level: 1 }),
      node({ type: 'Array', name: 'Array', level: 2 }),
      node({ type: 'int', name: 'm_Count', level: 1 }),
    ])!
    expect(tree.children.map((c) => c.name)).toEqual(['m_Name', 'm_Count'])
    expect(tree.children[0]!.children[0]!.name).toBe('Array')
  })

  it('공용 문자열표를 자리로 찾는다 — 최상위 비트가 서면 그쪽이다', () => {
    // 표 첫 항목이 `AABB`(자리 0)다. 순서가 곧 자리라 하나만 빠져도 전부 어긋난다
    expect(stringAt(0x80000000, new Uint8Array(0))).toBe('AABB')
    expect(stringAt(0x80000005, new Uint8Array(0))).toBe('AnimationClip')
  })

  it('지역 문자열은 NUL까지다', () => {
    const local = Uint8Array.from([0x61, 0x62, 0, 0x63, 0])
    expect(stringAt(0, local)).toBe('ab')
    expect(stringAt(3, local)).toBe('c')
  })
})

describe('값 읽기', () => {
  const ALIGN = 0x4000

  it('⚠️ TypelessData를 벡터로 읽지 않는다 — 그러면 뒤가 전부 밀린다', () => {
    // `TypelessData`는 `typeFlags & 1`을 갖지만 벡터가 아니다. 길이+바이트를
    // 통째로 먹는다. 벡터로 읽으면 600KB를 1바이트로 읽고 그 뒤가 다 어긋난다
    const tree = node({
      type: 'Base', name: 'Base', level: 0,
      children: [
        node({
          type: 'TypelessData', name: 'data', level: 1, typeFlags: 1, metaFlag: ALIGN,
          children: [node({ type: 'int', name: 'size', level: 2 })],
        }),
        node({ type: 'int', name: 'after', level: 1 }),
      ],
    })
    const b = new Uint8Array(16)
    const v = new DataView(b.buffer)
    v.setInt32(0, 5, true)        // 5바이트
    b.set([1, 2, 3, 4, 5], 4)
    v.setInt32(12, 0x1234, true)  // 9→12로 정렬한 뒤
    const r = new TreeReader(b)
    const out: Record<string, unknown> = {}
    for (const c of tree.children) out[c.name] = r.read(c)
    expect([...(out.data as Uint8Array)]).toEqual([1, 2, 3, 4, 5])
    expect(out.after).toBe(0x1234)
  })

  it('벡터의 정렬 깃발은 Array 자식 것을 본다 — 벡터 자신에는 없다', () => {
    const tree = node({
      type: 'vector', name: 'v', level: 0,
      children: [node({
        type: 'Array', name: 'Array', level: 1, typeFlags: 1, metaFlag: ALIGN,
        children: [
          node({ type: 'int', name: 'size', level: 2 }),
          node({ type: 'UInt8', name: 'data', level: 2 }),
        ],
      })],
    })
    const b = new Uint8Array(12)
    const v = new DataView(b.buffer)
    v.setInt32(0, 1, true)
    b[4] = 9
    v.setInt32(8, 7, true)
    const r = new TreeReader(b)
    expect([...(r.read(tree) as Uint8Array)]).toEqual([9])
    // 5까지 읽고 8로 맞춰졌다
    expect(r.at).toBe(8)
  })

  it('string은 길이+바이트를 읽고 늘 4로 맞춘다', () => {
    const tree = node({ type: 'string', name: 's', level: 0 })
    const b = new Uint8Array(12)
    new DataView(b.buffer).setInt32(0, 3, true)
    b.set([0x61, 0x62, 0x63], 4)
    const r = new TreeReader(b)
    expect(r.read(tree)).toBe('abc')
    expect(r.at).toBe(8)
  })

  it('PPtr는 그냥 구조체다 — 하드코딩하지 않는다', () => {
    const tree = node({
      type: 'PPtr<Texture2D>', name: 'p', level: 0,
      children: [
        node({ type: 'int', name: 'm_FileID', level: 1 }),
        node({ type: 'SInt64', name: 'm_PathID', level: 1 }),
      ],
    })
    const b = new Uint8Array(12)
    const v = new DataView(b.buffer)
    v.setInt32(0, 2, true)
    v.setBigInt64(4, 99n, true)
    expect(new TreeReader(b).read(tree)).toEqual({ m_FileID: 2, m_PathID: 99 })
  })
})

describe('정점 배치', () => {
  const ch = (stream: number, offset: number, format: number, dimension: number): Channel =>
    ({ stream, offset, format, dimension })

  it('stride는 그 스트림 채널의 가장 먼 끝을 4로 올린 값이다', () => {
    // 스트림 0: float3 위치(0..12) + float3 법선(12..24) + float4 탄젠트(24..40)
    const layout = streamLayout([ch(0, 0, 0, 3), ch(0, 12, 0, 3), ch(0, 24, 0, 4)], 10)
    expect(layout[0]!.stride).toBe(40)
    expect(layout[0]!.start).toBe(0)
  })

  it('다음 스트림은 16바이트 경계에서 시작한다', () => {
    const layout = streamLayout([ch(0, 0, 0, 3), ch(1, 0, 2, 4)], 3)
    // 스트림 0: 12B × 3 = 36 → 48로 올림
    expect(layout[0]!.stride).toBe(12)
    expect(layout[1]!.start).toBe(48)
  })

  it('차원 0인 채널은 자리를 안 차지한다 — 14칸 중 대부분이 그렇다', () => {
    const layout = streamLayout([ch(0, 0, 0, 3), ch(0, 0, 0, 0), ch(0, 0, 0, 0)], 4)
    expect(layout[0]!.stride).toBe(12)
    expect(layout).toHaveLength(1)
  })

  it('반정밀도를 편다', () => {
    expect(float16(0x3c00)).toBe(1)
    expect(float16(0xbc00)).toBe(-1)
    expect(float16(0)).toBe(0)
  })

  it('⚠️ 압축 메시는 짐작으로 안 채운다', () => {
    expect(() => readMesh({
      m_VertexData: { m_VertexCount: 1, m_Channels: [], m_DataSize: new Uint8Array(0) },
      m_CompressedMesh: { m_Vertices: { m_NumItems: 12 } },
    })).toThrow(MeshError)
  })
})

// ── 진짜 번들 ────────────────────────────────────────────────────────────────

const CHARACTERS = bdspDir('characters')
const BUNDLES = CHARACTERS
  ? [join(CHARACTERS, 'persons/battle'), join(CHARACTERS, 'persons/field')]
  : []

const someBundles = (limit: number): string[] => {
  const out: string[] = []
  for (const dir of BUNDLES) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f)
      if (statSync(p).isFile()) out.push(p)
      if (out.length >= limit) return out
    }
  }
  return out
}

const hasUnityPy = (): boolean => {
  try {
    execFileSync('python', ['-c', 'import UnityPy'], { stdio: 'ignore' })
    return true
  } catch { return false }
}

withLocal('BDSP 번들', existsSync(BUNDLES[0]!) ? BUNDLES[0]! : null)('진짜 번들 — 불변식', () => {
  it('⚠️ 정점 자료 크기가 채널에서 계산한 배치와 맞는다', () => {
    let meshes = 0
    for (const file of someBundles(6)) {
      const bundle = openBundle(new Uint8Array(readFileSync(file)))
      for (const dirNode of bundle.nodes) {
        if (dirNode.path.endsWith('.resS')) continue
        const ser = readSerializedFile(bundle.data.subarray(dirNode.offset, dirNode.offset + dirNode.size))
        for (const o of ser.objects) {
          if (className(o.classId) !== 'Mesh') continue
          const raw = ser.read(o) as Record<string, never>
          const vd = raw.m_VertexData as unknown as Record<string, unknown>
          const channels = vd.m_Channels as Channel[]
          const count = vd.m_VertexCount as number
          const data = vd.m_DataSize as Uint8Array
          const layout = streamLayout(channels, count)
          const last = layout[layout.length - 1]!
          const need = last.start + last.stride * count
          // 정확히 같지는 않다 — 끝이 16으로 패딩된다. 다만 **넘으면 안 된다**
          expect(need, file).toBeLessThanOrEqual(data.byteLength)
          expect(data.byteLength - need, file).toBeLessThan(16)
          meshes++
        }
      }
    }
    expect(meshes).toBeGreaterThan(0)
  }, 300_000)

  it('부분메시 색인이 색인 버퍼 안에 들고 정점 범위를 안 넘는다', () => {
    let subs = 0
    for (const file of someBundles(6)) {
      const bundle = openBundle(new Uint8Array(readFileSync(file)))
      for (const dirNode of bundle.nodes) {
        if (dirNode.path.endsWith('.resS')) continue
        const ser = readSerializedFile(bundle.data.subarray(dirNode.offset, dirNode.offset + dirNode.size))
        for (const o of ser.objects) {
          if (className(o.classId) !== 'Mesh') continue
          const mesh = readMesh(ser.read(o) as Record<string, never>)
          for (const s of mesh.subMeshes) {
            const from = s.firstByte / 2
            expect(from + s.indexCount, mesh.name).toBeLessThanOrEqual(mesh.indices.length)
            for (let i = from; i < from + s.indexCount; i++) {
              expect(mesh.indices[i]!, mesh.name).toBeLessThan(mesh.vertexCount)
            }
            subs++
          }
        }
      }
    }
    expect(subs).toBeGreaterThan(10)
  }, 300_000)

  it('위치·법선·UV가 다 나오고 값이 유한하다', () => {
    const file = someBundles(1)[0]!
    const bundle = openBundle(new Uint8Array(readFileSync(file)))
    let found = false
    for (const dirNode of bundle.nodes) {
      if (dirNode.path.endsWith('.resS')) continue
      const ser = readSerializedFile(bundle.data.subarray(dirNode.offset, dirNode.offset + dirNode.size))
      for (const o of ser.objects) {
        if (className(o.classId) !== 'Mesh') continue
        const mesh = readMesh(ser.read(o) as Record<string, never>)
        const pos = mesh.attributes.get(0)
        expect(pos, '위치가 없다').toBeDefined()
        expect(pos!.length).toBe(mesh.vertexCount * 3)
        expect(pos!.every((v) => Number.isFinite(v))).toBe(true)
        expect(mesh.attributes.get(1), '법선이 없다').toBeDefined()
        expect(mesh.attributes.get(4), 'UV0이 없다').toBeDefined()
        // 사람 모델이라 좌표가 미터 단위 몇 안쪽이다. 배치가 밀리면 1e30이 나온다
        expect(Math.max(...pos!.map(Math.abs))).toBeLessThan(100)
        found = true
      }
    }
    expect(found).toBe(true)
  }, 300_000)
})

withLocal(
  'UnityPy 오라클', existsSync(BUNDLES[0]!) && hasUnityPy() ? BUNDLES[0]! : null,
)('오라클 — UnityPy와 같은 값을 낸다', () => {
  it('⚠️ 오브젝트 수·클래스별 개수·메시 수치가 UnityPy와 같다', () => {
    const files = someBundles(4)
    const script = `
import UnityPy, json, sys
out = []
for f in sys.argv[1:]:
    env = UnityPy.load(f)
    counts = {}
    mesh = None
    for o in env.objects:
        counts[o.type.name] = counts.get(o.type.name, 0) + 1
        if o.type.name == 'Mesh' and mesh is None:
            d = o.read_typetree(); vd = d['m_VertexData']
            mesh = [vd['m_VertexCount'], len(vd['m_Channels']), len(vd['m_DataSize']),
                    len(d['m_SubMeshes']), len(d['m_IndexBuffer']), len(d['m_BindPose'])]
    out.append({'objects': len(env.objects), 'counts': counts, 'mesh': mesh})
print(json.dumps(out))
`
    const oracle = JSON.parse(execFileSync('python', ['-c', script, ...files], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    })) as { objects: number, counts: Record<string, number>, mesh: number[] | null }[]

    files.forEach((file, i) => {
      const want = oracle[i]!
      const bundle = openBundle(new Uint8Array(readFileSync(file)))
      let objects = 0
      const counts: Record<string, number> = {}
      let mesh: number[] | null = null
      for (const dirNode of bundle.nodes) {
        if (dirNode.path.endsWith('.resS')) continue
        const ser = readSerializedFile(bundle.data.subarray(dirNode.offset, dirNode.offset + dirNode.size))
        objects += ser.objects.length
        for (const o of ser.objects) {
          const n = className(o.classId)
          counts[n] = (counts[n] ?? 0) + 1
          if (n === 'Mesh' && mesh === null) {
            const m = readMesh(ser.read(o) as Record<string, never>)
            mesh = [
              m.vertexCount,
              (( ser.read(o) as Record<string, never>).m_VertexData as unknown as
                { m_Channels: unknown[] }).m_Channels.length,
              (( ser.read(o) as Record<string, never>).m_VertexData as unknown as
                { m_DataSize: Uint8Array }).m_DataSize.byteLength,
              m.subMeshes.length,
              m.indices.length * 2,
              m.bindPose.length / 16,
            ]
          }
        }
      }
      expect(objects, file).toBe(want.objects)
      // UnityPy가 이름을 붙인 클래스만 맞댄다 — 우리 표에 없는 것은 `#번호`로 남는다
      for (const [name, n] of Object.entries(want.counts)) {
        if (counts[name] === undefined) continue
        expect(counts[name], `${file} ${name}`).toBe(n)
      }
      if (want.mesh) expect(mesh, file).toEqual(want.mesh)
    })
  }, 600_000)
})
