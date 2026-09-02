// 메뉴 화면은 **3D 위에** 서야 한다 (DESIGN.md §3)
//
// ⚠️ **말로 적은 규칙은 안 지켜진다.** 무대(`scene/Stage`의 `#stage-wrap`)는
// `position: fixed`이고, 자리를 잡은 것은 DOM 차례와 무관하게 안 잡은(static)
// 것 위에 그려진다. 그래서 창을 그냥 `<div>` 하나로 띄우면 **그려지긴 하는데
// 캔버스 뒤**에 있다 — 화면에는 아무것도 안 보이고, 마우스도 캔버스가 다 먹는다.
//
// 실제로 이름 짓기 화면이 그랬다. 스크립트는 답이 나올 때까지 서므로
// (`namingAnswer`) 마우스로 노는 사람에게는 **연구소에서 게임이 멎은 것**으로
// 보였고, e2e ㉖이 「그대로 두기」를 60초 기다리다 떨어졌다. 눈으로도 시험으로도
// 안 잡히던 자리라, 여기서 **뿌리 태그를 직접 읽어** 막는다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const HERE = import.meta.dirname
const read = (rel: string): string => readFileSync(resolve(HERE, rel), 'utf8')

/** `menuChrome.css`가 주는 층. 이 둘은 `scrim`(fixed) 위에 z를 얹은 것이다 */
const LAYERED = ['overlay', 'cinematicOverlay']

/**
 * `MenuLayer`가 그리는 화면 — `case 'x': return <Comp />` 에서 뽑고,
 * 그 컴포넌트가 어느 파일에서 왔는지는 **import 줄에서 되짚는다.**
 *
 * ⚠️ **`./<이름>.tsx`로 가정하지 않는다.** 고르는 장면은 `ui/field`에 있다
 */
function screens(): { key: string; comp: string; file: string }[] {
  const src = read('MenuLayer.tsx')
  const from = (comp: string): string => {
    const imp = new RegExp(`import \\{ ${comp} \\} from '([^']+)'`).exec(src)
    return `${imp ? imp[1]! : `./${comp}`}.tsx`
  }
  return [...src.matchAll(/case '(\w+)': return <(\w+) \/>/g)]
    .map((m) => ({ key: m[1]!, comp: m[2]!, file: from(m[2]!) }))
}

/**
 * 그 컴포넌트가 **제일 바깥에** 그리는 태그 한 줄.
 *
 * ⚠️ **파일에서 마지막 `return (`을 집으면 안 된다.** 안쪽 도우미 함수가 그
 * 뒤에 있으면 그것을 뿌리로 읽는다 — 처음에 그렇게 썼더니 열 화면이 엉뚱한
 * 태그로 걸렸다. `export function <이름>(` 다음의 **들여쓰기 두 칸짜리**
 * `return (` 하나만 본다. 그것이 컴포넌트 몸통의 반환이다
 */
function rootTag(comp: string, file: string): string {
  const src = read(file)
  const from = src.indexOf(`export function ${comp}(`)
  expect(from, `${comp}.tsx에 export function ${comp}(이 없다`).toBeGreaterThan(-1)
  const at = src.indexOf('\n  return (', from)
  expect(at, `${comp}.tsx에 몸통의 return (이 없다`).toBeGreaterThan(-1)
  // 주석 줄(`/*` … `*/`)은 건너뛴다 — 왜 이 층이 필요한지를 거기 적는다
  const body = src.slice(at).replace(/\/\*[\s\S]*?\*\//, '')
  const hit = /<([A-Za-z][\w.]*)([^>]*)>/.exec(body)
  expect(hit, `${comp}.tsx의 뿌리 태그를 못 읽었다`).not.toBeNull()
  return `${hit![1]!}${hit![2]!}`
}

/**
 * `className={ns.name}`의 `ns`를 파일로 되짚어, 그 이름이 자리를 잡는가 본다.
 *
 * ⚠️ **이름만 보고 통과시키지 않는다.** `frame`이든 `sheet`든 이름은 아무래도
 * 좋고, 재야 하는 것은 그 스타일이 `position: fixed`인가 하나뿐이다
 */
function isFixed(file: string, ns: string, name: string): boolean {
  if (LAYERED.includes(name)) return true
  const src = read(file)
  const imp = new RegExp(`import \\* as ${ns} from '([^']+)'`).exec(src)
  if (!imp) return false
  // 컴포넌트가 `ui/field`에 있으면 그 css도 거기 있다 — 그 파일 옆에서 찾는다
  const css = read(`${dirname(file)}/${imp[1]!}.ts`)
  const at = css.indexOf(`export const ${name} = `)
  if (at < 0) return false
  const block = css.slice(at, at + 400)
  return /position:\s*'fixed'/.test(block)
}

describe('메뉴 화면은 3D 위에 선다', () => {
  const list = screens()

  it('MenuLayer에서 화면을 읽어 온다', () => {
    // 개수를 박지 않는다 — 재려는 것은 「몇 개인가」가 아니라 「전부 층이 있는가」다
    expect(list.length).toBeGreaterThan(10)
    expect(list.map((s) => s.key)).toContain('naming')
  })

  for (const { key, comp, file } of list) {
    it(`${key} — 뿌리가 자리를 잡는다`, () => {
      const root = rootTag(comp, file)
      // `MenuScreen`이 스스로 `overlay`/`cinematicOverlay`로 감싼다
      if (root.startsWith('MenuScreen')) return
      const cls = /className=\{(\w+)\.(\w+)\}/.exec(root)
      expect(cls, `${comp}의 뿌리 <${root.split(' ')[0]!}>에 className이 없다`
        + ' — MenuScreen으로 감싸거나 menuChrome의 overlay를 쓴다').not.toBeNull()
      expect(
        isFixed(file, cls![1]!, cls![2]!),
        `${comp}의 뿌리 ${cls![1]!}.${cls![2]!}가 자리를 안 잡는다`
        + ' — static이면 #stage-wrap(fixed) 뒤에 그려져 화면에 안 보인다',
      ).toBe(true)
    })
  }
})
