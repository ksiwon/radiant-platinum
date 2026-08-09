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
