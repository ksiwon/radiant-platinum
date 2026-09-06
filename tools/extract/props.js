// 맵 소품(건물) 모델 (DATA.md §2.2)
//
// 집·간판·표지판은 청크 모델에 안 들어 있다. `build_model.narc`에 590개가 따로
// 있고, 청크의 48바이트 배치 기록이 그 번호와 자리·회전·크기를 준다.
//
// 청크 모델과 달리 **자기 텍스처를 들고 있다** — 590개 중 568개가 TEX0를
// 같이 갖는다. 나머지 22개는 영역의 건물 텍스처 묶음(`areabm_texset`)을 쓴다.
//
// 파일 형식은 청크와 같다(`PT3C`). 읽는 쪽이 하나면 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { readDict, parseModel, parsePolygons, parseNodes } = require('../spike/nsbmd')
const { parseTex0, decode } = require('../spike/nitrotex')
const {
  readSbc, parseMaterials, buildMesh, placeByNode, materialSpec, VERTEX_BYTES, POS_SCALE,
} = require('./chunks')
const { encodePng } = require('./png')

const SHEET_WIDTH = 256

function pack(items) {
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width)
  let x = 0, y = 0, rowHeight = 0
  for (const item of sorted) {
    if (x + item.width > SHEET_WIDTH) { x = 0; y += rowHeight; rowHeight = 0 }
    item.x = x; item.y = y
    x += item.width
    rowHeight = Math.max(rowHeight, item.height)
  }
  return { width: SHEET_WIDTH, height: Math.max(1, y + rowHeight) }
}

/** BMD0 안에서 이름으로 블록을 찾는다. 소품은 MDL0 + TEX0 둘이다 */
function blocks(buf) {
  const out = {}
  const count = buf.readUInt16LE(14)
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32LE(16 + i * 4)
    out[buf.subarray(off, off + 4).toString('ascii')] = off
  }
  return out
}

/**
 * BTP0(그림 갈아 끼우기)가 부르는 (그림, 팔레트) 짝 전부.
 *
 * ⚠️ **`src/import/platinum/nsbtp.ts`의 `readNsbtp`+`patTextures`와 같아야
 * 한다** — 여기서 빠뜨리면 시트가 브라우저 것과 픽셀로 갈린다
 * (`chunks.test.ts`가 그걸 잡는다). 자리는 공개 문서의 `Pattern Animations`다
 */
function patPairs(anime) {
  const name16 = (buf, at) => {
    let s = ''
    for (let i = 0; i < 16; i++) { const c = buf[at + i]; if (!c) break; s += String.fromCharCode(c) }
    return s
  }
  const out = []
  for (const member of anime) {
    if (member.subarray(0, 4).toString('ascii') !== 'BTP0') continue
    const count = member.readUInt16LE(14)
    for (let i = 0; i < count; i++) {
      const pat = member.readUInt32LE(16 + i * 4)
      if (member.subarray(pat, pat + 4).toString('ascii') !== 'PAT0') continue
      for (const e of readDict(member, pat + 8)) {
        const at = pat + member.readUInt32LE(e.at)
        const texAt = at + member.readUInt16LE(at + 8)
        const palAt = at + member.readUInt16LE(at + 10)
        const textures = []
        for (let k = 0; k < member[at + 6]; k++) textures.push(name16(member, texAt + k * 16))
        const palettes = []
        for (let k = 0; k < member[at + 7]; k++) palettes.push(name16(member, palAt + k * 16))
        for (const t of readDict(member, at + 12)) {
          const keyAt = at + member.readUInt16LE(t.at + 6)
          for (let k = 0; k < member.readUInt32LE(t.at); k++) {
            const p = keyAt + k * 4
            out.push([textures[member[p + 2]] ?? '', palettes[member[p + 3]] ?? ''])
          }
        }
      }
    }
  }
  return out
}

function main() {
  const rom = openRom()
  const models = rom.narc('/fielddata/build_model/build_model.narc')
  // BTP0가 부르는 그림은 **어느 재질도 안 가리킨다** — 안 구우면 에스컬레이터가
  // 첫 칸에 멈춘다 (`wantedItems`의 `extra`)
  const extraPairs = patPairs(rom.narc('/arc/bm_anime.narc'))
  const outDir = path.join(ROOT, 'public/data/props')
  fs.mkdirSync(outDir, { recursive: true })

  const index = []
  /**
   * 모델마다 XZ 상자 (`POS_SCALE` 단위 정수 넷).
   *
   * ⚠️ **`src/import/platinum/chunks.ts`의 `coverBox`와 같아야 한다.**
   * 소품이 방 바닥을 대신 까는 자리가 있어서(챔피언 방은 청크 메시가 정점
   * 넷뿐이고 바닥이 소품 110이다) `engine/map/floorSeal`이 이걸 봐야 그 방을
   * 안 막는다
   */
  const boxes = []
  let bytes = 0, sheets = 0, noTex = 0, totalTris = 0, mismatched = 0

  for (let i = 0; i < models.length; i++) {
    const file = models[i]
    const found = blocks(file)
    const mdlAt = found.MDL0
    const list = readDict(file, mdlAt + 8)
    const modelAt = mdlAt + file.readUInt32LE(list[0].at)
    const header = parseModel(file, modelAt)
    const materials = parseMaterials(file, modelAt, header)
    const polygons = parsePolygons(file, modelAt, header)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    // 소품도 조각을 노드 행렬로 놓는다 — 590개에 노드 650개, 그중 이동 84 ·
    // 회전 10 · 크기 12이고 노드가 여럿인 소품이 25개다 (`nsbmd.parseNodes`)
    const nodes = parseNodes(file, modelAt)

    const verts = []
    const indices = []
    const submeshes = []
    for (const pair of pairs) {
      const mesh = buildMesh(polygons[pair.polygon].dl, header.upScale, materials[pair.material])
      placeByNode(mesh.verts, nodes[pair.node])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    if (verts.length !== header.verts) mismatched++

    // 자기 텍스처를 갖고 있으면 시트로 굽는다
    let items = []
    if (found.TEX0 !== undefined) {
      const tex0 = parseTex0(file, found.TEX0)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      const byName = new Map(tex0.textures.map((t) => [t.name, t]))
      const wanted = new Map()
      for (const m of materials) {
        if (!m.texture) continue
        const key = `${m.texture} ${m.palette ?? ''}`
        const tex = byName.get(m.texture)
        if (tex && !wanted.has(key)) {
          wanted.set(key, { tex: m.texture, pal: m.palette ?? '', width: tex.width, height: tex.height, src: tex })
        }
      }
      for (const [texture, palette] of extraPairs) {
        const key = `${texture} ${palette}`
        const tex = byName.get(texture)
        if (tex && !wanted.has(key)) {
          wanted.set(key, { tex: texture, pal: palette, width: tex.width, height: tex.height, src: tex })
        }
      }
      items = [...wanted.values()]
      if (items.length > 0) {
        const sheet = pack(items)
        const rgba = new Uint8Array(sheet.width * sheet.height * 4)
        for (const item of items) {
          const pixels = decode(tex0, item.src, palAt.get(item.pal) ?? 0)
          for (let y = 0; y < item.height; y++) {
            const from = y * item.width * 4
            rgba.set(pixels.subarray(from, from + item.width * 4), ((item.y + y) * sheet.width + item.x) * 4)
          }
        }
        fs.writeFileSync(path.join(outDir, `${i}.png`), encodePng(rgba, sheet.width, sheet.height))
        sheets++
        index.push({
          w: sheet.width, h: sheet.height,
          items: items.map((t) => [t.tex, t.pal, t.x, t.y, t.width, t.height]),
        })
      } else { noTex++; index.push(null) }
    } else { noTex++; index.push(null) }

    const meta = {
      verts: verts.length,
      indices: indices.length,
      materials: materials.map(materialSpec),
      submeshes,
    }
    const json = Buffer.from(JSON.stringify(meta), 'utf8')
    const pad = (4 - (json.length % 4)) % 4
    const head = 8 + json.length + pad
    const buf = Buffer.alloc(head + verts.length * VERTEX_BYTES + indices.length * 2)
    buf.write('PT3C', 0, 'ascii')
    buf.writeUInt32LE(json.length, 4)
    json.copy(buf, 8)
    verts.forEach((v, k) => {
      const o = head + k * VERTEX_BYTES
      for (let a = 0; a < 3; a++) buf.writeInt16LE(Math.round(v.pos[a] * POS_SCALE), o + a * 2)
      for (let a = 0; a < 2; a++) buf.writeFloatLE(v.uv[a], o + 8 + a * 4)
      for (let a = 0; a < 3; a++) buf.writeInt8(v.normal[a], o + 16 + a)
      for (let a = 0; a < 3; a++) buf.writeUInt8(v.color[a], o + 20 + a)
    })
    const idxAt = head + verts.length * VERTEX_BYTES
    indices.forEach((v, k) => { buf.writeUInt16LE(v, idxAt + k * 2) })
    fs.writeFileSync(path.join(outDir, `${i}.bin`), buf)
    bytes += buf.length
    totalTris += indices.length / 3
    if (verts.length === 0) boxes.push(null)
    else {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
      for (const v of verts) {
        const x = Math.round(v.pos[0] * POS_SCALE), z = Math.round(v.pos[2] * POS_SCALE)
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (z < z0) z0 = z
        if (z > z1) z1 = z
      }
      boxes.push([x0, z0, x1, z1])
    }
  }

  const out = writeJson('props/index.json', { count: models.length, sheets: index, boxes })
  console.log(
    `소품 ${models.length}개 → 삼각형 ${totalTris} · ${(bytes / 1024 / 1024).toFixed(1)}MB · ` +
    `텍스처 시트 ${sheets}장 (자기 텍스처가 없는 것 ${noTex}개)`,
  )
  console.log(`  헤더 정점 수와 어긋난 모델 ${mismatched}개 · 색인 ${out.rel} (${out.kb}KB)`)
}

main()
