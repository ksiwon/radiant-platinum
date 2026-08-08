// 오프라인 껍데기 검증 (PLAN §4.6)
//
// ⚠️ **서비스 워커는 시험이 못 돌린다** — 브라우저 안에서만 사는 것이라
// vitest에 `caches`도 `clients`도 없다. 대신 **틀린 값이 들어갈 자리**를 잰다:
// 매니페스트가 가리키는 파일이 실제로 있는가, 워커가 571MB를 미리 받으려
// 들지는 않는가.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

interface Manifest {
  name: string
  start_url: string
  display: string
  icons: { src: string; sizes: string; type: string }[]
}

describe('홈 화면에 설치되는 것', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as Manifest

  it('가리키는 아이콘이 실제로 있다', () => {
    // 없는 아이콘을 적어 두면 설치 배너가 조용히 안 뜬다
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(ROOT, 'public', icon.src)), icon.src).toBe(true)
    }
  })

  it('상대 경로다 — 하위 경로에 올려도 열린다', () => {
    // GitHub Pages처럼 `/repo/` 아래에 올라가면 절대 경로는 전부 깨진다
    expect(manifest.start_url.startsWith('.')).toBe(true)
    for (const icon of manifest.icons) expect(icon.src.startsWith('/')).toBe(false)
  })

  it('index.html이 매니페스트를 건다', () => {
    const html = read('index.html')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('manifest.webmanifest')
  })
})

describe('서비스 워커', () => {
  const sw = read('public/sw.js')

  it('⚠️ 에셋을 미리 받지 않는다', () => {
    // 롬에서 나온 것이 571MB다. 설치할 때 다 끌어오면 저장 한도에 부딪히고
    // 처음 여는 데 몇 분이 걸린다 — 미리 받는 목록에 `data/`·`models/`가
    // 들어가는 순간 그렇게 된다
    const list = /const SHELL_FILES = \[([\s\S]*?)\]/.exec(sw)?.[1] ?? ''
    expect(list).not.toContain('data/')
    expect(list).not.toContain('models/')
    expect(list).toContain('index.html')
  })

  it('화면 이동은 네트워크가 먼저다', () => {
    // 캐시가 먼저면 새로 배포한 판이 영영 안 뜬다
    const nav = sw.slice(sw.indexOf("req.mode === 'navigate'"))
    expect(nav.indexOf('fetch(req)')).toBeLessThan(nav.indexOf('caches.match'))
  })

  it('남의 오리진은 안 건드린다', () => {
    // 에셋이 R2로 갈라지는 날(§4.6) 그쪽까지 우리 캐시에 담으면 안 된다
    expect(sw).toContain('url.origin !== self.location.origin')
  })
})
