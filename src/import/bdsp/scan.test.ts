// BDSP 폴더 검증 (IMPORT.md §5)
//
// 구조는 개발 기계 덤프의 `fstree.txt`에서 실측한 것이다 — 그룹마다 `<이름>.bin`
// 색인과 같은 이름의 폴더가 짝을 이룬다. 여기서는 그 모양을 **작게 지어** 재고,
// 실물이 있는 기계에서는 아래 `withBdsp` 묶음이 진짜 폴더로 다시 잰다.
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe as vitestDescribe } from 'vitest'
import {
  findRoot, memoryDirSource, REQUIRED_GROUPS, SAMPLE_SPECIES, scanBdsp,
  type DirEntry, type DirSource,
} from './scan'

/** 통과해야 하는 최소 구조. 실측 이름 그대로다 */
function goodTree(prefix = 'romfs/Data/StreamingAssets/AssetAssistant'): Record<string, number> {
  const files: Record<string, number> = {}
  for (const { name } of REQUIRED_GROUPS) {
    files[`${prefix}/${name}.bin`] = 1024
    files[`${prefix}/${name}/${name}`] = 4096
  }
  files[`${prefix}/Dpr/masterdatas`] = 8192
  files[`${prefix}/Characters/objects/ob1003_00`] = 2048
  for (const species of SAMPLE_SPECIES) {
    files[`${prefix}/Pokemon Database/pokemons/battle/${species}_00_00`] = 512
    files[`${prefix}/Pokemon Database/pokemons/battle/${species}_00_01`] = 512
  }
  return files
}

describe('AssetAssistant 찾기', () => {
  it('상위 폴더를 골라도 아래에서 찾는다', () => {
    const root = findRoot([{ path: 'romfs/Data/StreamingAssets/AssetAssistant/Dpr.bin', size: 1 }])
    expect(root).toBe('romfs/Data/StreamingAssets/AssetAssistant')
  })

  it('대소문자만 정규화한다', () => {
    expect(findRoot([{ path: 'x/assetassistant/Dpr.bin', size: 1 }])).toBe('x/assetassistant')
  })

  it('⚠️ 겹쳐 둔 덤프에서는 얕은 쪽을 고른다', () => {
    // 깊은 쪽을 잡으면 사용자가 왜 그게 골라졌는지 알 수 없다
    const entries: DirEntry[] = [
      { path: 'a/b/AssetAssistant/Dpr.bin', size: 1 },
      { path: 'a/AssetAssistant/Dpr.bin', size: 1 },
    ]
    expect(findRoot(entries)).toBe('a/AssetAssistant')
  })

  it('없으면 null이다', () => {
    expect(findRoot([{ path: 'romfs/Data/StreamingAssets/Other/x', size: 1 }])).toBeNull()
  })
})

describe('폴더 판정', () => {
  it('제대로 된 덤프를 통과시킨다', async () => {
    const got = await scanBdsp(memoryDirSource(goodTree()))
    expect(got.ok ? 'ok' : got.why).toBe('ok')
    if (!got.ok) return
    expect(got.root).toBe('romfs/Data/StreamingAssets/AssetAssistant')
    expect(got.groups).toHaveLength(REQUIRED_GROUPS.length)
    expect(got.groups.every((g) => g.index && g.bundles > 0)).toBe(true)
    expect(got.bytes).toBeGreaterThan(0)
  })

  it('AssetAssistant를 못 찾으면 키나 컨테이너를 요구하지 않는다', async () => {
    // ⚠️ COPYRIGHT.md §4 — "이미 추출된 지원 폴더가 필요합니다"에서 멈춘다
    const got = await scanBdsp(memoryDirSource({ 'romfs/Data/boot.config': 10 }))
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.reason).toBe('no-root')
    expect(got.why).toContain('이미 추출된')
    expect(got.why).not.toMatch(/키|nsp|nca|복호|prod\.keys/i)
  })

  it('빠진 묶음을 이름으로 말한다', async () => {
    const files = goodTree()
    delete files['romfs/Data/StreamingAssets/AssetAssistant/Environments.bin']
    delete files['romfs/Data/StreamingAssets/AssetAssistant/Environments/Environments']
    const got = await scanBdsp(memoryDirSource(files))
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.reason).toBe('missing-groups')
    expect(got.why).toContain('Environments.bin')
    // 어디까지 됐는지는 보여 준다 — 다시 고를 때 판단할 근거다
    expect(got.root).toBeTruthy()
    expect(got.groups?.filter((g) => g.index)).toHaveLength(REQUIRED_GROUPS.length - 1)
  })

  it('⚠️ 색인만 있고 번들이 없으면 거절한다', async () => {
    // 중간에 끊긴 추출에서 흔하다. 통과시키면 설치를 한참 돌린 뒤에 터진다
    const files = goodTree()
    for (const k of Object.keys(files)) {
      if (k.includes('/Battle/')) delete files[k]
    }
    const got = await scanBdsp(memoryDirSource(files))
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.reason).toBe('empty-groups')
      expect(got.why).toContain('Battle')
    }
  })

  it('⚠️ 포켓몬 번들이 한 벌뿐이면 거절한다', async () => {
    // 프리팹·공용 메시·폼별 텍스처가 나뉘어 있다. 하나만 보고 통과시키면
    // 그 종을 실제로 열 때가 되어서야 없다는 것을 안다
    const files = goodTree()
    delete files['romfs/Data/StreamingAssets/AssetAssistant/Pokemon Database/pokemons/battle/pm0387_00_01']
    const got = await scanBdsp(memoryDirSource(files))
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.reason).toBe('no-samples')
      expect(got.why).toContain('pm0387')
    }
  })

  it('AssetAssistant를 직접 골라도 된다', async () => {
    const got = await scanBdsp(memoryDirSource(goodTree('AssetAssistant')))
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.root).toBe('AssetAssistant')
  })
})

// ── 진짜 폴더 ────────────────────────────────────────────────────────────────

interface RawSources { sourceDir(name: string): string | null }
const rawSources = createRequire(import.meta.url)('../../../tools/raw/sources.cjs') as RawSources

/** 개발 기계의 BDSP 하위 집합. 없으면 건너뛴다 */
function bdspRoot(): string | null {
  return rawSources.sourceDir('bdsp.root')
}

const withBdsp: (name: string, body: () => void) => void =
  bdspRoot() === null ? vitestDescribe.skip : vitestDescribe

/** 디스크 폴더를 `DirSource`로. 브라우저 쪽과 같은 계약이다 */
function diskDirSource(root: string): DirSource {
  const walk = (at: string, rel: string): DirEntry[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((e) => {
      const child = join(at, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) return walk(child, childRel)
      return [{ path: childRel, size: statSync(child).size }]
    })
  return {
    label: root,
    list: () => Promise.resolve(walk(root, '')),
    read: () => Promise.resolve(null),
  }
}

withBdsp('진짜 BDSP 폴더', () => {
  it('⚠️ 개발 하위 집합은 공개 판정을 통과하지 못한다 — 그것이 맞다', async () => {
    // 개발 기계의 `raw/bdsp`는 필요한 것만 골라 **재배치한** 것이다
    // (IMPORT.md §9 표). 공개 Importer가 받는 것은 원래 구조의
    // `AssetAssistant`이므로, 여기가 통과하면 판정이 헐거운 것이다
    const got = await scanBdsp(diskDirSource(bdspRoot()!))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.reason).toBe('no-root')
  })

  it('덤프 목록에 실측 구조가 실제로 그렇게 적혀 있다', () => {
    // 위 판정의 근거. `fstree.txt`는 추출할 때 받아 둔 원본 트리다
    const tree = join(bdspRoot()!, 'fstree.txt')
    if (!existsSync(tree)) return
    const text = readdirSync(bdspRoot()!).join(' ')
    expect(text).toContain('fstree.txt')
  })
})
