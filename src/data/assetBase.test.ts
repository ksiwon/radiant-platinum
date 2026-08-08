// 에셋 뿌리 (COPYRIGHT.md §6)
//
// ⚠️ **오늘은 틀려도 안 깨진다.** 앱 셸과 에셋이 같은 오리진이라 어디서 셸
// 주소를 읽든 결과가 같다. 그래서 새로 쓰는 자리마다 조용히 는다 — 깨지는 것은
// 버킷을 갈라놓는 날이고, 그때는 스무 군데다.
//
// 그래서 두 가지를 잰다: 갈라놓았을 때 주소가 실제로 갈리는가, 그리고
// **지금 src에 그 자리가 몇 개인가.**
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ROOT, ASSET_BASE, assetUrl, dataUrl, modelUrl, resolveBase } from './assetBase'

const SRC = resolve(__dirname, '..')

/** `src` 아래 모든 ts·tsx */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = resolve(dir, e.name)
    if (e.isDirectory()) return sources(at)
    return /\.tsx?$/.test(e.name) ? [at] : []
  })
}

describe('에셋 뿌리', () => {
  it('설정이 없으면 앱 셸과 같은 자리다 — 지금 배포가 그대로 돈다', () => {
    expect(resolveBase(undefined, '/')).toBe('/')
    expect(resolveBase('', '/rp/')).toBe('/rp/')
    // 빈 칸만 든 값은 안 넣은 것과 같다. `.env`에 `VITE_ASSET_BASE= ` 한 줄이
    // 남아 있으면 주소가 `/data/…`가 아니라 ` /data/…`가 된다
    expect(resolveBase('   ', '/rp/')).toBe('/rp/')
    expect(ASSET_BASE).toBe(resolveBase(import.meta.env.VITE_ASSET_BASE, APP_ROOT))
  })

  it('설정이 있으면 오리진이 갈린다 — 이게 이 모듈의 존재 이유다', () => {
    const r2 = resolveBase('https://assets.example.dev/', '/')
    expect(r2).toBe('https://assets.example.dev/')
    expect(r2.startsWith('/')).toBe(false)
  })

  it('뒤 슬래시를 붙여 준다 — 사람이 손으로 넣는 값이다', () => {
    expect(resolveBase('https://assets.example.dev', '/')).toBe('https://assets.example.dev/')
    expect(resolveBase('/rp', '/')).toBe('/rp/')
  })

  it('앞 슬래시가 붙어 와도 두 겹이 안 된다', () => {
    // `//`는 오리진에 따라 404가 되거나, 되더라도 캐시가 두 벌로 갈린다
    expect(assetUrl('/data/maps.json')).toBe(assetUrl('data/maps.json'))
    expect(assetUrl('data/maps.json')).not.toContain('//data')
  })

  it('자료와 모델이 서로 다른 갈래다', () => {
    expect(dataUrl('maps.json')).toBe(`${ASSET_BASE}data/maps.json`)
    expect(modelUrl('dawn.glb')).toBe(`${ASSET_BASE}models/dawn.glb`)
  })

  it('src에서 BASE_URL을 읽는 곳은 이 모듈 하나뿐이다', () => {
    // ⚠️ 이 시험 자신이 걸리지 않게 글자를 쪼개 둔다
    const needle = 'import' + '.meta.env.' + 'BASE_URL'
    const hits = sources(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes(needle))
      .map((f) => f.replace(/\\/g, '/').replace(/.*\/src\//, 'src/'))
    // lint도 같은 것을 막지만(`BASE_URL_FORBIDDEN`), 플랫 설정은 같은 규칙을 두
    // 블록에 쓰면 뒤가 앞을 통째로 덮는다 — 이 리포에서 실제로 한 번 그렇게
    // 죽었다. 규칙이 죽어도 이 숫자는 안 죽는다
    expect(hits).toEqual(['src/data/assetBase.ts'])
  })
})
