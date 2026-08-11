// 게임 데이터를 뺀 것이 계속 빠져 있는가 (DEPLOY.md §4)
//
// ⚠️ **주장이 아니라 검사다.** 껍데기 규칙은 패키지가 올라 경로가 바뀌면 조용히
// 아무것도 안 맞게 된다 — 그러면 빌드는 통과하고 8.5MB가 그대로 나간다.
// 그래서 셋을 잰다: 규칙이 실제 파일과 맞는가, 배포물에 표가 없는가, `eval(`이 없는가.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { KEPT, SHIMS } from './pkmnDiet.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * 설치된 `@pkmn/sim`의 `build/esm` 자리.
 *
 * ⚠️ `require.resolve('@pkmn/sim/package.json')`은 안 된다 — 그 패키지의
 * `exports`가 `./package.json`을 안 연다. 진입점을 풀어 거슬러 올라간다
 */
function esmDir() {
  const at = execFileSync(
    'node', ['-e', "process.stdout.write(require.resolve('@pkmn/sim'))"],
    { cwd: ROOT, encoding: 'utf8' },
  ).replace(/\\/g, '/')
  const cut = at.indexOf('/build/')
  if (cut < 0) throw new Error(`@pkmn/sim 진입점이 build/ 아래가 아니다: ${at}`)
  return resolve(at.slice(0, cut), 'build/esm')
}

/** 그 아래 `.mjs` 전부 (esm 상대 경로) */
function allModules(dir, rel = '') {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) { out.push(...allModules(join(dir, e.name), childRel)); continue }
    if (e.name.endsWith('.mjs')) out.push(childRel)
  }
  return out
}

const distFiles = () => {
  const dist = resolve(ROOT, 'dist/assets')
  if (!existsSync(dist)) return []
  return readdirSync(dist).filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: f, text: readFileSync(join(dist, f), 'utf8') }))
}

describe('껍데기 규칙이 실제 파일과 맞는다', () => {
  const modules = allModules(esmDir())

  it('규칙마다 실제로 맞는 파일이 있다 — 패키지가 올라도 조용히 안 빗나간다', () => {
    for (const shim of SHIMS) {
      const hit = modules.filter((m) => shim.match.test(m))
      expect(hit.length, `${String(shim.match)}에 맞는 파일이 없다`).toBeGreaterThan(0)
    }
  })

  it('껍데기가 원본과 같은 이름을 내보낸다', () => {
    // 이름 하나만 어긋나도 `dex.mjs`가 `undefined`를 스프레드한다
    for (const shim of SHIMS) {
      // 껍데기는 두 꼴이다: 빈 표(`export const X = {}`)와 우리 표를 다시
      // 내보내는 것(`export { X, Y } from '…'`). 둘 다에서 이름을 뽑는다
      const names = [
        ...[...shim.source.matchAll(/export const (\w+)/g)].map((m) => m[1]),
        ...[...shim.source.matchAll(/export \{([^}]*)\} from/g)]
          .flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean)),
      ]
      if (names.length === 0) continue   // `export {}` — 모드 index는 이름이 없다
      const sample = modules.find((m) => shim.match.test(m))
      const real = readFileSync(join(esmDir(), sample), 'utf8')
      for (const name of names) {
        // 원본도 두 꼴이다 — `data/index.mjs`는 다시 내보내기만 한다
        expect(real, `${sample}에 ${name}이 없다`)
          .toMatch(new RegExp(`export (const ${name}\\b|\\{[^}]*\\b${name}\\b)`))
      }
    }
  })

  it('안 갈아 끼운 것마다 이유가 적혀 있다 — 지금은 하나도 없다', () => {
    for (const k of KEPT) expect(k.why.length, k.file).toBeGreaterThan(10)
  })

  it('굽기가 안 낡았다 — 설치된 패키지로 다시 구워도 같은 파일이 나온다', () => {
    // ⚠️ **낡으면 배포판만 조용히 옛 구현으로 돈다.** 패키지를 올려도 `src/`의
    // 생성물은 그대로이기 때문이다. 여기서 다시 구워 맞대 본다
    execFileSync('node', ['tools/distribution/mechanics/bake.mjs', '--check'], { cwd: ROOT })
  })

  it('`data/` 아래 모듈이 하나도 안 남는다', () => {
    // 하나라도 남으면 그 표가 배포물에 실린다. 규칙이 전부를 덮는지 여기서 센다
    const left = modules.filter((m) => m.startsWith('data/') && !SHIMS.some((s) => s.match.test(m)))
    expect(left).toEqual([])
  })
})

describe('배포물에 표가 없다', () => {
  const files = distFiles()
  const auditAt = resolve(ROOT, '.audit/bundle-provenance.json')
  const audit = existsSync(auditAt) ? JSON.parse(readFileSync(auditAt, 'utf8')) : null
  /** 배포물에 실제로 들어간 `@pkmn/sim` 모듈 (esm 상대 경로) */
  const shipped = audit
    ? audit.chunks.flatMap((c) => (c.forbidden ?? []).map((f) => ({
      rel: f.id.replace(/\\/g, '/').replace(/.*@pkmn\/sim\/build\/esm\//, ''), bytes: f.bytes,
    })))
    : []

  // ⚠️ **글자로 안 찾는다.** `learnset:`도 `shortDesc:`도 배포물에 남아 있는데
  // 그건 표가 아니라 그 표를 **다루는 코드**다 (`dex-species`의 `getFullLearnset`,
  // `dex`의 `getDescs`). 글자로 세면 그 둘을 못 가른다. 모듈 단위로 센다
  it.skipIf(!audit)('껍데기로 바꾼 모듈이 배포물에 하나도 없다', () => {
    const leaked = shipped.filter((m) => SHIMS.some((s) => s.match.test(m.rel)))
    expect(leaked.map((m) => m.rel)).toEqual([])
  })

  it.skipIf(!audit)('남은 것은 `KEPT`에 적힌 것뿐이다', () => {
    // 규칙에도 안 걸리고 적혀 있지도 않은 모듈이 있으면, 아무도 판단 안 한 표가
    // 배포물에 있다는 뜻이다
    const listed = (rel) => KEPT.some((k) => rel === k.file || rel.startsWith(k.file))
    expect(shipped.filter((m) => !listed(m.rel)).map((m) => m.rel)).toEqual([])
  })

  it.skipIf(!audit)('배포물에 남은 표가 0바이트다', () => {
    // 8,881,507 → 1,732,260 → 0 (실측). 되돌아오면 여기서 잡는다
    expect(shipped.reduce((a, m) => a + m.bytes, 0)).toBe(0)
  })

  it.skipIf(files.length === 0)('⚠️ `eval(`이 한 군데도 없다 — CSP를 열 이유가 없다', () => {
    for (const f of files) {
      expect(f.text.includes('eval('), `${f.name}에 eval(이 있다`).toBe(false)
    }
  })

  it.skipIf(files.length === 0)('배틀 청크가 예전의 4분의 1 아래다', () => {
    const battle = files.find((f) => f.name.startsWith('battle-sim'))
    expect(battle, '배틀 청크가 없다').toBeTruthy()
    const bytes = statSync(resolve(ROOT, 'dist/assets', battle.name)).size
    // 6,547kB였다. 남은 것은 코드와 코드에 섞인 표뿐이다
    expect(bytes).toBeLessThan(6_547_032 / 4)
  })
})
