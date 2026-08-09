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

describe('앱 셸은 파일 단위다', () => {
  it('⚠️ 폴더가 목록에 없다 — 폴더 한 줄이면 그 아래는 심사가 없다', () => {
    // 한때 `{ kind: 'dir', path: 'assets' }` 한 줄이었다. `public/assets`에
    // 무엇을 떨어뜨리든 그대로 실려 나갔다
    for (const e of PUBLIC_SHELL) {
      expect(e.path, e.path).toMatch(/\.[a-z0-9]+$/)
    }
  })

  it('출처가 전부 적혀 있고 전부 자체 제작이다', () => {
    for (const e of PUBLIC_SHELL) {
      expect(e.origin, e.path).toBe('자체')
      expect(e.note?.length ?? 0, e.path).toBeGreaterThan(0)
    }
  })

  it('⚠️ 목록에 없는 파일이 심사 나무에 없다', async () => {
    const { unlistedShellFiles } = await import('./appShell.mjs')
    expect(unlistedShellFiles(join(ROOT, 'public'))).toEqual([])
  })

  it('목록에 없는 파일을 넣으면 잡는다 — 검사에 이빨이 있다', async () => {
    const { unlistedShellFiles } = await import('./appShell.mjs')
    const fake = mkdtempSync(join(tmpdir(), 'shell-'))
    try {
      mkdirSync(join(fake, 'assets'))
      writeFileSync(join(fake, 'assets', '몰래.png'), 'x')
      expect(unlistedShellFiles(fake)).toEqual(['assets/몰래.png'])
    } finally { rmSync(fake, { recursive: true, force: true }) }
  })

  it('문서에도 같은 목록이 적혀 있다', async () => {
    const { readFileSync } = await import('node:fs')
    const doc = readFileSync(join(ROOT, 'docs/APP_SHELL.md'), 'utf8')
    for (const e of PUBLIC_SHELL) expect(doc, e.path).toContain(e.path)
  })
})

describe('CSP 정본', () => {
  it('connect-src에 바깥 오리진이 없다 — 그것이 무전송 경계다', async () => {
    const { CSP, cspHeader } = await import('./csp.mjs')
    expect(CSP['connect-src']).toBe("'self' blob:")
    expect(cspHeader()).not.toMatch(/https?:/)
  })

  it("증명 없이 'wasm-unsafe-eval'을 넣지 않는다", async () => {
    const { cspHeader } = await import('./csp.mjs')
    expect(cspHeader()).not.toContain('wasm-unsafe-eval')
  })

  it('바깥 report endpoint가 없다 — 그 자체가 전송이다', async () => {
    const { cspHeader } = await import('./csp.mjs')
    expect(cspHeader()).not.toMatch(/report-(uri|to)/)
  })

  it('⚠️ meta에는 frame-ancestors를 안 넣는다 — 어차피 무시된다', async () => {
    const { cspMeta, cspHeader } = await import('./csp.mjs')
    expect(cspHeader()).toContain('frame-ancestors')
    expect(cspMeta()).not.toContain('frame-ancestors')
  })

  it('헤더와 정본이 어긋나면 잡는다', async () => {
    const { compareHeader, cspHeader } = await import('./csp.mjs')
    expect(compareHeader(cspHeader()).ok).toBe(true)
    expect(compareHeader('').missing.length).toBeGreaterThan(10)
    expect(compareHeader(cspHeader().replace("script-src 'self'", "script-src *")).differs)
      .toHaveLength(1)
  })
})

describe('release blocker', () => {
  it('⚠️ 각자 직접 잰다 — 손으로 지우는 목록이 아니다', async () => {
    const { BLOCKERS } = await import('./blockers.mjs')
    for (const b of BLOCKERS) {
      expect(typeof b.resolved, b.id).toBe('function')
      const state = b.resolved()
      expect(state, b.id).toHaveProperty('ok')
      if (!state.ok) expect(state.detail, b.id).toBeTruthy()
    }
  })

  it('문서 §1의 표와 같은 수다', async () => {
    const { readFileSync } = await import('node:fs')
    const { BLOCKERS } = await import('./blockers.mjs')
    const doc = readFileSync(join(ROOT, 'docs/DEPLOY.md'), 'utf8')
    // 표에 줄이 몇 개인가 — `| 1 |`처럼 번호로 센다
    const rows = doc.match(/^\| \d+ \| /gm) ?? []
    expect(rows).toHaveLength(BLOCKERS.length)
  })
})

describe('번들 출처', () => {
  it('@pkmn/sim 데이터 모듈을 알아본다', async () => {
    const { classify } = await import('./provenance.mjs')
    const data = classify('/x/node_modules/@pkmn/sim/build/esm/data/learnsets.mjs')
    expect(data.kind).toBe('의존성-데이터')
    expect(data.pkg).toBe('@pkmn/sim')
  })

  it('엔진 코드는 데이터가 아니다 — 통째로 막으면 배틀이 깨진다', async () => {
    const { classify } = await import('./provenance.mjs')
    expect(classify('/x/node_modules/@pkmn/sim/build/esm/sim/battle.mjs').kind).toBe('의존성-코드')
    expect(classify('/x/node_modules/three/build/three.module.js').kind).toBe('의존성-코드')
  })

  it('우리 코드는 앱이다', async () => {
    const { classify } = await import('./provenance.mjs')
    expect(classify('C:/repo/src/engine/battle/sim/bridge.ts').kind).toBe('앱')
  })

  it('windows 경로도 같게 본다', async () => {
    const { classify } = await import('./provenance.mjs')
    // 역슬래시 경로. 노드가 윈도에서 이 모양으로 준다
    const win = String.raw`C:\repo\node_modules\@pkmn\sim\build\esm\data\moves.mjs`
    expect(classify(win).kind).toBe('의존성-데이터')
  })
})
