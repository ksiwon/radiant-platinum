// 배포 경계 검사 (COPYRIGHT.md §6 · PLAN §14.1 · IMPORT.md §13-1)
//
//     node tools/distribution/check.mjs --stage=pre    빌드 전
//     node tools/distribution/check.mjs --stage=post   빌드 후
//     node tools/distribution/check.mjs                둘 다
//     node tools/distribution/check.mjs --release      공개 배포 판정 (blocker도 실패)
//
// `pnpm build`가 앞뒤로 부른다. 하나라도 걸리면 0이 아닌 코드로 죽는다 —
// 경고가 아니라 실패다. 경고로 두면 645MB가 그대로 또 나간다.
//
// ⚠️ **위반과 release blocker는 다르다.** 위반은 지금 고칠 수 있고 고쳐야 하는
// 것이라 빌드를 세운다. blocker는 아직 해결 못 한 것이라 세우면 개발이 멈춘다 —
// 대신 매 빌드에 숫자를 찍고, `--release`에서만 실패로 바꾼다. 공개 배포는
// 그 판정을 지나야 한다 (DEPLOY.md §1).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PUBLIC_SHELL, collectShell, unlistedShellFiles } from './appShell.mjs'
import { openBlockers } from './blockers.mjs'
import { forbiddenIn } from './provenance.mjs'
import { pathViolations, scanTree, originsIn } from './rules.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const stage = (process.argv.find((a) => a.startsWith('--stage=')) ?? '').slice(8) || 'both'
const releaseMode = process.argv.includes('--release')

const problems = []
const notes = []
const releaseBlockers = []
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

  // ①-b 목록에 없는 파일이 심사받은 나무에 있는가.
  //
  // 목록이 폴더 단위(`{ kind: 'dir', path: 'assets' }`)였을 때는 `public/assets`에
  // 무엇을 떨어뜨리든 그대로 실려 나갔다. 지금은 파일 단위라 안 실리지만,
  // **안 실리는 것과 실려도 되는지 심사한 것은 다르다.** 여기서 세운다
  for (const rel of unlistedShellFiles(publicDir)) {
    fail('앱 셸 목록에 없는 파일', `public/${rel} — appShell.mjs와 docs/APP_SHELL.md에 출처를 적는다`)
  }

  // ①-c 출처가 '자체'가 아닌 것이 목록에 있는가
  for (const e of PUBLIC_SHELL) {
    if (e.origin !== '자체') fail(`앱 셸 출처가 '자체'가 아니다: ${e.origin}`, `public/${e.path}`)
  }

  // ①-d 에셋 목차가 다시 추적되고 있는가 (COPYRIGHT.md §5).
  //
  // 뿌리의 `assets-manifest.json`에는 원본 유래 산출물 7,086개의 경로·크기·짧은
  // 해시가 있었다. 목차도 목록이다. `.gitignore`가 막지만 `-f`로 넣을 수 있다
  for (const name of ['assets-manifest.json', 'assets-manifest.local.json']) {
    if (existsSync(resolve(ROOT, name))) {
      fail('뿌리에 에셋 목차가 있다', `${name} — raw/work/ 아래에서만 굽는다 (COPYRIGHT.md §5)`)
    }
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

  // 번들 **안**에 무엇이 들어갔는가 (COPYRIGHT.md §6 · DEPLOY.md §4).
  //
  // ⚠️ 위 `scanTree`는 파일 이름과 자리만 본다. `dist/assets/battle-sim-*.js`는
  // 둘 다 통과하면서 6.5MB의 종족·기술 표를 싣고 있었다. 그 안을 보는 유일한
  // 길이 빌드가 남긴 출처 보고서다
  const at = resolve(ROOT, '.audit/bundle-provenance.json')
  if (!existsSync(at)) {
    fail('번들 출처 보고서가 없다', '.audit/bundle-provenance.json — vite 플러그인이 안 돌았다')
  } else {
    const bad = forbiddenIn(JSON.parse(readFileSync(at, 'utf8')))
    for (const b of bad.slice(0, 3)) {
      notes.push(`    ${b.why}: ${b.id.replace(/^.*node_modules\//, '')} (${mb(b.bytes)})`)
    }
    if (bad.length > 3) notes.push(`    … 외 ${bad.length - 3}개 모듈`)
  }
  return scan
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

if (stage === 'pre' || stage === 'both') checkPre()
const scan = stage === 'post' || stage === 'both' ? checkPost() : null

// 공개 배포를 막고 있는 것. 손으로 적은 목록이 아니라 각자 직접 잰다
for (const b of openBlockers()) releaseBlockers.push(`${b.why} — ${b.state.detail} (${b.where})`)

for (const n of notes) console.log(`  · ${n}`)
if (scan) console.log(`  · dist 파일 ${String(scan.files.length)}개 · ${mb(scan.bytes)}`)

// 판정을 파일로도 남긴다 — 배포 스크립트가 사람 눈 없이 읽을 수 있어야 한다
if (stage === 'post' || stage === 'both') {
  mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
  writeFileSync(resolve(ROOT, '.audit/release-blockers.json'),
    `${JSON.stringify({ blockers: releaseBlockers, violations: problems.length }, null, 1)}\n`)
}

if (releaseBlockers.length > 0) {
  console.error(`\n공개 배포 blocker ${String(releaseBlockers.length)}건 — 아직 못 올린다`)
  for (const b of releaseBlockers) console.error(`  ⛔ ${b}`)
  console.error('  근거와 다음 선택지: docs/DEPLOY.md')
  if (releaseMode) process.exit(1)
}

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
