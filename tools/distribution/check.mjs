// 배포 경계 검사 (COPYRIGHT.md §6 · PLAN §14.1 · IMPORT.md §13-1)
//
//     node tools/distribution/check.mjs --stage=pre    빌드 전
//     node tools/distribution/check.mjs --stage=post   빌드 후
//     node tools/distribution/check.mjs                둘 다
//
// `pnpm build`가 앞뒤로 부른다. 하나라도 걸리면 0이 아닌 코드로 죽는다 —
// 경고가 아니라 실패다. 경고로 두면 645MB가 그대로 또 나간다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectShell } from './appShell.mjs'
import { pathViolations, scanTree, originsIn } from './rules.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const stage = (process.argv.find((a) => a.startsWith('--stage=')) ?? '').slice(8) || 'both'

const problems = []
const notes = []
const fail = (why, detail) => { problems.push({ why, detail }) }
const mb = (n) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${(n / 1024).toFixed(1)}kB`)

// ── 빌드 전 ──────────────────────────────────────────────────────────────────

/** src의 비-시험 파일이 하는 import 전부. `[파일, 스펙]` 짝 */
function productionImports(dir) {
  const out = []
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const child = resolve(at, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(child, childRel); continue }
      if (!/\.tsx?$/.test(e.name)) continue
      if (/\.test\.tsx?$|\.testkit\.ts$/.test(e.name)) continue
      const text = readFileSync(child, 'utf8')
      for (const m of text.matchAll(/import\s+(?!type\s)(?:[^;'"]*?from\s*)?'([^']+)'/g)) {
        out.push([`src/${childRel}`, m[1]])
      }
      for (const m of text.matchAll(/import\(\s*'([^']+)'/g)) out.push([`src/${childRel}`, m[1]])
    }
  }
  walk(dir, '')
  return out
}

function checkPre() {
  const publicDir = resolve(ROOT, 'public')

  // ① 셸 목록 자체가 규칙을 어기면 안 된다. 여기 뚫리면 뒤 검사가 다 무의미하다
  for (const rel of collectShell(publicDir)) {
    for (const why of pathViolations(rel)) fail(`앱 셸 목록: ${why}`, `public/${rel}`)
  }

  // ② `public/` 안에 원본 유래 나무가 남아 있는가.
  //
  // 있어도 빌드는 된다 — `copyPublicDir: false`라 안 실려 나간다. 다만 **그
  // 사실을 화면에 남긴다.** 조용히 두면 설정이 되돌아간 날 아무도 못 본다
  // (COPYRIGHT.md §5의 `raw/dev-assets` 이전이 끝나면 이 줄도 사라진다)
  for (const tree of ['data', 'models']) {
    if (existsSync(resolve(publicDir, tree))) {
      notes.push(`public/${tree}/ 는 개발용 레거시 자리다 — 셸 목록에 없어 배포물로 안 나간다`)
    }
  }

  // ③ Vite가 `public/`을 통째로 복사하지 못하게 막혀 있는가.
  //
  // 이 한 줄이 되돌아가면 위 ②가 곧바로 645MB가 된다. 설정 글을 직접 읽는다
  const config = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8')
  if (!/copyPublicDir\s*:\s*false/.test(config)) {
    fail('vite.config.ts에 copyPublicDir: false 가 없다', 'public/이 통째로 dist로 복사된다')
  }

  // ④ 바깥 에셋 오리진 설정 (COPYRIGHT.md §6 — `VITE_ASSET_BASE`는 폐기됐다)
  if (process.env.VITE_ASSET_BASE?.trim()) {
    fail('VITE_ASSET_BASE가 설정돼 있다', process.env.VITE_ASSET_BASE)
  }
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const at = resolve(ROOT, name)
    if (!existsSync(at)) continue
    if (/^\s*VITE_ASSET_BASE\s*=\s*\S/m.test(readFileSync(at, 'utf8'))) {
      fail(`${name}에 VITE_ASSET_BASE가 있다`, name)
    }
  }

  // ⑤ `raw/`가 정적 서버 뿌리나 Rollup 입력에 붙었는가
  if (/publicDir\s*:\s*['"][^'"]*raw/.test(config) || /input\s*:[^}]*raw\//.test(config)) {
    fail('vite.config.ts가 raw/를 배포 입력에 연결한다', 'raw/는 정적 서버에 노출하지 않는다')
  }

  // ⑥ 프로덕션 소스가 시험 도구를 물고 있는가.
  //
  // `.testkit.ts`는 자료 유무로 시험을 건너뛰는 장치라 디스크를 읽는다.
  // 앱 코드가 하나라도 물면 그 길로 노드 API와 fixture가 번들에 실린다
  for (const [file, spec] of productionImports(resolve(ROOT, 'src'))) {
    if (/(^|\/)[^/]*\.(test|testkit)($|\.)/.test(spec)) {
      fail('프로덕션 소스가 시험 도구를 import 한다', `${file} → ${spec}`)
    }
  }
}

// ── 빌드 후 ──────────────────────────────────────────────────────────────────

function checkPost() {
  const dist = resolve(ROOT, 'dist')
  if (!existsSync(dist)) {
    notes.push('dist/가 없다 — 빌드 후 검사를 건너뛴다')
    return null
  }
  const scan = scanTree(dist, { label: 'dist' })
  for (const v of scan.violations) fail(v.why, `${v.file} (${mb(v.bytes)})`)

  // 서비스 워커는 앱 셸만 캐시해야 한다 (IMPORT.md §8 끝)
  const sw = resolve(dist, 'sw.js')
  if (existsSync(sw)) {
    const text = readFileSync(sw, 'utf8')
    // ⚠️ **주석은 걷어내고 잰다.** 왜 걷어냈는지가 근거라 주석에는 그 이름이
    // 그대로 남는다 — 안 걷어내면 워커를 고쳐 놓고도 검사가 계속 빨갛다
    const code = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    if (/\bmodels\b/.test(code) || /['"`/(|]data[/|)]/.test(code)) {
      fail('서비스 워커가 아직 원본 유래 나무를 캐시한다', 'dist/sw.js')
    }
    for (const host of originsIn(text)) fail(`서비스 워커에 바깥 오리진 '${host}'`, 'dist/sw.js')
  }
  return scan
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

if (stage === 'pre' || stage === 'both') checkPre()
const scan = stage === 'post' || stage === 'both' ? checkPost() : null

for (const n of notes) console.log(`  · ${n}`)
if (scan) console.log(`  · dist 파일 ${String(scan.files.length)}개 · ${mb(scan.bytes)}`)

if (problems.length === 0) {
  console.log(`배포 경계 통과 (${stage})`)
  process.exit(0)
}

console.error(`\n배포 경계 위반 ${String(problems.length)}건 — 빌드를 세운다\n`)
const shown = problems.slice(0, 40)
for (const p of shown) console.error(`  ✗ ${p.why}\n      ${p.detail}`)
if (problems.length > shown.length) {
  console.error(`  … 그리고 ${String(problems.length - shown.length)}건 더`)
}
console.error('\n무엇이 나가도 되는지는 tools/distribution/appShell.mjs, 왜인지는 COPYRIGHT.md §6.')
process.exit(1)
