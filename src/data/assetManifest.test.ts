// 에셋 매니페스트 (COPYRIGHT.md §5 · §6)
//
// `assets-manifest.json`은 "있어야 할 것"의 목록이다. 이게 틀리면 새 기계에서
// **없는 것이 없는 줄 모른 채** 개발이 시작된다 — 0단계가 막은 것과 같은 종류의
// 조용한 실패다.
//
// ⚠️ 여기서 디스크를 훑는 코드는 `tools/assets/manifest.mjs`와 **따로 쓴 것**이다.
// 같은 함수를 불러서 비교하면 그 함수가 틀렸을 때 둘 다 같이 틀린다.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withData, withModels } from './romData.testkit'

const ROOT = resolve(__dirname, '../..')
const PUBLIC = resolve(ROOT, 'public')

interface Manifest {
  version: number
  groups: Record<string, {
    make: string
    count: number
    bytes: number
    files: Record<string, [number, string]>
  }>
}

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'assets-manifest.json'), 'utf8')) as Manifest
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

const groups = Object.entries(manifest.groups)
const allFiles = groups.flatMap(([name, g]) => Object.keys(g.files).map((f) => [f, name] as const))

/** `public/<tree>` 아래 실제 파일 (뿌리 기준 상대) */
function onDisk(tree: string): string[] {
  const walk = (dir: string, prefix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const rel = `${prefix}/${e.name}`
      return e.isDirectory() ? walk(resolve(dir, e.name), rel) : [rel]
    })
  return walk(resolve(PUBLIC, tree), tree)
}

describe('에셋 매니페스트', () => {
  it('그룹마다 다시 만드는 명령이 실제로 있다', () => {
    expect(groups.length).toBeGreaterThan(20)
    for (const [name, g] of groups) {
      const pnpm = /^pnpm ([\w:]+)$/.exec(g.make)
      if (pnpm) {
        // ⚠️ 없는 스크립트를 적어 두면 그게 제일 나쁘다 — 시키는 대로 쳤는데
        // "command not found"가 나면 자료를 만드는 길이 있는지조차 알 수 없다
        expect(pkg.scripts, `${name}: ${g.make}`).toHaveProperty(pnpm[1]!)
        continue
      }
      // 파이썬·node 직접 호출. 첫 번째 `tools/…` 조각이 실재해야 한다
      const file = g.make.split(' ').find((w) => w.startsWith('tools/'))
      expect(file, `${name}: ${g.make}에 도구 경로가 없다`).toBeDefined()
      expect(() => statSync(resolve(ROOT, file!)), `${name}: ${file!}`).not.toThrow()
    }
  })

  it('한 파일에 임자가 하나다', () => {
    // 두 그룹이 같은 파일을 들면 `--group=`으로 받을 때 한쪽이 다른 쪽을 덮는다
    const seen = new Map<string, string>()
    const twice: string[] = []
    for (const [file, name] of allFiles) {
      const before = seen.get(file)
      if (before) twice.push(`${file}: ${before} · ${name}`)
      else seen.set(file, name)
    }
    expect(twice).toEqual([])
  })

  it('센 값이 목록과 맞는다', () => {
    for (const [name, g] of groups) {
      const files = Object.values(g.files)
      expect(g.count, name).toBe(files.length)
      expect(g.bytes, name).toBe(files.reduce((a, [size]) => a + size, 0))
    }
  })

  it('경로가 둘 중 한 나무 아래다', () => {
    // `public/assets`(파비콘·인트로 그림)는 우리가 만든 것이라 대상이 아니다.
    // 들어오면 CDN으로 옮겨질 뻔한 것이므로 여기서 걸러야 한다 (COPYRIGHT.md §5)
    const stray = allFiles.filter(([f]) => !f.startsWith('data/') && !f.startsWith('models/'))
    expect(stray).toEqual([])
  })
})

withModels('dawn.glb', 'npc')('에셋 매니페스트 — 모델', () => {
  it('디스크와 목록이 같다', () => {
    const listed = new Set(allFiles.filter(([f]) => f.startsWith('models/')).map(([f]) => f))
    expect([...onDisk('models')].filter((f) => !listed.has(f))).toEqual([])
  })
})

withData('maps.json', 'chunks/index.json', 'sound/index.json')('에셋 매니페스트 — 자료', () => {
  it('디스크에 있는 것이 전부 목록에 있다 — 빠지면 새 기계에서 안 받는다', () => {
    const listed = new Set(allFiles.filter(([f]) => f.startsWith('data/')).map(([f]) => f))
    const missed = onDisk('data').filter((f) => !listed.has(f))
    // ⚠️ 추출기가 새 파일을 뱉기 시작하면 여기서 걸린다. `tools/assets/groups.mjs`에
    // 짝을 적고 `pnpm assets:manifest`를 다시 돌린다
    expect(missed).toEqual([])
  })

  it('목록의 크기가 디스크와 같다', () => {
    const wrong: string[] = []
    for (const [, g] of groups) {
      for (const [file, [size]] of Object.entries(g.files)) {
        if (!file.startsWith('data/')) continue
        const at = resolve(PUBLIC, file)
        let real: number
        try { real = statSync(at).size } catch { continue } // 없는 것은 위 시험 몫이 아니다
        if (real !== size) wrong.push(`${file}: ${size} → ${real}`)
      }
    }
    expect(wrong).toEqual([])
  })
})
