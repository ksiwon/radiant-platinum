// Git 히스토리 감사 — **읽기만 한다** (COPYRIGHT.md §9)
//
//     pnpm audit:history
//
// ⚠️ **이 파일은 아무것도 안 고친다.** `filter-repo`도 rebase도 강제 push도
// 안 부른다. 히스토리 다시 쓰기는 파괴적이고 되돌릴 수 없어서 사용자 승인이
// 따로 필요하다 — 여기서는 **무엇을 지워야 하는지와 어떻게 백업하는지**만
// 적어 준다.
//
// 왜 필요한가: 지금 리포에 `public/data/**`가 없어도, 과거 커밋에 있었으면
// clone하는 사람은 그것을 받는다. `.gitignore`는 과거를 못 지운다.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })

/** 히스토리에서 없어져야 하는 경로 (COPYRIGHT.md §9) */
const TARGETS = [
  { path: 'public/data', why: '롬에서 뽑은 자료' },
  { path: 'public/models', why: 'BDSP에서 뽑은 모델' },
  { path: 'assets-manifest.json', why: '원본 유래 산출물의 경로·크기·짧은 해시' },
  { path: 'raw', why: '원본 롬·추출물·디컴프' },
  { path: 'dist', why: '빌드 산출물 (한때 645MB였다)' },
  { path: 'dist-assets', why: '같은 이유' },
  // 지금 나무에서는 지웠다. 히스토리에는 그대로 있다 — 뱅크 724개의 암호화
  // 키(u16)와 로케일별 엔트리 수다 (COPYRIGHT.md §6)
  { path: 'src/data/textBanks.json', why: '롬 뱅크 헤더에서 읽은 u16 키 724개' },
]

const mb = (n) => `${(n / (1 << 20)).toFixed(1)}MB`

console.log('Git 히스토리 감사 — 읽기 전용 (COPYRIGHT.md §9)\n')

// ── 리모트 ───────────────────────────────────────────────────────────────────
const remotes = git('remote', '-v').trim()
console.log(remotes
  ? `⚠️ 리모트가 있다:\n${remotes.split('\n').map((l) => `    ${l}`).join('\n')}`
  : '리모트 없음 — 아직 아무 데도 안 올라갔다. 지금이 정리하기 가장 싼 때다')
console.log('')

// ── 경로별 ───────────────────────────────────────────────────────────────────
let totalBlobs = 0
let totalBytes = 0
const dirty = []

for (const target of TARGETS) {
  const commits = git('log', '--all', '--oneline', '--', target.path).trim()
  const n = commits ? commits.split('\n').length : 0
  if (n === 0) { console.log(`  ✓ ${target.path.padEnd(22)} 히스토리에 없다`); continue }

  // 그 경로에 있던 블롭을 전부 모아 크기를 잰다
  const objects = git('rev-list', '--all', '--objects', '--', target.path)
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(' ')[0])
  const unique = [...new Set(objects)]
  let bytes = 0
  let blobs = 0
  if (unique.length > 0) {
    const info = execFileSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectsize)'],
      { cwd: ROOT, input: unique.join('\n'), encoding: 'utf8', maxBuffer: 1 << 28 })
    for (const line of info.split('\n')) {
      const [kind, size] = line.trim().split(' ')
      if (kind === 'blob') { blobs++; bytes += Number(size) }
    }
  }
  totalBlobs += blobs
  totalBytes += bytes
  dirty.push({ ...target, commits: n, blobs, bytes })
  console.log(`  ⚠️ ${target.path.padEnd(22)} 커밋 ${String(n).padStart(3)} · 블롭 ${String(blobs).padStart(5)} · ${mb(bytes)}   ${target.why}`)
}

// ── 내용으로 훑기 ────────────────────────────────────────────────────────────
//
// ⚠️ **경로 목록만으로는 부족하다.** 위 `TARGETS`는 우리가 *기억하는* 자리다.
// 같은 산출물이 다른 이름으로 들어갔으면 — `src/data/*.json`으로, 스크린샷으로,
// 확장자 없는 덤프로 — 저 목록은 그것을 통째로 못 본다. 그래서 히스토리의
// **모든 블롭을 열어** 머리 몇 바이트로 종류를 가린다. 이름이 아니라 내용이다.
//
// 이 목록은 "지워야 할 것"이 아니라 **"봐야 할 것"**이다. 우리가 그린 아이콘도
// PNG라 여기 뜬다 — 판단은 사람이 한다.

/** 머리 바이트로 가리는 종류. 앞에서부터 먼저 맞는 것 */
const MAGIC = [
  { kind: 'PNG', why: '이미지 — 스프라이트 덤프·스크린샷', at: 0, sig: [0x89, 0x50, 0x4e, 0x47] },
  { kind: 'JPEG', why: '이미지', at: 0, sig: [0xff, 0xd8, 0xff] },
  { kind: 'GIF', why: '이미지', at: 0, sig: [0x47, 0x49, 0x46, 0x38] },
  { kind: 'WEBP', why: '이미지', at: 8, sig: [...'WEBP'].map((c) => c.charCodeAt(0)) },
  { kind: 'KTX2', why: '압축 텍스처', at: 0, sig: [0xab, 0x4b, 0x54, 0x58] },
  { kind: 'GLB', why: '3D 모델', at: 0, sig: [...'glTF'].map((c) => c.charCodeAt(0)) },
  { kind: 'NARC', why: '⚠️ 롬 컨테이너 그 자체', at: 0, sig: [...'NARC'].map((c) => c.charCodeAt(0)) },
  { kind: 'SDAT', why: '⚠️ 롬 사운드 아카이브', at: 0, sig: [...'SDAT'].map((c) => c.charCodeAt(0)) },
  { kind: 'NCLR', why: '⚠️ 롬 팔레트', at: 0, sig: [...'RLCN'].map((c) => c.charCodeAt(0)) },
  { kind: 'NCGR', why: '⚠️ 롬 타일', at: 0, sig: [...'RGCN'].map((c) => c.charCodeAt(0)) },
  { kind: 'NSBMD', why: '⚠️ 롬 모델', at: 0, sig: [...'BMD0'].map((c) => c.charCodeAt(0)) },
  { kind: 'OggS', why: '소리', at: 0, sig: [...'OggS'].map((c) => c.charCodeAt(0)) },
  { kind: 'ZIP', why: '압축 묶음 — 안을 못 본다', at: 0, sig: [0x50, 0x4b, 0x03, 0x04] },
]

/** 이 크기 아래 JSON은 표가 아니라 설정으로 본다 */
const TABLE_BYTES = 64 * 1024

/** 우리가 그린 것. 종류는 같아도 출처가 다르다 (docs/APP_SHELL.md) */
const OURS = /^public\/assets\/(radiant-platinum-|mark)|^docs\/[^/]*\.png$/

function sniff(head, size) {
  for (const m of MAGIC) {
    if (head.length < m.at + m.sig.length) continue
    if (m.sig.every((b, i) => head[m.at + i] === b)) return m
  }
  const first = head[0]
  if ((first === 0x7b || first === 0x5b) && size >= TABLE_BYTES) {
    return { kind: 'JSON표', why: `생성된 표로 보인다 (${mb(size)})` }
  }
  return null
}

{
  const lines = git('rev-list', '--all', '--objects').split('\n').map((l) => l.trim()).filter(Boolean)
  // 같은 블롭이 여러 경로에 있을 수 있다. 경로를 다 모은다
  const wherePaths = new Map()
  for (const line of lines) {
    const at = line.indexOf(' ')
    if (at <= 0) continue
    const sha = line.slice(0, at)
    if (!wherePaths.has(sha)) wherePaths.set(sha, new Set())
    wherePaths.get(sha).add(line.slice(at + 1))
  }
  const shas = [...wherePaths.keys()]
  // ⚠️ 내용을 진짜로 읽는다. `--batch-check`는 크기만 주고 머리 바이트를 안 준다
  const raw = execFileSync('git', ['cat-file', '--batch'],
    { cwd: ROOT, input: shas.join('\n'), maxBuffer: 1 << 29 })

  const found = new Map()   // kind → { why, bytes, blobs, paths:Set }
  let scanned = 0
  let i = 0
  while (i < raw.length) {
    const nl = raw.indexOf(0x0a, i)
    if (nl < 0) break
    const [sha, type, sizeText] = raw.toString('utf8', i, nl).split(' ')
    if (type !== 'blob') { i = nl + 1; continue }   // missing / tree / commit
    const size = Number(sizeText)
    const start = nl + 1
    const head = raw.subarray(start, Math.min(start + 16, start + size))
    i = start + size + 1
    scanned += 1

    const hit = sniff(head, size)
    if (!hit) continue
    const paths = [...(wherePaths.get(sha) ?? [])]
    // 우리 것만 있는 블롭은 넘어간다. 하나라도 다른 자리에 있으면 남긴다
    if (paths.length > 0 && paths.every((p) => OURS.test(p))) continue
    const slot = found.get(hit.kind) ?? { why: hit.why, bytes: 0, blobs: 0, paths: new Set() }
    slot.bytes += size
    slot.blobs += 1
    for (const p of paths) slot.paths.add(p)
    found.set(hit.kind, slot)
  }

  console.log(`\n내용으로 훑기 — 블롭 ${String(scanned)}개를 열어 머리 바이트를 봤다:`)
  if (found.size === 0) {
    console.log('  ✓ 걸리는 종류 없음')
  } else {
    for (const [kind, s] of [...found].sort((a, b) => b[1].bytes - a[1].bytes)) {
      const sample = [...s.paths].slice(0, 3).join(' · ')
      console.log(`  ⚠️ ${kind.padEnd(7)} 블롭 ${String(s.blobs).padStart(5)} · ${mb(s.bytes).padStart(8)}   ${s.why}`)
      console.log(`       경로 ${String(s.paths.size)}개 예: ${sample}`)
    }
    console.log('  ↑ 이름이 아니라 내용으로 가린 것이다. 우리가 그린 앱 셸 이미지는 뺐다')
  }
}

// ── 큰 블롭 ──────────────────────────────────────────────────────────────────
console.log('\n히스토리에서 가장 큰 블롭 10개:')
const all = git('rev-list', '--all', '--objects')
  .split('\n').map((l) => l.trim()).filter(Boolean)
const paths = new Map()
for (const line of all) {
  const at = line.indexOf(' ')
  if (at > 0) paths.set(line.slice(0, at), line.slice(at + 1))
}
const sizes = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
  { cwd: ROOT, input: [...paths.keys()].join('\n'), encoding: 'utf8', maxBuffer: 1 << 28 })
const blobs = sizes.split('\n')
  .map((l) => l.trim().split(' '))
  .filter((p) => p[1] === 'blob')
  .map(([sha, , size]) => ({ sha, size: Number(size), path: paths.get(sha) ?? '?' }))
  .sort((a, b) => b.size - a.size)
for (const b of blobs.slice(0, 10)) {
  console.log(`  ${mb(b.size).padStart(9)}  ${b.path}`)
}
const historyBytes = blobs.reduce((a, b) => a + b.size, 0)

// ── 결론 ─────────────────────────────────────────────────────────────────────
console.log(`\n히스토리 블롭 전체: ${String(blobs.length)}개 · ${mb(historyBytes)}`)
if (dirty.length === 0) {
  console.log('\n지워야 할 것 없음.')
  process.exit(0)
}
console.log(`지워야 할 것: 블롭 ${String(totalBlobs)}개 · ${mb(totalBytes)}`)

console.log(`
⚠️ **다시 쓰기는 여기서 안 한다.** 파괴적이고 되돌릴 수 없다.
   COPYRIGHT.md §9가 "별도 승인 아래"라고 적어 둔 자리다.

승인이 나면 이 순서다:

  ① 백업 — 지금 상태를 통째로 복사한다. 다시 쓰기가 잘못돼도 돌아올 곳이 있어야 한다
       git bundle create ../radiant-platinum-backup.bundle --all
       (또는 폴더째 복사. \`.git\`을 포함해야 한다)

  ② 확인 — 지금 작업 트리가 깨끗하고, 다른 클론이 없는지 본다
       git status --short
       git worktree list

  ③ 다시 쓰기 — git-filter-repo (git 기본 filter-branch보다 안전하고 빠르다)
${dirty.map((d) => `       git filter-repo --invert-paths --path ${d.path}`).join('\n')}

  ④ 확인 — 이 스크립트를 다시 돌린다. 전부 ✓ 여야 한다
       pnpm audit:history

  ⑤ 그 뒤에 처음으로 리모트를 만든다. **다시 쓰기 전에 push하면 소용없다** —
     한 번 올라간 객체는 남의 클론과 GitHub의 캐시에 남는다

${remotes ? '⚠️ 이미 리모트가 있다. 위 ⑤가 이미 늦었을 수 있다 — 그쪽도 함께 정리해야 한다.\n' : ''}`)
process.exitCode = 1
