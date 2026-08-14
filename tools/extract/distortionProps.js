// 깨어진 세계의 소품 모델 (PARITY §6.10) — `/data/mmodel/fldeff.narc`
//
// 이 세계의 「블록」은 지형이 아니라 **소품**이다. 판 위를 걷는 통행 자료는
// `tw_arc_attr`가 주지만, 눈에 보이는 발판·바위·덩굴은 필드 이펙트 아카이브의
// NSBMD 스물다섯 개다. 어느 종류가 몇 번인지는 오버레이의 표가 정한다
// (`sProp3DModelNARCIndexByKind`, `ov9_02249960.c`).
//
// ⚠️ **이게 없으면 판이 안 보인다.** 밟으면 나타나야 할 발판이 상태로만 켜지고
// 화면에는 아무 일도 안 일어나서, 허공을 걷다가 길을 잃는다. 실제로 그랬다.
//
// 굽는 형식은 건물 소품과 같은 `PT3C`다 (`props.js`) — 읽는 쪽이 하나면 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { readDict, parseModel, parsePolygons } = require('../spike/nsbmd')
const { parseTex0, decode } = require('../spike/nitrotex')
const { readSbc, parseMaterials, buildMesh, VERTEX_BYTES, POS_SCALE } = require('./chunks')
const { encodePng } = require('./png')

const SHEET_WIDTH = 256

/**
 * 소품 종류 → `fldeff.narc` 파일 번호.
 *
 * `sProp3DModelNARCIndexByKind`를 그대로 옮긴 것이다. 색인이 종류 번호고
 * (`tw_arc`의 소품 기록이 그 번호를 든다), 값이 아카이브 자리다
 */
const MODEL_INDEX = [
  0x7c, // 0  작은 발판
  0x7d, // 1  떠 있는 푸른 바위
  0x7e, // 2  중간 승강 발판 1
  0x7f, // 3  중간 승강 발판 2
  0x80, // 4  중간 승강 발판 (남서)
  0x81, // 5  중간 움직이는 발판 1
  0x82, // 6  중간 움직이는 발판 2
  0x83, // 7  중간 승강 발판 3
  0x84, // 8  큰 승강 발판 1
  0x85, // 9  중간 승강 발판 4
  0x86, // 10 가로 발판 1
  0x87, // 11 세로 발판 1
  0x88, // 12 세로 발판 2
  0x89, // 13 가로 발판 2
  0x8a, // 14 돌린 발판 (동)
  0x8b, // 15 돌린 발판 (서)
  0x8c, // 16 큰 승강 발판 2
  0x8d, // 17 큰 승강 발판 3
  0x8e, // 18 큰 승강 발판 4
  0x8f, // 19 중간 승강 발판 5
  0x90, // 20 기라티나 그림자
  0x91, // 21 폭포
  0x92, // 22 덩굴꽃
  0x93, // 23 바위
  0x94, // 24 문
  // ⚠️ **아래 셋은 깨어진 세계 것이 아니다.** 장막시티 체육관의 샌드백과
  // 타이어 더미인데(`sVeilstoneGymObjectModelIDs`) 같은 `fldeff.narc`에 있고
  // 굽는 길도 같아서 여기 이어 붙인다 — 그 방만을 위해 파이프라인을 하나 더
  // 만들 이유가 없다. `MODEL_IDX_*` 차례 그대로다
  112, // 25 무너진 타이어 더미
  114, // 26 서 있는 타이어 더미
  113, // 27 샌드백
  // ⚠️ **나무열매 밭의 흙**도 여기 붙인다 (PARITY §4.6). 밭 객체 118개의
  // 그림 번호는 100(`OBJ_EVENT_GFX_BERRY_SOIL`)인데 판때기가 아니라 3D 모델이라
  // `mmodel.narc`가 아니라 이 아카이브에 있다 — 원작도 필드 이펙트 17번을
  // 통째로 읽어 세운다 (`BerryPatchManager_Init3DRendering`)
  17, // 28 나무열매 밭의 흙
]

/**
 * 종류마다의 **자리 보정** (`sPropInitialPosOffsetByKind`), 타일 단위.
 *
 * 원작이 소품을 세울 때 좌표를 칸 한가운데(`MAP_OBJECT_COORD_CENTER_TO_FX32`,
 * 곧 `+0.5`)로 잡은 다음 이 값을 더한다. 원본은 고정소수점이고 한 타일이
 * `FX32_ONE * 16`이라 16으로 나눈 값을 적는다 — 예를 들어 `-FX32_ONE * 25`가
 * −25/16 = −1.5625다.
 *
 * ⚠️ **빼먹으면 소품이 한 칸 위에 뜬다.** 작은 발판(0)의 모델은 제 원점에서
 * 위로 1타일까지 올라가는데, y가 `+0.5 − 1.5625`라 윗면이 정확히 「선 높이 −
 * 1/16」에 온다. 보정을 안 하면 그 윗면이 발보다 한 칸 넘게 높아서, 걷는
 * 사람이 발판 **속**을 지나간다. 실제로 그랬다
 */
const POS_OFFSET = [
  [0, -25 / 16, -6 / 16], // 0  작은 발판
  [0, -25 / 16, -6 / 16], // 1  떠 있는 푸른 바위
  [0, -25 / 16, -6 / 16], // 2  중간 승강 발판 1
  [0, -25 / 16, -6 / 16], // 3  중간 승강 발판 2
  [0, -25 / 16, -6 / 16], // 4  중간 승강 발판 (남서)
  [0, -25 / 16, -6 / 16], // 5  중간 움직이는 발판 1
  [0, -25 / 16, -6 / 16], // 6  중간 움직이는 발판 2
  [0, -25 / 16, -6 / 16], // 7  중간 승강 발판 3
  [-8 / 16, -25 / 16, 2 / 16], // 8  큰 승강 발판 1
  [0, -25 / 16, -6 / 16], // 9  중간 승강 발판 4
  [0, -25 / 16, -6 / 16], // 10 가로 발판 1
  [0, -25 / 16, -6 / 16], // 11 세로 발판 1
  [0, -25 / 16, -6 / 16], // 12 세로 발판 2
  [0, -25 / 16, -6 / 16], // 13 가로 발판 2
  [0, -25 / 16, -6 / 16], // 14 돌린 발판 (동)
  [0, -25 / 16, -6 / 16], // 15 돌린 발판 (서)
  [-8 / 16, -25 / 16, 2 / 16], // 16 큰 승강 발판 2
  [0, -25 / 16, -6 / 16], // 17 큰 승강 발판 3
  [-8 / 16, -25 / 16, 10 / 16], // 18 큰 승강 발판 4
  [0, -25 / 16, -6 / 16], // 19 중간 승강 발판 5
  [0, -2, -6 / 16], // 20 기라티나 그림자
  [0, -2, -6 / 16], // 21 폭포
  [0, -2, -6 / 16], // 22 덩굴꽃
  [0, -2, -6 / 16], // 23 바위
  [0, -14 / 16, 8 / 16], // 24 문
  // 장막시티 체육관 셋은 원작이 소품이 아니라 **지도 객체**로 세워서
  // `sPropInitialPosOffsetByKind`에 자리가 없다. 칸 한가운데 그대로다
  [0, 0, 0], // 25 무너진 타이어 더미
  [0, 0, 0], // 26 서 있는 타이어 더미
  [0, 0, 0], // 27 샌드백
  // 흙도 지도 객체 자리에 그대로 선다 — 칸 한가운데다
  [0, 0, 0], // 28 나무열매 밭의 흙
]

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
