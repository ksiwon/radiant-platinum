// 소품 애니 표 — 노드 쪽 (DATA.md §2.31)
//
//     node --experimental-strip-types tools/extract/propAnims.mjs
//
// 소품 번호 → 애니 아카이브 번호, 그리고 그 아카이브가 무엇이고 몇 프레임인가.
// **읽는 코드를 여기 다시 적지 않는다** — 브라우저 변환기
// (`src/import/platinum/propAnims.ts`)와 같은 함수를 부른다. 그래야 개발
// 서버와 설치본이 안 갈린다 (「굽는 쪽이 둘이다」).
import { createRequire } from 'node:module'
import { buildPropAnims, DOOR_KIND } from '../../src/import/platinum/propAnims.ts'

const require = createRequire(import.meta.url)
const { openRom, writeJson } = require('./rom')

function main() {
  const rom = openRom()
  const list = new Uint8Array(rom.read('/arc/bm_anime_list.narc'))
  const anime = new Uint8Array(rom.read('/arc/bm_anime.narc'))
  const index = buildPropAnims(list, anime)

  const props = Object.keys(index.props).length
  const kinds = {}
  for (const m of index.members) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1
  const doors = Object.keys(DOOR_KIND).filter((id) => index.props[id] !== undefined)

  const out = writeJson('props/anims.json', index)
  console.log(
    `애니 있는 소품 ${props}개 · 애니 멤버 ${index.members.length}개 ` +
    `(${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · ')})`,
  )
  console.log(`  문 ${doors.length}/20 · 자전거 비탈 ${index.slopes.join(',')} · ${out.rel} ${out.kb}KB`)
}

main()
