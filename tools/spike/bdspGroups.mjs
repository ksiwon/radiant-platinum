// BDSP 그룹 변환기를 진짜 폴더로 돌려 본다 (개발용 스파이크).
//
//     node --import ./tools/spike/tsResolve.mjs --experimental-strip-types \
//       tools/spike/bdspGroups.mjs <그룹> [--only a,b] [--out <자리>]
//
// ⚠️ **정상 빌드·시험 경로가 아니다.** 공개판에서 이 코드는 Worker 안에서
// `handler.ts`가 만든 `BdspSource`로 돈다. 여기서는 같은 계약을 `node:fs`로
// 흉내 내서, vitest 없이 몇 초 만에 실제 산출물을 만들어 본다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createRequire } from 'node:module'

const require0 = createRequire(import.meta.url)
const sources = require0('../raw/sources.cjs')
const ROOT = sources.ROOT
const AA = sources.requireDir('bdsp.root')

const { BDSP_GROUPS } = await import('../../src/import/bdsp/convert.ts')

/** `handler.ts`의 `rootedBdspSource`와 같은 계약 — 뿌리 기준 상대 경로 */
function dirSource(root) {
  let listed = null
  const walk = async (at, rel) => {
    const out = []
    for (const e of await readdir(at, { withFileTypes: true })) {
      const child = `${rel}${rel ? '/' : ''}${e.name}`
      if (e.isDirectory()) out.push(...await walk(resolve(at, e.name), child))
      else out.push(child)
    }
    return out
  }
  return {
    list() { listed ??= walk(root, ''); return listed },
    async read(path) {
      try { return new Uint8Array(await readFile(resolve(root, path))) } catch { return null }
    },
  }
}

const args = process.argv.slice(2)
const want = args.filter((a) => !a.startsWith('--'))
const flag = (name) => {
  const at = args.indexOf(`--${name}`)
  return at < 0 ? null : args[at + 1]
}

const outDir = resolve(ROOT, flag('out') ?? 'raw/work/browserModels')
const only = flag('only')?.split(',').filter(Boolean) ?? null

const specs = BDSP_GROUPS.filter((g) => want.length === 0 || want.includes(g.name))
if (specs.length === 0) {
  console.error(`그룹을 못 찾았다. 있는 것: ${BDSP_GROUPS.map((g) => g.name).join(' · ')}`)
  process.exit(1)
}

const src = dirSource(AA)
for (const spec of specs) {
  const started = Date.now()
  let files = 0
  let bytes = 0
  const emit = (path, data) => {
    // `--only`는 굽는 대상을 줄이는 것이 아니라 **쓰는 것**만 줄인다. 표(index)는
    // 늘 나와야 무엇이 빠졌는지 보인다
    if (only && !only.some((k) => path.includes(k)) && !path.endsWith('.json')) return
    const at = resolve(outDir, path)
    mkdirSync(resolve(at, '..'), { recursive: true })
    writeFileSync(at, data)
    files++
    bytes += data.byteLength
  }
  let last = 0
  const ctx = {
    locale: 'en',
    bdsp: src,
    emit,
    onProgress: (done, total) => {
      const now = Date.now()
      if (now - last < 2000 && done !== total) return
      last = now
      process.stdout.write(`  ${spec.name} ${done}/${total}\n`)
    },
  }
  const rest = await spec.convert(ctx)
  for (const [path, data] of rest) emit(path, data)
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`${spec.name}: 파일 ${files}개 · ${(bytes / 1e6).toFixed(1)}MB · ${secs}초`
    + ` → ${relative(ROOT, outDir)}`)
}

void readFileSync
