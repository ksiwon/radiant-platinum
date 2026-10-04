// BDSP 배틀 이펙트를 `public/data/fx/`로 굽는다 (docs/orders/BATTLE_FX_20261004.md §4).
//
//     pnpm extract:fx
//     (= node --import ./tools/spike/tsResolve.mjs --experimental-strip-types tools/extract/bdspFx.mjs)
//
// ⚠️ **굽는 코드는 설치기와 같은 것이다** — `src/import/bdsp/fx.ts`의 `convertBattleFx`를 그대로 부른다.
// 여기서 하는 일은 `handler.ts`의 `BdspSource` 계약을 `node:fs`로 흉내 내 `raw/AssetAssistant`를 넘기는 것뿐이다.
// 그래서 개발 산출물과 설치본이 갈릴 자리가 없다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createRequire } from 'node:module'

const require0 = createRequire(import.meta.url)
const sources = require0('../raw/sources.cjs')
const ROOT = sources.ROOT
const AA = sources.requireDir('bdsp.root')
const OUT = resolve(ROOT, 'public')

const { convertBattleFx } = await import('../../src/import/bdsp/fx.ts')

/** 뿌리 기준 상대 경로 (`handler.ts`의 `rootedBdspSource`와 같은 계약) */
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

const started = Date.now()
const kinds = new Map()
const emit = (path, data) => {
  const at = resolve(OUT, path)
  mkdirSync(resolve(at, '..'), { recursive: true })
  writeFileSync(at, data)
  const kind = path.split('/')[2]?.includes('.') ? path.split('/')[2] : path.split('/')[2] ?? path
  const k = kinds.get(kind) ?? { files: 0, bytes: 0 }
  k.files++
  k.bytes += data.byteLength
  kinds.set(kind, k)
}
let last = 0
const rest = await convertBattleFx({
  locale: 'en',
  bdsp: dirSource(AA),
  emit,
  onProgress: (done, total) => {
    const now = Date.now()
    if (now - last < 5000 && done !== total) return
    last = now
    process.stdout.write(`  battleFx ${done}/${total}\n`)
  },
})
for (const [path, data] of rest) emit(path, data)

let files = 0
let bytes = 0
for (const [kind, k] of kinds) {
  files += k.files
  bytes += k.bytes
  console.log(`  ${kind}: ${k.files}개 · ${(k.bytes / 1e6).toFixed(1)}MB`)
}
console.log(`battleFx: 파일 ${files}개 · ${(bytes / 1e6).toFixed(1)}MB · ${((Date.now() - started) / 1000).toFixed(1)}초 → ${relative(ROOT, resolve(OUT, 'data/fx'))}`)
