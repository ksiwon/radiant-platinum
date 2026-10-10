// `style({ selectors })` 안의 선택자가 vanilla-extract 규칙을 지키는지 — 굽기 전에 잡는다.
//
// ⚠️ **vitest는 css를 굽지 않는다.** `style()`이 시험에서는 이름만 돌려줘서, 규칙을 어긴 선택자가 시험을 다 지나간다.
// 실제 빌드(개발 서버 포함)에서는 vanilla-extract가 「Invalid selector」로 그 **파일 전체**를 버린다 — 도감 화면이 통째로
// 안 꾸며진 채 쪽과 목록이 위아래로 쌓이고 창 바탕이 비쳤다(`& [role="tab"]:nth-of-type(n)`, 자식을 겨눈 선택자).
//
// 규칙: `selectors`의 열쇠는 **`&` 자신을 겨눠야 한다** — 결합자(공백 · `>` · `+` · `~`)로 나눈 마지막 조각에 `&`가
// 있어야 한다(`'& + &'` · `'&:hover'` · `'.x &'`은 되고 `'& span'` · `'& > *'`은 안 된다). 자식을 꾸미려면 `globalStyle`을 쓴다
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : cssFiles(p)
    return e.name.endsWith('.css.ts') ? [p] : []
  })
}

/** 대괄호 · 괄호 안은 빼고 결합자로 가른다 */
function lastCompound(selector: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) start = i + 1
  }
  return selector.slice(start)
}

/** `selectors: { … }` 묶음 안의 열쇠 — 따옴표 · 백틱으로 쓴 것만 (`${…}`은 자리표시로 바꾼다) */
function selectorKeys(source: string): string[] {
  const keys: string[] = []
  const block = /selectors\s*:\s*\{/g
  for (let m = block.exec(source); m !== null; m = block.exec(source)) {
    let depth = 1
    let i = m.index + m[0].length
    const from = i
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const body = source.slice(from, i - 1)
    // 맨 바깥 단계의 열쇠만 — 값 객체 안의 글은 안 본다
    let d = 0
    let line = ''
    for (const c of body) {
      if (c === '{') d++
      if (c === '}') d--
      if (d === 0) line += c
      else if (c === '{') line += '{'
    }
    for (const k of line.matchAll(/(['"`])((?:(?!\1).)+)\1\s*:\s*\{/g)) keys.push(k[2]!.replace(/\$\{[^}]*\}/g, 'X'))
  }
  return keys
}

describe('style 선택자 (vanilla-extract)', () => {
  const files = cssFiles(SRC)

  it('css.ts 파일을 찾는다', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('선택자가 & 자신을 겨눈다 — 자식 선택자는 globalStyle로', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const key of selectorKeys(readFileSync(f, 'utf8'))) {
        for (const one of key.split(',')) {
          if (!lastCompound(one.trim()).includes('&')) bad.push(`${f.slice(SRC.length + 1)}: ${key}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('검사가 잡아야 할 꼴을 잡는다', () => {
    expect(lastCompound('& [role="tab"]:nth-of-type(1)')).not.toContain('&')
    expect(lastCompound('& > *')).not.toContain('&')
    expect(lastCompound('& + &')).toContain('&')
    expect(lastCompound('&:hover')).toContain('&')
    expect(lastCompound('[data-x="a b"] &')).toContain('&')
    expect(selectorKeys("x = style({ selectors: { '& span': { color: 1 }, '&:hover': { a: 1 } } })"))
      .toEqual(['& span', '&:hover'])
  })
})
