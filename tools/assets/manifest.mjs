// 개발 기계의 에셋 목차를 굽는다 (COPYRIGHT.md §5).
//
//     pnpm assets:manifest            지금 디스크 상태로 다시 굽는다
//     pnpm assets:manifest --check    목차와 디스크가 다른 곳만 찍는다
//
// **로컬 개발 전용이다.** 담는 것은 원본 유래 산출물의 경로·크기·짧은 해시고,
// 그것은 목차이면서 동시에 목록이다 — 그래서 리포에 안 넣는다. 한때 뿌리의
// `assets-manifest.json`을 추적했고 거기에 7,086개가 들어 있었다. 지금은
// `raw/work/assets-manifest.local.json`에만 쓴다. `.gitignore`가 두 이름을
// 모두 막는다.
//
// ⚠️ **어디서도 받아 오지 않는다.** 예전의 `assets:pull`은 `PT_ASSET_ORIGIN`
// 버킷에서 원본 유래 산출물을 내려받았다. 공개 모델은 사용자가 자기 기계에서
// 롬을 골라 브라우저 안에서 만드는 것이라, 서버가 그것을 주는 경로는 설계와
// 정면으로 어긋난다. 없으면 `make`에 적힌 추출기를 돌린다.
//
// ⚠️ **해시를 8바이트로 자른다.** sha256 전부를 넣으면 6,500줄 × 64자로 목차가
// 자료보다 더 자주 바뀌는 덩치가 된다. 자른 해시는 무결성 증명이 아니라 **바뀐 것을
// 알아채는 장치**다 — 크기가 같은데 내용이 달라지는 경우(추출기를 고쳤을 때)가
// 실제로 잦아서 크기만으로는 모자란다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUPS, ownerOf } from './groups.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 이미 무시되는 자리. `raw/`째로 `.gitignore`에 들어 있다 */
export const MANIFEST = resolve(ROOT, 'raw/work/assets-manifest.local.json')

/** 매니페스트가 덮는 나무. 둘 다 `public/` 아래고 둘 다 롬에서 나온다 */
const TREES = ['data', 'models']

/** sha256의 앞 8바이트. 6,500개 사이에서 우연히 겹칠 일은 없다 */
function shortHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

function walk(dir, prefix, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // 그 나무가 통째로 없다. 부르는 쪽이 판단한다
  }
  // ⚠️ 정렬한다. 안 하면 기계마다 순서가 달라져서 매니페스트가 매번 다른 diff를
  // 낸다 — 그러면 "무엇이 바뀌었나"를 아무도 못 읽는다
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const at = resolve(dir, e.name)
    const rel = `${prefix}/${e.name}`
    if (e.isDirectory()) walk(at, rel, out)
    else out.push(rel)
  }
  return out
}

/** 지금 디스크에 있는 것을 그룹으로 나눈다. 임자 없는 파일이 있으면 선다 */
export function scan() {
  const files = TREES.flatMap((t) => walk(resolve(ROOT, 'public', t), t, []))
  const orphans = files.filter((f) => ownerOf(f) === null)
  if (orphans.length > 0) {
    throw new Error(
      `임자 없는 에셋 ${orphans.length}개 — 어느 추출기가 만드는지 모른다:\n`
      + `  ${orphans.slice(0, 10).join('\n  ')}\n`
      + `${orphans.length > 10 ? `  … 외 ${orphans.length - 10}개\n` : ''}`
      + '  tools/assets/groups.mjs에 짝을 적는다. 그래야 없을 때 무엇을 돌릴지 알 수 있다.',
    )
  }

  const groups = {}
  for (const path of files) {
    const owner = ownerOf(path)
    const bytes = statSync(resolve(ROOT, 'public', path)).size
    const g = (groups[owner.name] ??= { make: owner.make, count: 0, bytes: 0, files: {} })
    g.files[path] = [bytes, shortHash(readFileSync(resolve(ROOT, 'public', path)))]
    g.count += 1
    g.bytes += bytes
  }
  // 그룹 순서도 `GROUPS` 차례로 고정한다
  const ordered = {}
  for (const g of GROUPS) if (groups[g.name]) ordered[g.name] = groups[g.name]
  return ordered
}

/** 이 파일이 목차와 같은가. 없으면 'missing', 다르면 'stale' */
function stateOf(path, [size, hash]) {
  const at = resolve(ROOT, 'public', path)
  if (!existsSync(at)) return 'missing'
  if (statSync(at).size !== size) return 'stale'
  return shortHash(readFileSync(at)) === hash ? 'ok' : 'stale'
}

/**
 * 목차와 디스크가 어디서 갈리는지 찍는다. **받아 오지 않는다** —
 * 무엇이 없고 무엇을 돌리면 되는지만 알려 준다
 */
function check() {
  if (!existsSync(MANIFEST)) {
    console.error(`목차가 없다: ${MANIFEST}`)
    console.error('  자료가 다 있는 기계에서 `pnpm assets:manifest`로 한 번 굽는다.')
    process.exitCode = 2
    return
  }
  const { groups } = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  let bad = 0
  for (const [name, g] of Object.entries(groups)) {
    const off = Object.entries(g.files)
      .map(([path, spec]) => stateOf(path, spec))
      .filter((s) => s !== 'ok')
    if (off.length === 0) continue
    const missing = off.filter((s) => s === 'missing').length
    bad += off.length
    console.log(
      `${name.padEnd(16)} 없음 ${String(missing).padStart(5)}`
      + `${off.length > missing ? ` · 다름 ${off.length - missing}` : ''}   ${g.make}`)
  }
  if (bad === 0) { console.log(`에셋 ${Object.keys(groups).length}그룹 전부 목차와 같다.`); return }
  console.log(`— 모두 ${bad}개. 위 명령을 raw/가 있는 기계에서 돌리면 같은 것이 나온다.`)
  process.exitCode = 1
}

function main() {
  if (process.argv.includes('--check')) { check(); return }
  const groups = scan()
  const total = Object.values(groups).reduce(
    (a, g) => ({ count: a.count + g.count, bytes: a.bytes + g.bytes }), { count: 0, bytes: 0 })
  const empty = GROUPS.filter((g) => !groups[g.name]).map((g) => g.name)
  if (empty.length > 0) {
    // 세우지는 않는다 — 없는 채로 굽고 싶은 경우가 있다. 다만 조용히 두지 않는다
    console.warn(`⚠️ 비어 있는 그룹 ${empty.length}개: ${empty.join(' · ')}`)
    console.warn('   지금 디스크에 그 자료가 없다. 목차에도 안 들어간다.')
  }
  mkdirSync(dirname(MANIFEST), { recursive: true })
  writeFileSync(MANIFEST, `${JSON.stringify({ version: 1, groups }, null, 0)}\n`)
  const size = statSync(MANIFEST).size
  console.log(
    `에셋 ${total.count}개 · ${(total.bytes / 1048576).toFixed(1)}MB`
    + ` → raw/work/assets-manifest.local.json (${(size / 1024).toFixed(0)}KB)`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
