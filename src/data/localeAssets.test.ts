// 설치본에는 **롬의 제 언어 한 벌만** 들어 있다 (REPAIR §29)
//
// `import/platinum/text.ts`가 `data/names/*.{로케일}.json`을 **`ctx.locale` 한
// 벌만** 굽는다. 그래서 코드가 다른 언어 파일을 이름으로 부르면 그 설치본에서
// 404다 — 개발 서버에는 `pnpm extract`가 구운 en·ja·ko 세 벌이 다 있어서
// **개발 중에는 절대 안 보인다.**
//
// 실제로 그 자리가 있었다: 배틀 화면이 `loadLabels('en')`을 같이 받았고, 한국판
// 롬으로 깐 사람에게는 그 한 파일 때문에 이름표 묶음이 통째로 깨졌다. 그러면
// 배틀 글이 안 만들어지고, 사건이 뷰에 안 접혀서 **포켓몬 칸도 모델도 로그도
// 통째로 안 떴다.**
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '..')

/**
 * 굽는 쪽과 시험은 뺀다.
 *
 * `import/`는 **만드는 쪽**이라 로케일을 손에 들고 있는 것이 맞고, 시험은
 * 자료를 직접 고른다
 */
const SKIP = ['import']

const slash = (path: string): string => relative(SRC, path).split(sep).join('/')

/** 주석을 지운다. 글 안의 `//`까지 가리지는 않지만 이 그물에는 넉넉하다 */
const bare = (text: string): string => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

function sources(at: string, out: string[] = []): string[] {
  for (const name of readdirSync(at)) {
    const path = resolve(at, name)
    const rel = slash(path)
    if (SKIP.some((s) => rel === s || rel.startsWith(`${s}/`))) continue
    if (statSync(path).isDirectory()) { sources(path, out); continue }
    // 시험과 그 재료는 개발 산출물을 직접 고른다 — 설치본을 안 읽는다
    if (!/\.tsx?$/.test(name) || /\.(test|testkit)\.tsx?$/.test(name)) continue
    out.push(path)
  }
  return out
}

/** `loadLabels('en')` · `loadMoveNames("ja")`처럼 언어를 손으로 박은 자리 */
const HARD_CODED = /\bload[A-Za-z]*\(\s*['"](en|ja|ko)['"]/g
/** `names/species.en.json`처럼 주소에 언어를 박은 자리 */
const HARD_PATH = /['"][^'"]*\.(en|ja|ko)\.json['"]/g

describe('설치본에 없는 언어를 부르지 않는다', () => {
  it('언어를 손으로 박고 자료를 받는 자리가 없다', () => {
    const found: string[] = []
    for (const path of sources(SRC)) {
      // ⚠️ **주석은 빼고 본다.** 「한때 여기서 `loadLabels('en')`을 받았다」고
      // 적어 둔 그 줄이 다시 걸리면, 고쳐 놓고도 빨간불이 선다
      const text = bare(readFileSync(path, 'utf8'))
      for (const re of [HARD_CODED, HARD_PATH]) {
        re.lastIndex = 0
        for (const m of text.matchAll(re)) found.push(`${slash(path)}: ${m[0]}`)
      }
    }
    expect(found, found.join(' · ')).toEqual([])
  })
})
