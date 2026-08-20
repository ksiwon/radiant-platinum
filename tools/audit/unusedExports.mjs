// 제 파일 안에서만 쓰는 `export`를 잡는다 (`pnpm exports:check`)
//
//     node tools/audit/unusedExports.mjs           목록을 찍는다
//     node tools/audit/unusedExports.mjs --check   하나라도 있으면 선다
//     node tools/audit/unusedExports.mjs --write   `export` 낱말만 지운다
//
// **왜 tsc로 안 되는가.** `noUnusedLocals`는 이미 사설인 이름만 본다 — 아무도
// 안 부르는 `export`는 「밖에서 쓸지도 모른다」라서 영원히 안 잡힌다. 그래서
// 한 번 걷어내도 새로 붙이면 도로 자란다. 이 자가 그 자리를 지킨다.
//
// ⚠️ **시험만 쓰는 `export`는 흠이 아니다.** 순수 함수를 시험이 직접 부르라고
// 연 자리고 지금 523개다 — 시험을 소비자로 안 세면 그것들이 다 걸려서 이 검사가
// 못 쓰게 된다. 여기서는 `src`·`tools`·`.audit`·설정을 다 소비자로 센다.
//
// ⚠️ **아무 데도 안 나오는 이름(죽은 코드)은 여기서 안 잡는다.** 그건 손으로
// 봐야 한다 — 일부러 둔 빈 껍데기(`FormatsData`)와 만들어 낸 파일과 아직 안
// 이어 붙인 기능이 섞여 있다. 세는 자리는 PLAN.md §16.10이다.
//
// ⚠️ **정규식으로 지우지 않는다.** 파서가 준 `export` 토큰 자리를 그대로
// 잘라낸다 — `export default`·`export {…} from`·주석 속의 낱말을 안 건드린다.
// 글자로 훑으면 JSX 글 속의 백틱 하나가 뒤 70줄을 문자열로 먹는다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, sep, resolve } from 'node:path'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '../..')
const MODE = process.argv.includes('--write') ? 'write'
  : process.argv.includes('--check') ? 'check' : 'list'

const walk = (d, out = []) => {
  if (!existsSync(d)) return out
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const norm = (p) => p.split(sep).join('/')
const at = (p) => resolve(ROOT, p)
const isTest = (f) => /\.test\.tsx?$/.test(f) || f.includes('/__tests__/')

const files = [
  ...walk(at('src')), ...walk(at('tools')), ...walk(at('.audit')), ...walk(at('scripts')),
  at('eslint.config.js'), at('vite.config.ts'), at('vitest.shimmed.config.ts'),
].filter((p) => /\.(tsx?|mts|mjs|cjs|js)$/.test(p) && existsSync(p))
  .map((p) => norm(p).slice(norm(ROOT).length + 1))

const parse = (f) => ts.createSourceFile(f, readFileSync(at(f), 'utf8'), ts.ScriptTarget.Latest,
  true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : /\.tsx?$/.test(f) ? ts.ScriptKind.TS : ts.ScriptKind.JS)

/** 그 파일이 입에 올리는 모든 이름 */
const refsOf = (src) => {
  const used = new Set()
  const visit = (n) => {
    if (ts.isIdentifier(n)) used.add(n.text)
    // 문자열로 부르는 자리도 센다
    if (ts.isStringLiteralLike(n) && /^[A-Za-z_$][\w$]*$/.test(n.text)) used.add(n.text)
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(src, visit)
  return used
}

const trees = new Map()
const refs = new Map()
for (const f of files) {
  const src = parse(f)
  trees.set(f, src)
  refs.set(f, refsOf(src))
}

const found = []
for (const f of files) {
  if (!f.startsWith('src/') || isTest(f)) continue
  const src = trees.get(f)
  const declNames = new Set()
  const owned = []

  const visit = (node) => {
    let names = null
    if (ts.isVariableStatement(node)) {
      names = node.declarationList.declarations
        .filter((d) => ts.isIdentifier(d.name)).map((d) => d.name)
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isEnumDeclaration(node)) && node.name) {
      names = [node.name]
    }
    if (names && names.length > 0) {
      const mods = node.modifiers ?? []
      const tok = mods.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      if (tok && !isDefault) owned.push({ names, tok })
      for (const n of names) declNames.add(n)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(src, visit)

  // 제 파일 안에서 선언 말고 또 나오는가
  const self = new Map()
  const count = (n) => {
    if (ts.isIdentifier(n) && !declNames.has(n)) self.set(n.text, (self.get(n.text) ?? 0) + 1)
    ts.forEachChild(n, count)
  }
  ts.forEachChild(src, count)

  for (const item of owned) {
    const texts = item.names.map((n) => n.text)
    // 한 문에 여럿이면(`export const a = 1, b = 2`) 전부 안 쓰여야 잡는다
    const outside = texts.some((t) => files.some((g) => g !== f && refs.get(g).has(t)))
    if (outside) continue
    if (!texts.every((t) => (self.get(t) ?? 0) > 0)) continue // 죽은 코드는 여기서 안 본다
    found.push({ f, texts, pos: item.tok.getStart(src), end: item.tok.end })
  }
}

const total = found.reduce((a, r) => a + r.texts.length, 0)

if (MODE === 'write') {
  const byFile = new Map()
  for (const r of found) byFile.set(r.f, [...(byFile.get(r.f) ?? []), r])
  for (const [f, rows] of byFile) {
    let text = readFileSync(at(f), 'utf8')
    // 뒤에서부터 잘라야 앞의 자리가 안 밀린다
    for (const r of rows.sort((a, b) => b.pos - a.pos)) {
      let end = r.end
      while (text[end] === ' ') end++
      text = text.slice(0, r.pos) + text.slice(end)
    }
    writeFileSync(at(f), text)
  }
  process.stdout.write(`export 낱말을 지웠다 — 파일 ${byFile.size}개 · 이름 ${total}개\n`)
  process.exit(0)
}

if (total === 0) {
  process.stdout.write('제 파일 안에서만 쓰는 export 0개.\n')
  process.exit(0)
}

process.stdout.write(`제 파일 안에서만 쓰는 export ${total}개\n`)
for (const r of found) process.stdout.write(`  ${r.f}  ${r.texts.join(' ')}\n`)
if (MODE === 'check') {
  process.stdout.write('\n밖에서 아무도 안 부른다. `export`를 떼면 tsc가 그때부터 지킨다:\n')
  process.stdout.write('  node tools/audit/unusedExports.mjs --write\n')
  process.exit(1)
}
