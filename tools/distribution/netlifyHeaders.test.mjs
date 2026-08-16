// `netlify.toml`이 헤더 정본과 어긋나지 않는가 (DEPLOY.md §3)
//
// ⚠️ **손으로 옮긴 값은 반드시 낡는다.** CSP는 `csp.mjs`가 정본인데 호스트
// 설정에는 그 값을 문자열로 한 번 더 적어야 한다 — 호스트가 우리 자바스크립트를
// 안 부르기 때문이다. 그래서 **여기서 두 벌을 맞춰 본다.** 이게 없으면 어긋난
// 것을 `pnpm verify:deploy`로, 즉 **이미 올린 뒤에** 알게 된다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
