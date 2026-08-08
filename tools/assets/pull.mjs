// 에셋을 채운다 (COPYRIGHT.md §5 · §6).
//
//     pnpm assets:check                     무엇이 없는지만 본다
//     pnpm assets:pull                      버킷에서 받는다
//     pnpm assets:pull --from=https://…/    버킷 주소를 그 자리에서 준다
//     pnpm assets:pull --group=chunks       한 그룹만
//
// ⚠️ **버킷이 없으면 못 받는다는 닭과 달걀이 있다.** R2를 세우는 일이 히스토리
// 정리를 막으면 안 되므로 **두 갈래**로 만든다 — 주소가 있으면 받고, 없으면
// `raw/`에서 무엇을 돌려야 하는지 그룹별로 찍고 선다. 두 번째 갈래는 버킷이
// 하나도 없는 오늘도 그대로 쓸모가 있다: 지금은 자료가 없을 때 "무엇이 없고
// 무엇을 돌리면 되는지" 알려 주는 것이 아무 데도 없다.
//
// ⚠️ **주소는 코드에 안 박는다.** 채널은 언젠가 죽는다는 전제가 §6이다.
// `PT_ASSET_ORIGIN` 또는 `--from`으로만 들어온다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = resolve(ROOT, 'public')
const MANIFEST = resolve(ROOT, 'assets-manifest.json')

/** 한 번에 몇 개나 받을 것인가. 6,500개를 하나씩 받으면 왕복만으로 끝난다 */
const LANES = 16

const args = process.argv.slice(2)
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}
const has = (name) => args.includes(`--${name}`)

const checkOnly = has('check')
const only = args.filter((a) => a.startsWith('--group=')).map((a) => a.slice(8))
const origin = flag('from') ?? process.env.PT_ASSET_ORIGIN

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    console.error('assets-manifest.json이 없다. `pnpm assets:manifest`로 굽는다.')
    console.error('  (자료가 다 있는 기계에서 한 번 구워 리포에 넣는 파일이다)')
    process.exit(2)
  }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

/** 이 파일이 매니페스트와 같은가. 없으면 'missing', 다르면 'stale' */
function stateOf(path, [size, hash]) {
  const at = resolve(PUBLIC, path)
  if (!existsSync(at)) return 'missing'
  if (statSync(at).size !== size) return 'stale'
  const got = createHash('sha256').update(readFileSync(at)).digest('hex').slice(0, 16)
  return got === hash ? 'ok' : 'stale'
}

async function download(url, to) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  const bytes = Buffer.from(await r.arrayBuffer())
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, bytes)
}

/** 목록을 LANES개씩 굴린다 */
async function inLanes(items, work) {
  let at = 0
  const runner = async () => {
    while (at < items.length) {
      const mine = items[at++]
      await work(mine)
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, items.length) }, runner))
}

async function main() {
  const { groups } = loadManifest()
  const names = only.length > 0 ? only : Object.keys(groups)
  const unknown = names.filter((n) => !groups[n])
  if (unknown.length > 0) {
    console.error(`모르는 그룹: ${unknown.join(' · ')}`)
    console.error(`  있는 것: ${Object.keys(groups).join(' · ')}`)
    process.exit(2)
  }

  // 무엇이 없는지부터 센다. 받든 안 받든 이 숫자가 먼저다
  const want = []
  const report = []
  for (const name of names) {
    const g = groups[name]
    const bad = Object.entries(g.files)
      .map(([path, spec]) => [path, stateOf(path, spec)])
      .filter(([, s]) => s !== 'ok')
    if (bad.length > 0) {
      report.push({ name, make: g.make, bad })
      want.push(...bad.map(([path]) => path))
    }
  }

  if (want.length === 0) {
    console.log(`에셋 ${names.length}그룹 전부 매니페스트와 같다.`)
    return
  }

  for (const { name, make, bad } of report) {
    const missing = bad.filter(([, s]) => s === 'missing').length
    const stale = bad.length - missing
    console.log(
      `${name.padEnd(16)} 없음 ${String(missing).padStart(5)}`
      + `${stale > 0 ? ` · 다름 ${stale}` : ''}   ${make}`)
  }
  console.log(`— 모두 ${want.length}개`)

  if (checkOnly) { process.exitCode = 1; return }

  if (!origin) {
    // ⚠️ 여기가 두 번째 갈래다. 버킷이 없는 동안에도 이 도구가 쓸모 있어야 한다
    console.log('')
    console.log('버킷 주소가 없다. 위 명령을 `raw/`가 있는 기계에서 돌리면 같은 것이 나온다.')
    console.log('  받아서 채우려면: PT_ASSET_ORIGIN=https://…/ 또는 --from=https://…/')
    process.exitCode = 1
    return
  }

  const from = origin.endsWith('/') ? origin : `${origin}/`
  let done = 0
  const failed = []
  await inLanes(want, async (path) => {
    try {
      await download(from + path, resolve(PUBLIC, path))
      done += 1
      if (done % 200 === 0) console.log(`  ${done}/${want.length}`)
    } catch (e) {
      failed.push(`${path}: ${e.message}`)
    }
  })
  console.log(`받았다: ${done}/${want.length}`)
  if (failed.length > 0) {
    console.error(`실패 ${failed.length}개:\n  ${failed.slice(0, 10).join('\n  ')}`)
    process.exitCode = 1
  }
}

await main()
