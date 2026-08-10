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
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PUBLIC_SHELL, collectShell, unlistedShellFiles } from './appShell.mjs'
import { SHELL_ART, missingArt, unlistedArt } from './shellArt.mjs'
import { openBlockers } from './blockers.mjs'
import {
  TRACKED_TABLES, bannedTablesPresent, missingTables, tablesLeakedInto, trackedContentLeaks,
  unlistedTables,
} from './dataTables.mjs'
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

  // ①-e `src/` 안의 자료 표가 전부 심사받았는가 (`dataTables.mjs`).
  //
  // ⚠️ 경로 규칙은 이것들을 하나도 못 봤다. `src/**/*.json`은 `public/data`
  // 검사에 안 걸리고 `dist` 규칙도 통과한다. 그런데 `src/data/textBanks.json`
  // 안에는 롬 뱅크 헤더에서 읽은 u16 키가 724개 들어 있었다 — 내용 기반
  // 히스토리 감사를 붙이고 나서야 보였고, 그래서 지웠다
  for (const rel of unlistedTables(resolve(ROOT, 'src'))) {
    fail('심사 안 받은 자료 표', `${rel} — tools/distribution/dataTables.mjs에 무엇이 들었는지 적는다`)
  }
  for (const rel of missingTables()) {
    fail('목록에는 있는데 파일이 없는 자료 표', `${rel} — 이름이 갈리면 검사가 조용히 무의미해진다`)
  }
  for (const t of TRACKED_TABLES) {
    if (t.note.includes('미해결')) notes.push(`${t.path} — ${t.holds} (미해결 판단 있음: dataTables.mjs)`)
  }
  // ①-g 셸 그림마다 **무엇을 그렸는지** 적혀 있는가 (COPYRIGHT.md §11).
  //
  // ⚠️ 바이트로는 못 잡는다 — 전부 우리가 그린 PNG라 출처 검사도 매직바이트도
  // 통과한다. 그런데 타이틀 배경에는 금속 워드마크가 그려져 있다. 화면을 열어야
  // 보이는 것이라, 본 사실을 여기 적어 두고 안 적힌 그림이 생기면 세운다
  const shellFiles = collectShell(resolve(ROOT, 'public'))
  for (const rel of unlistedArt(shellFiles)) {
    fail('심사 안 받은 셸 그림', `${rel} — tools/distribution/shellArt.mjs에 무엇을 그렸는지 적는다`)
  }
  for (const rel of missingArt(shellFiles)) {
    fail('대장에는 있는데 셸에 없는 그림', `${rel} — 이름이 갈리면 검사가 무의미해진다`)
  }
  notes.push(`셸 그림 ${SHELL_ART.length}개를 심사했다`)

  for (const t of bannedTablesPresent()) {
    fail('지운 자료 표가 다시 왔다', `${t.path} — ${t.why}`)
  }

  // ①-f tracked 나무를 **내용으로** 훑는다 (§2.10 · §9).
  //
  // 이름을 바꿔 옮겨 놓으면 위의 경로 검사가 전부 조용히 통과한다. 그래서
  // 머리 바이트가 롬 컨테이너인지, 본문이 지운 값의 모양인지를 직접 본다
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
  for (const leak of trackedContentLeaks(tracked)) {
    fail('tracked 파일이 원본 유래다', `${leak.path} — ${leak.what}: ${leak.why}`)
  }
  notes.push(`tracked ${tracked.length}개를 내용으로 훑었다 — 원본 유래 0개`)

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

/** PLAN §10.4 예산. 넘으면 빌드를 세운다 */
const PAYLOAD_LIMIT = 150 * 1024
/**
 * 내부 목표. 예산에 붙어 있으면 다음 화면 하나에 넘긴다 —
 * 여유를 재는 자리가 없으면 "통과했다"와 "간신히 통과했다"가 구별이 안 된다
 */
const PAYLOAD_TARGET = 135 * 1024

/**
 * 첫 화면이 실제로 받는 것 (gzip).
 *
 * ⚠️ **`index.html`이 스스로 적어 둔 것을 읽는다.** 청크 목록을 손으로 적으면
 * 코드 쪼개기가 바뀔 때마다 갈라진다. 브라우저가 첫 로드에 받는 것은 정확히
 * 여기 있는 것들이다 — 진입 스크립트 · modulepreload · 스타일시트
 */
function initialPayload(dist) {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const files = new Set()
  for (const m of html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)) files.add(m[1])
  let raw = 0
  let gz = gzipSync(Buffer.from(html)).length
  for (const rel of files) {
    const at = resolve(dist, rel)
    if (!existsSync(at)) continue
    const bytes = readFileSync(at)
    raw += bytes.length
    gz += gzipSync(bytes).length
  }
  return { files: [...files], raw, gz }
}

function checkPost() {
  const dist = resolve(ROOT, 'dist')
  if (!existsSync(dist)) {
    notes.push('dist/가 없다 — 빌드 후 검사를 건너뛴다')
    return null
  }
  const scan = scanTree(dist, { label: 'dist' })
  for (const v of scan.violations) fail(v.why, `${v.file} (${mb(v.bytes)})`)

  // 첫 화면 예산 (PLAN §10.4). 문서에만 있고 아무도 안 재던 값이다 —
  // 그러면 어느 날 넘어도 눈으로 봐야 안다
  if (existsSync(resolve(dist, 'index.html'))) {
    const p = initialPayload(dist)
    notes.push(
      `첫 화면 ${String(p.files.length + 1)}개 · ${mb(p.raw)} · gzip ${mb(p.gz)}`
      + ` (목표 ${mb(PAYLOAD_TARGET)} · 예산 ${mb(PAYLOAD_LIMIT)})`,
    )
    if (p.gz > PAYLOAD_LIMIT) {
      fail(`첫 화면이 예산을 넘었다 — gzip ${mb(p.gz)} > ${mb(PAYLOAD_LIMIT)}`, p.files.join(' · '))
    } else if (p.gz > PAYLOAD_TARGET) {
      notes.push(`⚠️ 내부 목표 ${mb(PAYLOAD_TARGET)}를 넘었다 — 예산까지 ${mb(PAYLOAD_LIMIT - p.gz)} 남았다`)
    }
  }

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

  // `inBundle: false`라고 적어 둔 표가 정말 안 실렸는가.
  //
  // ⚠️ 트리 셰이킹은 import 하나만 늘어도 깨진다. "안 들어간다"를 가정으로
  // 두면 어느 날 조용히 들어간다 — 그래서 배포물을 실제로 뒤진다
  for (const leak of tablesLeakedInto(dist)) {
    fail(`자료 표가 배포물에 실렸다: ${leak.table}`, `dist/${leak.file}에 '${leak.marker}'가 있다`)
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
