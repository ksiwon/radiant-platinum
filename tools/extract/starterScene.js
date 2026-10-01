// 파트너 고르는 장면의 3D 모델 — 노드 쪽 (DATA.md §2.14)
//
//     node tools/extract/starterScene.js
//
// **읽는 코드를 여기 다시 적지 않는다** — 브라우저 변환기(`src/import/platinum/starterScene.ts`)를
// 그대로 부르고, 여기서는 롬을 열어 넘기고 산출물을 `public/`에 쓴다. 그래야 개발 서버와 설치본이
// 안 갈린다 (「굽는 쪽이 둘이다」). 무엇을 굽는지는 그쪽 머리말에 있다.
//
// ⚠️ **스스로를 한 번 다시 띄운다.** 변환기가 TypeScript라 `--experimental-strip-types`와
// 확장자 해석 훅(`tsResolve.mjs`)이 있어야 읽힌다 — `pnpm extract:starterScene`이 플래그 없이
// 부르므로, 플래그가 없으면 같은 파일을 플래그를 붙여 다시 돌리고 그 종료 코드를 그대로 낸다.
'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { pathToFileURL } = require('url')
const { openRom, ROOT } = require('./rom')

const FLAG = '--experimental-strip-types'

async function main() {
  const { convertStarterScene } = await import(
    pathToFileURL(path.join(ROOT, 'src/import/platinum/starterScene.ts')).href
  )
  const rom = openRom()
  const ctx = {
    fs: { read: async (p) => { try { return new Uint8Array(rom.read(p)) } catch { return null } } },
    locale: 'en',
    release: null,
  }
  const out = await convertStarterScene(ctx)
  let bytes = 0
  const rows = []
  for (const [rel, data] of out) {
    const file = path.join(ROOT, 'public', rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
    bytes += data.length
    rows.push(`  ${rel} ${(data.length / 1024).toFixed(1)}KB`)
  }
  const index = JSON.parse(Buffer.from(out.get('data/starter/index.json')).toString('utf8'))
  const clips = Object.entries(index.clips).map(([id, n]) => `${id}:${n}`).join(' · ')
  console.log(`파트너 고르는 장면 — 모델 ${index.models.length}개 · 파일 ${out.size}개 · ${(bytes / 1024).toFixed(1)}KB`)
  console.log(`  애니 프레임 ${clips} · 글창 색 ${index.text.length}`)
  console.log(rows.join('\n'))
}

if (process.execArgv.includes(FLAG)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
} else {
  const got = spawnSync(
    process.execPath,
    [FLAG, '--no-warnings', '--import', './tools/extract/tsResolve.mjs', __filename],
    { cwd: ROOT, stdio: 'inherit' },
  )
  process.exit(got.status ?? 1)
}
