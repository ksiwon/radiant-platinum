// `assets-manifest.json`을 굽는다 (COPYRIGHT.md §5 · §6).
//
//     pnpm assets:manifest
//
// 롬에서 나온 것은 리포에 안 들어간다. 그러면 새 기계에는 **무엇이 있어야 하는지**를
// 아는 것이 아무것도 없다 — 파일이 없는 것과 원래 없는 것이 구별되지 않는다.
// 이 매니페스트가 그 목록이고, `pull.mjs`가 이걸 읽는다.
//
// 담는 것은 **경로 · 크기 · 짧은 해시**뿐이다. 롬 바이트가 아니라 롬 바이트의
// 목차라, 이것만은 리포에 들어간다.
//
// ⚠️ **해시를 8바이트로 자른다.** sha256 전부를 넣으면 6,500줄 × 64자로 매니페스트가
// 자료보다 더 자주 바뀌는 덩치가 된다. 자른 해시는 무결성 증명이 아니라 **바뀐 것을
// 알아채는 장치**다 — 크기가 같은데 내용이 달라지는 경우(추출기를 고쳤을 때)가
// 실제로 잦아서 크기만으로는 모자란다.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUPS, ownerOf } from './groups.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const MANIFEST = resolve(ROOT, 'assets-manifest.json')

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

function main() {
  const groups = scan()
  const total = Object.values(groups).reduce(
    (a, g) => ({ count: a.count + g.count, bytes: a.bytes + g.bytes }), { count: 0, bytes: 0 })
  const empty = GROUPS.filter((g) => !groups[g.name]).map((g) => g.name)
  if (empty.length > 0) {
    // 세우지는 않는다 — 없는 채로 굽고 싶은 경우가 있다. 다만 조용히 두지 않는다
    console.warn(`⚠️ 비어 있는 그룹 ${empty.length}개: ${empty.join(' · ')}`)
    console.warn('   지금 디스크에 그 자료가 없다. 매니페스트에도 안 들어간다.')
  }
  mkdirSync(dirname(MANIFEST), { recursive: true })
  writeFileSync(MANIFEST, `${JSON.stringify({ version: 1, groups }, null, 0)}\n`)
  const size = statSync(MANIFEST).size
  console.log(
    `에셋 ${total.count}개 · ${(total.bytes / 1048576).toFixed(1)}MB`
    + ` → assets-manifest.json (${(size / 1024).toFixed(0)}KB)`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
