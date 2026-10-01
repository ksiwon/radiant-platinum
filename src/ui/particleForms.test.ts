// 화면 글에 병기형 조사가 남지 않았는가 (PARITY §2.24)
//
// 「좋은상처약을(를) 썼다!」 「수풀부기(으)로 진화했다!」가 배포판 화면에 떴다. 받침을 고르는
// 도우미(`ui/korean`)가 있는데 군데군데 병기형을 문자열에 직접 박아 두어서다 — 같은 화면
// 안에서 맞는 조사와 괄호 조사가 섞여 만들다 만 현지화처럼 읽힌다.
//
// 그래서 `src/ui`의 **글자 그대로** 훑는다. 파서가 준 문자열·템플릿·JSX 글 토막만 보고
// 주석은 안 본다 — 「한때 이렇게 떴다」를 적어 두는 주석은 남아야 한다.
//
// ⚠️ **빼는 것 둘.** `ui/korean` 자신(한글이 아닌 이름에 병기형으로 물러나는 것이 그
// 모듈의 일이다)과 `console.*`에 넘기는 글(개발자가 읽는 기록이지 화면 글이 아니다).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const UI = resolve(__dirname)
const FORMS = /을\(를\)|이\(가\)|은\(는\)|\(으\)로/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

/** `console.log(…)` 같은 부름인가 */
function isConsoleCall(node: ts.Node): boolean {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'console'
}

/** 그 파일의 화면 글 토막 중 병기형이 든 것 — `줄: 글` */
function offenders(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) return
    const piece = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
      ? node.text
      : ts.isJsxText(node) ? node.text : null
    if (piece !== null && FORMS.test(piece)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      found.push(`${String(line)}: ${piece.trim()}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('병기형 조사', () => {
  const files = walk(UI).filter((p) => relative(UI, p).split(sep).join('/') !== 'korean.ts')

  it('훑을 파일이 실제로 있다 — 비어 있으면 아무것도 안 잰 것이다', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('화면 글에 「을(를)·이(가)·은(는)·(으)로」가 없다 — `ui/korean`으로 고른다', () => {
    const bad: string[] = []
    for (const path of files) {
      for (const hit of offenders(path)) bad.push(`${relative(UI, path).split(sep).join('/')}:${hit}`)
    }
    expect(bad).toEqual([])
  })

  it('훑는 자가 제 일을 한다 — 빼 둔 `ui/korean`에서는 찾는다', () => {
    const probe = resolve(UI, 'korean.ts')
    // `ui/korean`은 한글이 아닌 이름에 병기형으로 물러난다 — 이 자가 그것을 **찾아야** 뺀 것이 뜻이 있다
    expect(offenders(probe).length).toBeGreaterThan(0)
  })
})
