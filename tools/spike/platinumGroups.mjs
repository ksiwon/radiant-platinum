// 플래티넘 그룹 변환기를 진짜 롬으로 돌려 개발 산출물과 **바이트로** 맞대 본다.
//
//     node --import ./tools/spike/tsResolve.mjs --experimental-strip-types \
//       tools/spike/platinumGroups.mjs <그룹…> [--locale en]
//
// ⚠️ **정상 시험 경로가 아니다.** `convert.test.ts`가 같은 것을 vitest로 재는데,
// 변환에 100초가 걸려서 고치며 재는 짧은 고리에는 못 쓴다.
import { readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const sources = req('../raw/sources.cjs')
const ROOT = sources.ROOT

const { openNds } = await import('../../src/import/platinum/nds.ts')
const { GROUPS } = await import('../../src/import/platinum/convert.ts')
const { SUPPORTED } = await import('../../src/import/platinum/validate.ts')

const args = process.argv.slice(2)
const want = args.filter((a) => !a.startsWith('--'))
const flag = (n) => { const at = args.indexOf(`--${n}`); return at < 0 ? null : args[at + 1] }
const locale = flag('locale') ?? 'en'

function fileSource(path) {
  const size = statSync(path).size
  return {
    size,
    slice(start, end) {
      const want2 = Math.max(0, Math.min(end, size) - start)
      const out = Buffer.alloc(want2)
      const fd = openSync(path, 'r')
      try { readSync(fd, out, 0, want2, start) } finally { closeSync(fd) }
      return Promise.resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
    },
  }
}

const romPath = sources.requirePlatinumRom(locale)
const fs2 = await openNds(fileSource(romPath))
const release = SUPPORTED.releases.find((r) => r.locale === locale)
const specs = GROUPS.filter((g) => g.convert && (want.length === 0 || want.includes(g.name)))
if (specs.length === 0) { console.error('그룹을 못 찾았다'); process.exit(1) }

const { decodePngBytes } = req('./png-decode.js')

for (const spec of specs) {
  const started = Date.now()
  const produced = await spec.convert({ fs: fs2, locale, release })
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`${spec.name} (${secs}초)`)
  const pngs = []
  for (const [path, bytes] of produced) {
    const dev = resolve(ROOT, 'public', path)
    if (!existsSync(dev)) { console.log(`  ${path}  개발 산출물이 없다 (${bytes.length}B)`); continue }
    const have = readFileSync(dev)
    // ⚠️ **PNG는 바이트가 같을 수가 없다.** 노드는 zlib으로 굽고 브라우저는
    // `CompressionStream`으로 굽는다 — deflate 구현이 다르면 같은 픽셀도 다른
    // 바이트가 된다. 그래서 PNG는 **펴서 픽셀로** 견주고 한 줄로 모아 적는다
    if (path.endsWith('.png')) { pngs.push([path, have, bytes]); continue }
    const same = have.length === bytes.length && have.every((b, i) => b === bytes[i])
    console.log(`  ${path.padEnd(38)} ${same ? '바이트까지 같다' : `다르다 (${have.length}B ↔ ${bytes.length}B)`}`)
    if (!same && path.endsWith('.json')) {
      try {
        const a = JSON.parse(have.toString('utf8'))
        const b = JSON.parse(Buffer.from(bytes).toString('utf8'))
        console.log(`    JSON 뜻으로는 ${JSON.stringify(a) === JSON.stringify(b) ? '같다 (키 순서만 다르다)' : '다르다'}`)
      } catch { /* JSON이 아니다 */ }
    }
  }

  if (pngs.length > 0) {
    let worst = 0
    let differing = 0
    const broken = []
    for (const [path, have, bytes] of pngs) {
      const a = decodePngBytes(have, path)
      const b = decodePngBytes(bytes, path)
      if (a.width !== b.width || a.height !== b.height) {
        broken.push(`${path} 크기 ${a.width}×${a.height} ↔ ${b.width}×${b.height}`)
        continue
      }
      let max = 0
      for (let i = 0; i < a.pixels.length; i++) max = Math.max(max, Math.abs(a.pixels[i] - b.pixels[i]))
      if (max > 0) { differing++; worst = Math.max(worst, max) }
    }
    const verdict = broken.length > 0
      ? `크기가 다른 것 ${broken.length}장: ${broken.slice(0, 3).join(' / ')}`
      : differing === 0
        ? '픽셀까지 같다 (바이트는 deflate 구현 차이)'
        : `픽셀이 다른 것 ${differing}장 · 최대 ${worst}/255`
    console.log(`  PNG ${pngs.length}장${' '.repeat(Math.max(1, 38 - 8 - String(pngs.length).length))}${verdict}`)
  }
}
