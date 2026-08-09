// 배포 경계 규칙 (COPYRIGHT.md §6 · PLAN §14.1)
//
// ⚠️ **이 시험이 없으면 검사기가 조용히 아무것도 안 잡을 수 있다.** 정규식 하나가
// 죽으면 위반 0건이 되고, 그 0건은 "깨끗하다"와 화면에서 구별이 안 된다. 그래서
// **잡혀야 하는 것이 실제로 잡히는지**를 먼저 잰다.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathViolations, scanTree, originsIn, listTree } from './rules.mjs'
import { collectShell, PUBLIC_SHELL } from './appShell.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

describe('경로 규칙', () => {
  it('원본 유래 나무를 잡는다', () => {
    // 이 둘이 실제로 dist에 645MB 들어가 있었다
    expect(pathViolations('data/species.json')).toContain("원본 유래 나무 'data/'")
    expect(pathViolations('models/pokemon/387.glb').length).toBeGreaterThan(0)
  })

  it('원본·컨테이너·키를 잡는다', () => {
    for (const f of [
      'x/Pokemon Platinum (KO).nds', 'x/pl_sound_data.sdat', 'x/game.nsp',
      'x/prod.keys', 'x/bundle.bundle', 'x/scripts.bin',
    ]) {
      expect(pathViolations(f), f).not.toEqual([])
    }
  })

  it('폴더 이름이 한 칸만 들어가도 잡는다', () => {
    // `dist/x/raw/y.js`처럼 깊이 숨어도 걸려야 한다
    expect(pathViolations('assets/raw/thing.js')).toContain("금지된 폴더 이름 'raw'")
    expect(pathViolations('a/AssetAssistant/b.js').length).toBeGreaterThan(0)
    expect(pathViolations('a/romfs/b.js').length).toBeGreaterThan(0)
  })

  it('시험 자산을 잡는다', () => {
    expect(pathViolations('assets/romData.testkit-abc123.js').length).toBeGreaterThan(0)
    expect(pathViolations('assets/gameData.test-x.js').length).toBeGreaterThan(0)
  })

  it('앱 셸은 통과한다 — 다 막으면 아무것도 못 낸다', () => {
    for (const f of [
      'index.html', 'sw.js', 'manifest.webmanifest',
      'assets/index-DkH2f.js', 'assets/index-91ab.css',
      'assets/radiant-platinum-icon.png', 'assets/font.woff2',
    ]) {
      expect(pathViolations(f), f).toEqual([])
    }
  })

  it('대소문자로 못 빠져나간다', () => {
    // Windows에서 만든 경로가 `Data/`로 들어와도 같은 것이다
    expect(pathViolations('Data/Species.JSON').length).toBeGreaterThan(0)
    expect(pathViolations('x/POKEMON.GLB').length).toBeGreaterThan(0)
  })
})

describe('바깥 에셋 오리진', () => {
  it('문서 링크는 오리진이 아니다', () => {
    // ⚠️ 처음엔 "바깥 주소가 하나라도 있으면 실패"였고 실측 위반이 10,988건
    // 나왔다. 거의 전부가 라이브러리 오류 문구의 문서 링크였다 — 그런 글자는
    // 네트워크를 안 탄다. 다 빨갛게 두면 검사를 아무도 안 본다
    expect(originsIn('<svg xmlns="http://www.w3.org/2000/svg">')).toEqual([])
    expect(originsIn('throw Error("see https://react.dev/link/x and https://github.com/a/b")'))
      .toEqual([])
    expect(originsIn('// https://www.shadertoy.com/view/4df3Dn')).toEqual([])
  })

  it('에셋 뿌리는 잡는다 — 주소 뒤에 곧바로 data/·models/가 붙는 것', () => {
    expect(originsIn('fetch("https://pages.example.com/data/maps.json")'))
      .toEqual(['pages.example.com'])
    expect(originsIn('load("https://x.example.com/models/pokemon/387.glb")'))
      .toEqual(['x.example.com'])
  })

  it('오브젝트 스토리지 모양은 경로 없이도 잡는다', () => {
    expect(originsIn('const B="https://pt-assets.r2.dev/"')).toEqual(['pt-assets.r2.dev'])
    expect(originsIn('"https://cdn.example.com/x"')).toEqual(['cdn.example.com'])
    expect(originsIn('"https://bucket.s3.amazonaws.com/x"')).toEqual(['bucket.s3.amazonaws.com'])
  })
})

describe('나무 훑기', () => {
  it('없는 나무는 빈 목록이다 — 깨끗한 clone에서도 돌아야 한다', () => {
    expect(listTree(join(ROOT, '이런-폴더는-없다'))).toEqual([])
    expect(scanTree(join(ROOT, '이런-폴더는-없다')).violations).toEqual([])
  })

  it('심어 둔 위반을 실제로 찾아낸다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-boundary-'))
    try {
      mkdirSync(join(dir, 'assets'))
      mkdirSync(join(dir, 'data'))
      writeFileSync(join(dir, 'index.html'), '<!doctype html>')
      writeFileSync(join(dir, 'assets', 'index-abc.js'), 'console.log(1)')
      writeFileSync(join(dir, 'data', 'species.json'), '{}')
      writeFileSync(join(dir, 'assets', 'cdn-abc.js'), 'fetch("https://x.r2.dev/data/a.json")')

      const scan = scanTree(dir, { label: 'dist' })
      const why = scan.violations.map((v) => `${v.file}: ${v.why}`)

      expect(scan.files).toHaveLength(4)
      expect(why).toContain("dist/data/species.json: 원본 유래 나무 'data/'")
      expect(why).toContain("dist/assets/cdn-abc.js: 바깥 오리진 'x.r2.dev'")
      // 멀쩡한 둘은 안 걸린다
      expect(why.filter((w) => w.startsWith('dist/index.html'))).toEqual([])
      expect(why.filter((w) => w.startsWith('dist/assets/index-abc.js'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('앱 셸 목록', () => {
  it('허용 목록이 규칙을 스스로 어기지 않는다', () => {
    for (const rel of collectShell(join(ROOT, 'public'))) {
      expect(pathViolations(rel), rel).toEqual([])
    }
  })

  it('데이터 나무는 목록에 없다', () => {
    const named = PUBLIC_SHELL.map((e) => e.path)
    expect(named).not.toContain('data')
    expect(named).not.toContain('models')
    expect(named).toContain('sw.js')
  })

  it('vite가 public을 통째로 복사하지 못하게 돼 있다', async () => {
    // 이 한 줄이 되돌아가면 645MB가 다시 나간다
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toMatch(/copyPublicDir:\s*false/)
  })
})
