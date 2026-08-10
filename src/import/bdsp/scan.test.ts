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

const indices = (prefix: string): DirEntry[] =>
  REQUIRED_GROUPS.map((g) => ({ path: prefix ? `${prefix}/${g.name}.bin` : `${g.name}.bin`, size: 1 }))

describe('AssetAssistant 찾기', () => {
  it('상위 폴더를 골라도 아래에서 찾는다', () => {
    expect(findRoot(indices('romfs/Data/StreamingAssets/AssetAssistant')))
      .toBe('romfs/Data/StreamingAssets/AssetAssistant')
  })

  it('⚠️ 폴더 자체를 골라도 찾는다 — 상대 경로에 이름이 안 나온다', () => {
    // 이름으로 찾던 시절에는 제대로 된 덤프를 직접 골라 놓고 no-root가 떴다
    expect(findRoot(indices(''))).toBe('')
  })

  it('이름이 달라도 색인이 다 있으면 찾는다', () => {
    expect(findRoot(indices('내려받은것'))).toBe('내려받은것')
  })

  it('⚠️ 겹쳐 둔 덤프에서는 얕은 쪽을 고른다', () => {
    // 깊은 쪽을 잡으면 사용자가 왜 그게 골라졌는지 알 수 없다
    expect(findRoot([...indices('a/b/AssetAssistant'), ...indices('a/AssetAssistant')]))
      .toBe('a/AssetAssistant')
  })

  it('같은 깊이면 AssetAssistant라는 이름을 고른다', () => {
    expect(findRoot([...indices('a/사본'), ...indices('a/AssetAssistant')])).toBe('a/AssetAssistant')
  })

  it('⚠️ 색인 하나가 빠져도 뿌리로는 잡는다 — 무엇이 빠졌는지 말해 주려는 것이다', () => {
    const all = indices('x/AssetAssistant')
    expect(findRoot(all.slice(1))).toBe('x/AssetAssistant')
  })

  it('색인이 하나도 없으면 null이다', () => {
    expect(findRoot([{ path: 'AssetAssistant/Characters/persons/field/fc0001_00', size: 1 }])).toBeNull()
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

/**
 * 디스크 폴더를 `DirSource`로. 브라우저 쪽과 같은 계약이다.
 *
 * `prefix`를 주면 상대 경로 앞에 그것을 붙인다 — "한 칸 위를 골랐다"를 흉내 내는
 * 것이다. ⚠️ 진짜로 `raw/`를 걸으면 10GB를 훑는다. 상위 선택에서 달라지는 것은
 * **경로 앞칸뿐**이므로 그것만 흉내 낸다
 */
function diskDirSource(root: string, prefix = ''): DirSource {
  const walk = (at: string, rel: string): DirEntry[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((e) => {
      const child = join(at, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) return walk(child, childRel)
      return [{ path: childRel, size: statSync(child).size }]
    })
  return {
    label: root,
    list: () => Promise.resolve(walk(root, prefix)),
    read: () => Promise.resolve(null),
  }
}

withBdsp('진짜 BDSP 폴더', () => {
  it('⚠️ 폴더를 직접 골랐을 때 통과한다', async () => {
    // 공개 Importer가 받는 것과 **같은 계약**이다: 상대 경로가 뿌리 아래에서
    // 시작한다. 이 자리가 한때 `no-root`였다
    const got = await scanBdsp(diskDirSource(bdspRoot()!))
    expect(got.ok ? 'ok' : `${got.reason}: ${got.why}`).toBe('ok')
    if (!got.ok) return
    expect(got.root).toBe('')
    expect(got.groups.every((g) => g.index && g.bundles > 0)).toBe(true)
    expect(got.files).toBeGreaterThan(10_000)
  })

  it('⚠️ 상위 폴더를 골라도 같은 답이 나온다', async () => {
    const name = bdspRoot()!.split(/[\\/]/).pop()!
    const got = await scanBdsp(diskDirSource(bdspRoot()!, name))
    expect(got.ok ? 'ok' : `${got.reason}: ${got.why}`).toBe('ok')
    if (got.ok) expect(got.root).toBe(name)
  })

  it('필수 그룹 다섯의 색인과 폴더가 다 있다', () => {
    for (const { name } of REQUIRED_GROUPS) {
      expect(existsSync(join(bdspRoot()!, `${name}.bin`)), `${name}.bin`).toBe(true)
      expect(statSync(join(bdspRoot()!, name)).isDirectory(), name).toBe(true)
    }
  })
})
