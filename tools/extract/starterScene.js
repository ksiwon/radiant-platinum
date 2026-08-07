// 파트너 고르는 장면의 3D 모델 (DATA.md §2.14)
//
// `graphic/ev_pokeselect.narc` 열여덟 칸 중 여섯 칸이 NSBMD다. 어느 칸이
// 무엇인지는 짐작하지 않는다 — `choose_starter/choose_starter_app.c`의
// `Make3DGraphics`가 번호를 그대로 적어 준다:
//
//   Load3DGraphics(&[0], 1, 0, …)              모델 1 · 애니 0   덮인 서류가방
//   Load3DGraphicsWithoutAnimation(&[1], 8, …) 모델 8            열린 서류가방
//   for i in 2..4: Load3DGraphics(&[i], 3+(i−2)*2, 2+(i−2)*2, …) 모델 3·5·7 몬스터볼
//   Load3DGraphicsWithoutAnimation(&[5], 9, …) 모델 9            바닥(그림자)
//
// 파일 형식은 소품과 같다(`PT3C`) — 읽는 쪽이 하나면 된다.
//
// ⚠️ **애니메이션 곡선(JNT0)은 아직 안 굽는다.** 0·2·4·6번이 그것이고, 가방이
// 열리는 동작과 고른 볼이 흔들리는 동작이 거기 있다. 지금은 덮인 모델과 열린
// 모델을 갈아 끼워서 순서만 원작대로 간다.
//
// 대신 **길이는 읽는다.** 헤더가 `"J\0AC"` · `u16 프레임 수` · `u16 노드 수`라
// 거기까지만 봐도 몇 프레임짜리인지 나온다. 그래야 가방이 열리는 자리에서
// 기다리는 시간이 원작과 같다 — 이름도 `psel_all`·`psel_mb_a/b/c`로 붙어 있다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { readDict, parseModel, parsePolygons } = require('../spike/nsbmd')
const { parseTex0, decode } = require('../spike/nitrotex')
const { readSbc, parseMaterials, buildMesh, VERTEX_BYTES, POS_SCALE } = require('./chunks')
const { encodePng } = require('./png')

/** 구울 칸. `Make3DGraphics`가 부르는 모델 번호 그대로다 */
const MODELS = [1, 8, 3, 5, 7, 9]

/** 길이만 읽을 칸. 모델 1의 짝이 0, 볼 3·5·7의 짝이 2·4·6이다 */
const CLIPS = { 1: 0, 3: 2, 5: 4, 7: 6 }

/** JNT0 애니 하나의 `[이름, 프레임 수, 노드 수]` */
function clipInfo(file) {
  const at = file.readUInt32LE(16)
  const tag = file.subarray(at, at + 4).toString('ascii')
  if (tag !== 'JNT0') throw new Error(`JNT0가 아니다: ${tag}`)
  const list = readDict(file, at + 8)
  const head = at + file.readUInt32LE(list[0].at)
  const magic = file.subarray(head, head + 4).toString('latin1')
  if (magic !== 'J\0AC') throw new Error(`관절 애니 머리가 아니다: ${JSON.stringify(magic)}`)
  return { name: list[0].name, frames: file.readUInt16LE(head + 4), nodes: file.readUInt16LE(head + 6) }
}

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

/** BMD0 안의 블록 자리. 여기 것은 전부 MDL0 + TEX0 둘이다 */
function blocks(buf) {
  const out = {}
  const count = buf.readUInt16LE(14)
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32LE(16 + i * 4)
    out[buf.subarray(off, off + 4).toString('ascii')] = off
  }
  return out
}

function bake(file, outDir, id) {
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

  let sheet = null
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
          tex: m.texture, pal: m.palette ?? '', width: tex.width, height: tex.height, src: tex,
        })
      }
    }
    const items = [...wanted.values()]
    if (items.length > 0) {
      const box = pack(items)
      const rgba = new Uint8Array(box.width * box.height * 4)
      for (const item of items) {
        const pixels = decode(tex0, item.src, palAt.get(item.pal) ?? 0)
        for (let y = 0; y < item.height; y++) {
          const from = y * item.width * 4
          rgba.set(
            pixels.subarray(from, from + item.width * 4),
            ((item.y + y) * box.width + item.x) * 4,
          )
        }
      }
      fs.writeFileSync(path.join(outDir, `${id}.png`), encodePng(rgba, box.width, box.height))
      sheet = {
        w: box.width, h: box.height,
        items: items.map((t) => [t.tex, t.pal, t.x, t.y, t.width, t.height]),
      }
    }
  }

  const meta = {
    verts: verts.length,
    indices: indices.length,
    materials: materials.map((m) => ({
      tex: m.texture, pal: m.palette,
      rep: (m.repeatS ? 1 : 0) | (m.repeatT ? 2 : 0) | (m.flipS ? 4 : 0) | (m.flipT ? 8 : 0),
      a: m.alpha, f: m.faces,
    })),
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
  fs.writeFileSync(path.join(outDir, `${id}.bin`), buf)

  return { sheet, tris: indices.length / 3, verts: verts.length, bytes: buf.length, header }
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/graphic/ev_pokeselect.narc')
  const outDir = path.join(ROOT, 'public/data/starter')
  fs.mkdirSync(outDir, { recursive: true })

  const sheets = {}
  const clips = {}
  let bytes = 0, tris = 0
  const rows = []
  for (const id of MODELS) {
    const got = bake(narc[id], outDir, id)
    sheets[id] = got.sheet
    bytes += got.bytes
    tris += got.tris
    let tail = ''
    if (CLIPS[id] !== undefined) {
      const clip = clipInfo(narc[CLIPS[id]])
      clips[id] = clip.frames
      tail = ` · 애니 ${clip.name} ${clip.frames}프레임 · 노드 ${clip.nodes}`
    }
    rows.push(`  ${String(id).padStart(2)}  정점 ${String(got.verts).padStart(5)} · 삼각형 ${String(got.tris).padStart(5)}`
      + ` · 헤더 정점 ${got.header.verts}${got.verts === got.header.verts ? '' : ' ⚠ 어긋남'}${tail}`)
  }
  const out = writeJson('starter/index.json', { models: MODELS, sheets, clips })
  console.log(`파트너 고르는 장면 — 모델 ${MODELS.length}개 · 삼각형 ${tris} · ${(bytes / 1024).toFixed(1)}KB`)
  console.log(rows.join('\n'))
  console.log(`  색인 ${out.rel} (${out.kb}KB)`)
}

main()
