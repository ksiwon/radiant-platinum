// 이야기 연출의 3D 모델 — 노드 쪽 (DATA.md §2.21f)
//
//     node --experimental-strip-types --import ./tools/extract/tsResolve.mjs tools/extract/demoModels.mjs
//
// **읽는 코드를 여기 다시 적지 않는다** — 브라우저 변환기(`src/import/platinum/demoModels.ts`)를 그대로 부르고,
// 여기서는 롬을 열어 넘기고 산출물을 `public/`에 쓴다. 그래야 개발 서버와 설치본이 안 갈린다 (「굽는 쪽이 둘이다」)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { convertDemoModels, DEMO_MODELS } from '../../src/import/platinum/demoModels.ts'

const require = createRequire(import.meta.url)
const { openRom, ROOT } = require('./rom')

async function main() {
  const rom = openRom()
  const ctx = {
    fs: { read: async (p) => { try { return new Uint8Array(rom.read(p)) } catch { return null } } },
    locale: 'en',
    release: null,
  }
  const out = await convertDemoModels(ctx)
  let bytes = 0
  for (const [rel, data] of out) {
    const file = path.join(ROOT, 'public', rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
    bytes += data.length
  }
  console.log(`연출 모델 ${DEMO_MODELS.length}개 → 파일 ${out.size}개 · ${(bytes / 1024).toFixed(1)}KB`)
}

await main()
