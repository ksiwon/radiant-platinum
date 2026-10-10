// css.ts를 **실제로 구워** vanilla-extract가 던지는 것을 잡는다.
//
//     node tools/audit/cssCompile.mjs        파일마다 굽고, 하나라도 던지면 종료 코드 1
//
// ⚠️ vitest는 css를 굽지 않는다 — `style()`이 이름만 돌려줘서 규칙을 어긴 선택자(`& [role="tab"]`처럼 자식을 겨눈 것)가
// 시험을 다 지나간다. 개발 서버는 그 **파일 전체**를 조용히 버리고(도감 화면이 통째로 안 꾸며졌다), 빌드는 그 자리에서 선다.
// 선택자를 변수로 만들어 넣으면 소스 글자 검사로도 못 본다 — 그래서 빌드와 같은 컴파일러로 직접 굽는다
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
// 컴파일러는 vite 플러그인이 끌고 오는 의존이다 — 같은 판을 쓴다
const pluginDir = dirname(require.resolve('@vanilla-extract/vite-plugin'))
const compilerPath = createRequire(join(pluginDir, 'x.js')).resolve('@vanilla-extract/compiler')
const { createCompiler } = await import(pathToFileURL(compilerPath).href)

function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : cssFiles(p)
    return e.name.endsWith('.css.ts') ? [p] : []
  })
}

const files = cssFiles(join(ROOT, 'src'))
const compiler = createCompiler({ root: ROOT, identifiers: 'short' })
const bad = []
try {
  for (const f of files) {
    try {
      await compiler.processVanillaFile(f)
    } catch (e) {
      bad.push(`${relative(ROOT, f)}: ${String(e?.message ?? e).split('\n')[0]}`)
    }
  }
} finally {
  await compiler.close()
}

if (bad.length > 0) {
  console.error(`css.ts ${String(files.length)}개 중 ${String(bad.length)}개가 안 구워진다:`)
  for (const b of bad) console.error(`  ${b}`)
  process.exit(1)
}
console.log(`css.ts ${String(files.length)}개 모두 구워진다`)
