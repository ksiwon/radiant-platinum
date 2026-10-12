// 엔딩 크레딧의 그림 — 노드 쪽 (DATA.md §2.26)
//
//     node --experimental-strip-types --import ./tools/extract/tsResolve.mjs tools/extract/creditsArt.mjs
//
// **읽는 코드를 여기 다시 적지 않는다** — 브라우저 변환기(`src/import/platinum/creditsArt.ts`)를 그대로 부르고, 여기서는
// 롬을 열어 넘기고 산출물을 `public/`에 쓴다 (`demoModels.mjs`와 같은 방식 — 「굽는 쪽이 둘이다」)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { convertCreditsArt } from '../../src/import/platinum/creditsArt.ts'

const require = createRequire(import.meta.url)
const { openRom, ROOT } = require('./rom')

async function main() {
  const rom = openRom()
  const ctx = {
    fs: { read: async (p) => { try { return new Uint8Array(rom.read(p)) } catch { return null } } },
    locale: 'en',
    release: null,
  }
  const out = await convertCreditsArt(ctx)
  let bytes = 0
  for (const [rel, data] of out) {
    const file = path.join(ROOT, 'public', rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
    bytes += data.length
  }
  console.log(`크레딧 그림 → 파일 ${out.size}개 · ${(bytes / 1024).toFixed(1)}KB`)
}

await main()
