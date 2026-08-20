// 필드 이펙트 소품 모델 — 노드 쪽 (PARITY §6.10 · §1.27 · §4.6)
//
//     node --experimental-strip-types tools/extract/distortionProps.mjs
//
// `/data/mmodel/fldeff.narc`의 NSBMD 서른아홉 칸을 굽는다. 어느 종류가 몇
// 번이고 어디에 서는지는 **여기서 다시 적지 않는다** — 브라우저 변환기
// (`src/import/platinum/distortionProps.ts`)와 같은 표를 봐야 개발 서버와
// 설치본이 안 갈린다. 그 표가 `import/platinum/fldeffProps.ts`고, 노드가
// 타입만 벗겨 준다.
//
// 굽는 형식은 건물 소품과 같은 `PT3C`다 (`props.js`) — 읽는 쪽이 하나면 된다.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { PROP_MODEL_INDEX, PROP_POS_OFFSET } from '../../src/import/platinum/fldeffProps.ts'

const require = createRequire(import.meta.url)
const { openRom, writeJson, ROOT } = require('./rom')
const { readDict, parseModel, parsePolygons } = require('../spike/nsbmd')
const { parseTex0, decode } = require('./../spike/nitrotex')
const { readSbc, parseMaterials, buildMesh, VERTEX_BYTES, POS_SCALE } = require('./chunks')
const { encodePng } = require('./png')

const SHEET_WIDTH = 256

/**
 * 텍스처가 없는 재질에만 **확산색**을 실어 준다 (`diffAmb`의 아래 15비트).
 *
 * ⚠️ **텍스처가 없으면 색을 줄 것이 그것뿐이다.** 기라티나 그림자(갈래 20)는
 * 텍스처가 없고 정점색이 흰색 하나뿐인데 확산색이 (0,0,0)이라, 이 값을 안
 * 실으면 **새까매야 할 그림자가 하얗게** 뜬다. 실측으로 깨어진 세계 소품
 * 재질 118개 중 텍스처가 없는 것은 넷뿐이다 — 갈래 20·27·38 (`.audit/propDiffuse.mjs`).
 *
 * ⚠️ **텍스처가 있는 재질에는 안 붙인다.** 붙이면 확산색 (200,200,200)이
 * 텍스처를 한 번 더 어둡게 곱해서 소품 서른여섯이 다 죽는다. 그리고 굽는 바이트가
 * 바뀌는 파일이 셋에서 서른아홉으로 늘어난다.
 *
 * 📌 같은 자리가 맵 청크(재질 7346개 중 170개)와 건물 소품(1333개 중 117개)에도
 * 있다 — 거기도 텍스처 없는 재질이 지금 전부 흰색으로 뜬다. 그쪽은 다시 구우면
 * 청크 140벌·소품 109벌이 바뀌어 설치본이 통째로 다시 받아야 해서 손대지 않았다
 */
function untexturedDiffuse(spec, material) {
  if (spec.tex !== null) return spec
  return { ...spec, d: material.diffuse }
}

/** 표 둘은 브라우저 변환기와 같은 자리에서 온다 */
const MODEL_INDEX = PROP_MODEL_INDEX
const POS_OFFSET = PROP_POS_OFFSET


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

/** BMD0 안에서 이름으로 블록을 찾는다 */
function blocks(buf) {
  const out = {}
  const count = buf.readUInt16LE(14)
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32LE(16 + i * 4)
    out[buf.subarray(off, off + 4).toString('ascii')] = off
  }
  return out
}

function main() {
  const rom = openRom()
  const fldeff = rom.narc('/data/mmodel/fldeff.narc')
  const outDir = path.join(ROOT, 'public/data/distortionProps')
  fs.mkdirSync(outDir, { recursive: true })

  const index = []
  let bytes = 0, sheets = 0, noTex = 0, totalTris = 0

  for (let kind = 0; kind < MODEL_INDEX.length; kind++) {
    const at = MODEL_INDEX[kind]
    const file = fldeff[at]
    if (file === undefined) throw new Error(`fldeff에 ${at}번 파일이 없다`)
    const magic = file.toString('ascii', 0, 4)
    if (magic !== 'BMD0') throw new Error(`소품 ${kind}(0x${at.toString(16)})가 BMD0가 아니라 ${magic}다`)

    const found = blocks(file)
    const mdlAt = found.MDL0
    const list = readDict(file, mdlAt + 8)
    const modelAt = mdlAt + file.readUInt32LE(list[0].at)
    const header = parseModel(file, modelAt)
    const materials = parseMaterials(file, modelAt, header)
    const polygons = parsePolygons(file, modelAt, header)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)

    const verts = []
    const indices = []
    const submeshes = []
    for (const pair of pairs) {
      const mesh = buildMesh(polygons[pair.polygon].dl, header.upScale, materials[pair.material])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }

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
          wanted.set(key, {
            tex: m.texture, pal: m.palette ?? '',
            width: tex.width, height: tex.height, src: tex,
          })
        }
      }
      items = [...wanted.values()]
    }

    if (items.length > 0) {
      const sheet = pack(items)
      const rgba = new Uint8Array(sheet.width * sheet.height * 4)
      const tex0 = parseTex0(file, found.TEX0)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      for (const item of items) {
        const pixels = decode(tex0, item.src, palAt.get(item.pal) ?? 0)
        for (let y = 0; y < item.height; y++) {
          const from = y * item.width * 4
          rgba.set(
            pixels.subarray(from, from + item.width * 4),
            ((item.y + y) * sheet.width + item.x) * 4,
          )
        }
      }
      fs.writeFileSync(path.join(outDir, `${kind}.png`), encodePng(rgba, sheet.width, sheet.height))
      sheets++
      index.push({
        w: sheet.width, h: sheet.height,
        items: items.map((t) => [t.tex, t.pal, t.x, t.y, t.width, t.height]),
      })
    } else {
      noTex++
      index.push(null)
    }

    const meta = {
      verts: verts.length,
      indices: indices.length,
      materials: materials.map((m) => untexturedDiffuse({
        tex: m.texture, pal: m.palette,
        rep: (m.repeatS ? 1 : 0) | (m.repeatT ? 2 : 0) | (m.flipS ? 4 : 0) | (m.flipT ? 8 : 0),
        a: m.alpha, f: m.faces,
      }, m)),
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
    fs.writeFileSync(path.join(outDir, `${kind}.bin`), buf)
    bytes += buf.length
    totalTris += indices.length / 3
  }

  const out = writeJson('distortionProps/index.json', {
    count: MODEL_INDEX.length, sheets: index, offsets: POS_OFFSET,
  })
  console.log(
    `깨어진 세계 소품 ${MODEL_INDEX.length}개 → 삼각형 ${totalTris} · ` +
    `${(bytes / 1024).toFixed(1)}KB · 텍스처 시트 ${sheets}장 (없는 것 ${noTex}개)`,
  )
  console.log(`  ${out.rel} ${out.kb}KB`)
}

main()
