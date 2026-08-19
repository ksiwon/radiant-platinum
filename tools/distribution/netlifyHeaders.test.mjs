// `netlify.toml`이 헤더 정본과 어긋나지 않는가 (DEPLOY.md §3)
//
// ⚠️ **손으로 옮긴 값은 반드시 낡는다.** CSP는 `csp.mjs`가 정본인데 호스트
// 설정에는 그 값을 문자열로 한 번 더 적어야 한다 — 호스트가 우리 자바스크립트를
// 안 부르기 때문이다. 그래서 **여기서 두 벌을 맞춰 본다.** 이게 없으면 어긋난
// 것을 `pnpm verify:deploy`로, 즉 **이미 올린 뒤에** 알게 된다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { cspHeader, EXTRA_HEADERS } from './csp.mjs'

const AT = resolve(import.meta.dirname, '../../netlify.toml')
const toml = readFileSync(AT, 'utf8')

/**
 * `이름 = "값"` 한 줄에서 값을 꺼낸다.
 *
 * ⚠️ TOML 파서를 안 들인다 — 우리가 쓴 파일이고 모양이 한 줄짜리 문자열뿐이라
 * 의존성 하나를 더 지는 값이 없다. 대신 **못 찾으면 null**을 주고 시험이 선다
 */
function value(key) {
  const hit = new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"\\s*$`, 'm').exec(toml)
  return hit ? hit[1] : null
}

describe('netlify.toml', () => {
  it('CSP가 정본과 한 글자도 안 다르다', () => {
    expect(value('Content-Security-Policy')).toBe(cspHeader())
  })

  // 셋을 한 줄씩 따로 본다 — 하나가 빠졌을 때 어느 것인지 이름으로 보여야 한다
  for (const [name, want] of Object.entries(EXTRA_HEADERS)) {
    it(`${name}가 정본과 같다`, () => {
      expect(value(name)).toBe(want)
    })
  }

  it('HSTS를 붙인다 — 호스트가 https로 준다', () => {
    expect(value('Strict-Transport-Security')).toBe('max-age=31536000')
  })

  it('COEP는 안 켠다 — 켜면 blob:/data: 규칙이 OPFS 경로를 흔든다', () => {
    expect(value('Cross-Origin-Embedder-Policy')).toBeNull()
  })

  it('모든 경로에 붙인다', () => {
    expect(/^\s*for\s*=\s*"\/\*"\s*$/m.test(toml)).toBe(true)
  })

  it('SPA fallback — 없는 경로는 index.html이고 200이다', () => {
    // `tools/e2e/serve.mjs`가 재는 것과 같은 모양이어야 한다
    expect(value('from')).toBe('/*')
    expect(value('to')).toBe('/index.html')
    expect(/^\s*status\s*=\s*200\s*$/m.test(toml)).toBe(true)
  })

  it('배포 폴더는 dist다', () => {
    expect(value('publish')).toBe('dist')
    expect(value('command')).toBe('pnpm build')
  })
})

// ── 안 굽고 넘기는 규칙 ──────────────────────────────────────────────────────
//
// ⚠️ **여기가 틀리면 고쳐도 안 올라간다.** `ignore`가 exit 0을 내면 그 푸시는
// 통째로 건너뛴다. 목록에 빠진 자리를 고치면 배포가 **조용히** 안 나가고, 화면은
// 옛 번들 그대로다 — 눈으로는 「왜 안 바뀌지」로만 보인다.

/** TOML 리터럴 문자열(작은따옴표)에서 값을 꺼낸다. 셸 명령이라 큰따옴표가 들어 있다 */
const ignoreRule = (() => {
  const hit = /^\s*ignore\s*=\s*'(.*)'\s*$/m.exec(toml)
  return hit ? hit[1] : null
})()

/**
 * 리포 뿌리에 있는 것들 — 어느 쪽인지 **하나도 안 빠뜨리고** 갈라야 한다.
 *
 * 여기 안 적힌 뿌리가 새로 생기면 시험이 선다. 그때 「배포물의 재료인가」를
 * 정해서 `ignore` 목록에 넣거나 아래에 이유와 함께 적는다
 */
const NOT_IN_BUNDLE = new Set([
  '.gitignore', 'README.md',
  // 문서. `dist`에서 0건이다 (`copyPublicDir: false` + 앱 셸 허용 목록)
  'docs',
  // 원본 그림·설정 예시. 배포물은 `public/`에 구워 둔 것만 쓴다
  'art', 'raw.sources.example.json',
  // 굽는 도구·시험. `tools/distribution`만 빌드를 세울 수 있어서 그것만 넣었다
  'tools',
  // 시험·린트 설정. 배포물에 안 들어가고 빌드도 안 세운다
  'eslint.config.js', 'vitest.shimmed.config.ts',
])

describe('netlify.toml — 안 굽고 넘기는 규칙', () => {
  it('규칙이 있고 exit 0이 「건너뜀」이다', () => {
    expect(ignoreRule).not.toBeNull()
    expect(ignoreRule).toContain('git diff --quiet')
  })

  // ⚠️ 이게 없으면 **첫 빌드를 건너뛴다.** 인자가 하나면 `git diff`는 작업 트리와
  // 견주는데, 체크아웃한 것이 바로 그 커밋이라 차이가 0으로 나온다
  it('CACHED_COMMIT_REF가 비면 굽는다', () => {
    expect(ignoreRule).toContain('[ -n "$CACHED_COMMIT_REF" ]')
    expect(ignoreRule).toContain('[ -n "$COMMIT_REF" ]')
    expect(ignoreRule?.indexOf('[ -n')).toBeLessThan(ignoreRule?.indexOf('git diff') ?? -1)
  })

  it('배포물의 재료를 하나도 안 빠뜨린다', () => {
    const watched = new Set((ignoreRule ?? '').split(' -- ')[1]?.split(' ') ?? [])
    // Git이 아는 뿌리 전부. 새 뿌리가 생기면 여기서 갈린다
    const roots = new Set(
      execFileSync('git', ['ls-files'], { encoding: 'utf8' })
        .trim().split('\n').map((f) => f.split('/')[0]),
    )
    const unclaimed = [...roots].filter((r) => !watched.has(r) && !NOT_IN_BUNDLE.has(r))
    expect(unclaimed, '새 뿌리다 — ignore 목록이나 NOT_IN_BUNDLE 중 한쪽에 적어라')
      .toEqual([])
    // 반대쪽도 본다: 보고 있다고 적어 놓고 리포에 없는 자리는 오타다
    const gone = [...watched].filter((w) => !roots.has(w.split('/')[0]))
    expect(gone, 'ignore가 없는 자리를 보고 있다').toEqual([])
  })

  it('보는 자리에 소스와 빌드 설정이 다 들어 있다', () => {
    for (const need of [
      'src', 'public', 'index.html', 'vite.config.ts',
      'package.json', 'pnpm-lock.yaml', 'netlify.toml', 'tools/distribution',
    ]) {
      expect(ignoreRule, need).toContain(` ${need}`)
    }
  })
})
