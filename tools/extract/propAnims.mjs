// 소품 애니 표 — 노드 쪽 (DATA.md §2.31)
//
//     node --experimental-strip-types tools/extract/propAnims.mjs
//
// 소품 번호 → 애니 아카이브 번호, 그 아카이브가 무엇이고 몇 프레임인가, 그리고
// 애니가 있는 소품의 **모델 속살**(조각이 붙은 노드 · 노드 기본 변환 · 재질
// 이름 · 텍셀→UV 배수). **읽는 코드를 여기 다시 적지 않는다** — 브라우저 변환기
// (`src/import/platinum/propAnims.ts`)와 같은 함수를 부른다. 그래야 개발 서버와
// 설치본이 안 갈린다 (「굽는 쪽이 둘이다」).
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { buildPropAnims, DOOR_KIND, propModelInfo } from '../../src/import/platinum/propAnims.ts'
import { readDict, parseModel, parseNodes } from '../../src/import/platinum/nsbmd.ts'
import { blocks, parseMaterials, readSbc } from '../../src/import/platinum/chunks.ts'
import { narcEntry } from '../../src/import/platinum/nds.ts'

const require = createRequire(import.meta.url)
const { openRom, writeJson, ROOT } = require('./rom')
const { join } = require('node:path')

/** 소품 하나의 노드·짝·재질 */
function openProp(file) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const found = blocks(file, view)
  const mdlAt = found.MDL0
  if (mdlAt === undefined) throw new Error('MDL0가 없다')
  const dict = readDict(file, view, mdlAt + 8)
  const modelAt = mdlAt + view.getUint32(dict[0].at, true)
  const header = parseModel(file, view, modelAt)
  return {
    nodes: parseNodes(file, view, modelAt),
    pairs: readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset),
    materials: parseMaterials(file, view, modelAt, header),
  }
}

function main() {
  const rom = openRom()
  const list = new Uint8Array(rom.read('/arc/bm_anime_list.narc'))
  const anime = new Uint8Array(rom.read('/arc/bm_anime.narc'))
  const props = new Uint8Array(rom.read('/fielddata/build_model/build_model.narc'))

  // 애니가 있는 소품이 누구인지 먼저 알아야 속살을 그것만 뽑는다
  const first = buildPropAnims(list, anime)
  const models = {}
  for (const id of Object.keys(first.index.props)) {
    const file = narcEntry(props, Number(id))
    if (!file) throw new Error(`소품 ${id}이 build_model에 없다`)
    const { nodes, pairs, materials } = openProp(file)
    models[id] = propModelInfo(nodes, pairs, materials)
  }
  const { index, bytes } = buildPropAnims(list, anime, models)

  const count = Object.keys(index.props).length
  const kinds = {}
  for (const m of index.members) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1
  const doors = Object.keys(DOOR_KIND).filter((id) => index.props[id] !== undefined)

  const out = writeJson('props/anims.json', index)
  const binPath = join(ROOT, 'public/data/props/anims.bin')
  writeFileSync(binPath, bytes)
  console.log(
    `애니 있는 소품 ${count}개 · 애니 멤버 ${index.members.length}개 ` +
    `(${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · ')})`,
  )
  console.log(`  문 ${doors.length}/20 · 자전거 비탈 ${index.slopes.join(',')}`
    + ` · 노드 실은 소품 ${Object.keys(models).length}`
    + ` · ${out.rel} ${out.kb}KB · anims.bin ${(bytes.length / 1024).toFixed(1)}KB`)
}

main()
