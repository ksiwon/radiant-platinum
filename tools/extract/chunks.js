// 청크 지오메트리 (DATA.md §2.2) — 블록아웃을 원작 모델로 바꾼다.
//
// land_data 청크마다 `BMD0` 모델이 들어 있고, 그게 신오의 진짜 땅이다 — 길·계단·
// 물가·나무·건물 윤곽까지. 지금까지 화면에 있던 것은 타일 거동값으로 쌓은 상자였다.
//
// 두 가지를 풀어야 한다:
//   ① 디스플레이 리스트 — NDS GPU 명령 흐름이라 해석해야 삼각형이 나온다
//   ② SBC — 어느 재질로 어느 폴리곤을 그리는지 짝지어 주는 짧은 명령 목록
//
// 검증은 헤더가 해 준다. MDL0가 정점·삼각형·사각형 수를 적어 두므로 우리가 센
// 것과 한 개도 안 틀려야 한다 (666/666).
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const {
  readDict, runDisplayList, vertexFrom, parseModel, parsePolygons, fx32,
} = require('../spike/nsbmd')

/**
 * 좌표 양자화 — 1/256 타일.
 *
 * 모델 좌표의 단위는 **타일이 아니라 유닛**이고 16유닛이 한 타일이다(청크 하나가
 * −256~+256 유닛 = 32타일로 딱 떨어진다). 이동 동작 표에서 나온 "거리 × 프레임 =
 * 16"과 같은 눈금이다. 여기서 타일로 옮겨 두면 나머지 코드가 전부 타일로 산다
 */
const POS_SCALE = 256
/** 한 타일이 몇 유닛인가 */
const UNITS_PER_TILE = 16
/** 원본 UV는 1/16 텍셀 고정소수점이다. 재질의 크기로 나눠 0~1로 옮긴다 */
const UV_SCALE = 16

/**
 * 정점 24바이트: pos i16×3 · pad · uv f32×2 · normal i8×3 · pad · color u8×3 · pad.
 *
 * UV를 int16으로 못 담는다 — 반복 텍스처가 65536텍셀을 넘어간다(실측).
 * 정규화한 뒤 float32로 담으면 반복 횟수가 커도 정확도가 안 무너진다
 */
const VERTEX_BYTES = 24

/** SBC 명령별 피연산자 수. `flags`는 상위 3비트다 */
function sbcOperands(op, flags) {
  switch (op) {
    case 0x00: return 0 // NOP
    case 0x01: return 0 // RET
    case 0x02: return 2 // NODE
    case 0x03: return 1 // MTX
    case 0x04: return 1 // MAT
    case 0x05: return 1 // SHP
    case 0x06: return flags === 0 ? 2 : 4 // NODEDESC — 깃발이 서면 행렬 자리 둘이 더 붙는다
    case 0x07: return 3 // BB
    case 0x08: return 3 // BBY
    case 0x09: return 3 // NODEMIX (맵에는 안 나온다)
    case 0x0a: return 5 // CALLDL
    case 0x0b: return 0 // POSSCALE
    case 0x0c: return 2 // ENVMAP
    case 0x0d: return 2 // PRJMAP
    default: throw new Error(`모르는 SBC 명령 0x${op.toString(16)}`)
  }
}

/**
 * SBC에서 (재질, 폴리곤) 짝을 뽑는다.
 *
 * ⚠️ **순서대로 1:1이 아니다.** 청크 0을 보면 재질 4가 폴리곤 13을, 재질 0이
 * 폴리곤 9를 그린다. 번호 순서로 짝지으면 땅에 아스팔트가, 길에 잔디가 깔린다
 */
function readSbc(buf, at, end) {
  const pairs = []
  let material = 0
  let p = at
  while (p < end) {
    const raw = buf[p++]
    const op = raw & 0x1f
    const flags = raw >> 5
    const n = sbcOperands(op, flags)
    const args = []
    for (let i = 0; i < n; i++) args.push(buf[p++])
    if (op === 0x04) material = args[0]
    else if (op === 0x05) pairs.push({ material, polygon: args[0] })
    else if (op === 0x01) break
  }
  return pairs
}

/**
 * 재질 목록. 텍스처·팔레트 이름은 **역방향 사전**에 있다.
 *
 * 재질이 자기 텍스처 이름을 들고 있는 게 아니라, 텍스처마다 "나를 쓰는 재질들"
 * 목록이 붙어 있다. 그래서 뒤집어서 읽어야 한다
 */
/** RGB5 → 8비트. 위 3비트를 되붙인다 (정점색을 늘릴 때와 같은 식이다) */
const rgb5 = (v) => [v & 31, (v >> 5) & 31, (v >> 10) & 31].map((x) => (x << 3) | (x >> 2))

function parseMaterials(buf, modelAt, header) {
  const setAt = modelAt + header.materialsOffset
  const texDictOff = buf.readUInt16LE(setAt)
  const palDictOff = buf.readUInt16LE(setAt + 2)
  const entries = readDict(buf, setAt + 4)

  // 재질 44바이트: u16 태그·크기, u32 diffAmb·specEmi·polyAttr(+마스크)·
  // texImageParam(+마스크), u16 pltBase·flag·origW·origH, fx32 magW·magH.
  // ⚠️ 머리 둘이 **u16**이다. u32로 읽으면 크기가 21억이 나오고 그 뒤가 다 밀린다
  const materials = entries.map((e) => {
    const at = setAt + buf.readUInt32LE(e.at)
    const texImageParam = buf.readUInt32LE(at + 20)
    const polyAttr = buf.readUInt32LE(at + 12)
    const diffAmb = buf.readUInt32LE(at + 4)
    return {
      name: e.name,
      // 형식·크기는 TEX0 쪽이 정본이고, 재질은 UV를 나눌 원본 크기를 갖는다
      origWidth: buf.readUInt16LE(at + 32),
      origHeight: buf.readUInt16LE(at + 34),
      magW: fx32(buf.readInt32LE(at + 36)),
      magH: fx32(buf.readInt32LE(at + 40)),
      repeatS: (texImageParam & 0x10000) !== 0,
      repeatT: (texImageParam & 0x20000) !== 0,
      flipS: (texImageParam & 0x40000) !== 0,
      flipT: (texImageParam & 0x80000) !== 0,
      /** 0 투명 · 31 불투명. 반투명 판(물·그림자)이 여기서 갈린다 */
      alpha: (polyAttr >> 16) & 0x1f,
      /**
       * 확산색 (`diffAmb`의 아래 15비트, RGB5).
       *
       * 텍스처가 있는 재질에서는 텍스처가 색을 주므로 굽는 쪽이 안 쓴다.
       * **텍스처가 없는 재질에서는 이것이 유일한 색이다** (`materialSpec`)
       */
      diffuse: rgb5(diffAmb & 0x7fff),
      /** 6~7비트가 어느 면을 그리는가다: 1 뒷면 · 2 앞면 · 3 양면 */
      faces: (polyAttr >> 6) & 3,
      texture: null,
      palette: null,
    }
  })

  // 텍스처 → 나를 쓰는 재질들
  const bind = (dictOff, key) => {
    for (const e of readDict(buf, setAt + dictOff)) {
      const listAt = setAt + buf.readUInt16LE(e.at)
      const count = buf[e.at + 2]
      for (let i = 0; i < count; i++) {
        const mat = materials[buf[listAt + i]]
        if (mat) mat[key] = e.name
      }
    }
  }
  bind(texDictOff, 'texture')
  bind(palDictOff, 'palette')
  return materials
}

/** 디스플레이 리스트 → 정점 배열 + 삼각형 색인 */
function buildMesh(dl, scale, material) {
  // UV를 재질의 원본 크기로 나눠 둔다. 크기가 0이면 텍스처가 없는 재질이다
  const uScale = material.origWidth > 0 ? material.magW / (UV_SCALE * material.origWidth) : 0
  const vScale = material.origHeight > 0 ? material.magH / (UV_SCALE * material.origHeight) : 0
  const verts = []
  const indices = []
  let prim = null
  let strip = []
  let pos = [0, 0, 0]
  let uv = [0, 0]
  let normal = [0, 0, 127]
  let color = [255, 255, 255]

  const emit = () => {
    verts.push({ pos: pos.map((v) => v * scale / UNITS_PER_TILE), uv: [uv[0] * uScale, uv[1] * vScale], normal, color })
    return verts.length - 1
  }
  const tri = (a, b, c) => { indices.push(a, b, c) }

  runDisplayList(dl, (op, params) => {
    switch (op) {
      case 0x40: prim = params[0] & 3; strip = []; return
      case 0x41: prim = null; return
      case 0x20: {
        const v = params[0]
        // 정점 색은 5비트씩이다. 8비트로 늘릴 때 위 3비트를 되붙인다
        const c = (x) => (x << 3) | (x >> 2)
        color = [c(v & 0x1f), c((v >> 5) & 0x1f), c((v >> 10) & 0x1f)]
        return
      }
      case 0x21: {
        const v = params[0]
        const s = (x) => { const n = x & 0x3ff; return n & 0x200 ? n - 0x400 : n }
        // 1.0이 512다. int8로 담으므로 127로 맞춘다
        normal = [s(v), s(v >> 10), s(v >> 20)].map((n) => Math.max(-127, Math.min(127, Math.round(n / 512 * 127))))
        return
      }
      case 0x22: {
        const v = params[0]
        const s = (x) => (x & 0x8000 ? x - 0x10000 : x)
        uv = [s(v & 0xffff), s((v >>> 16) & 0xffff)]
        return
      }
      default: break
    }
    if (op < 0x23 || op > 0x28) return
    // ⚠️ `pos`는 **원시 좌표**로 들고 간다. VTX_DIFF가 직전 정점에서의 차이를
    // 주므로 여기서 단위를 바꾸면 그 뒤 정점이 전부 어긋난다 — 화면에서는
    // 삼각형이 길게 찢어진 가시로 보인다
    pos = vertexFrom(op, params, pos)
    const i = emit()
    strip.push(i)
    if (prim === 0 && strip.length === 3) { tri(strip[0], strip[1], strip[2]); strip = [] }
    else if (prim === 1 && strip.length === 4) { tri(strip[0], strip[1], strip[2]); tri(strip[0], strip[2], strip[3]); strip = [] }
    else if (prim === 2 && strip.length >= 3) {
      const n = strip.length
      // 삼각형 띠는 한 칸 걸러 감는 방향이 뒤집힌다
      if (n % 2 === 1) tri(strip[n - 3], strip[n - 2], strip[n - 1])
      else tri(strip[n - 2], strip[n - 3], strip[n - 1])
    } else if (prim === 3 && strip.length >= 4 && strip.length % 2 === 0) {
      const n = strip.length
      tri(strip[n - 4], strip[n - 3], strip[n - 1])
      tri(strip[n - 4], strip[n - 1], strip[n - 2])
    }
  })
  return { verts, indices }
}

function chunkModel(buf) {
  const sizes = [0, 4, 8, 12].map((o) => buf.readUInt32LE(o))
  const at = 16 + sizes[0] + sizes[1]
  const model = buf.subarray(at, at + sizes[2])
  const mdlAt = model.readUInt32LE(16)
  const models = readDict(model, mdlAt + 8)
  const modelAt = mdlAt + model.readUInt32LE(models[0].at)
  return { model, modelAt, header: parseModel(model, modelAt) }
}

/**
 * 구운 파일에 담을 재질 한 줄.
 *
 * ⚠️ **텍스처가 없으면 확산색이 유일한 색이다.** 안 실으면 정점색 흰색만
 * 남아 화면에 **하얗게** 뜬다 — 그림자 재질(`kage`·`shade`·`lm*`, 확산
 * (0,0,0)~(66,82,107))이 전부 흰 안개로 깔렸던 자리다. 실측으로 맵 청크
 * 재질 7346개 중 170개, 건물 소품 1333개 중 117개, 깨어진 세계 소품 118개
 * 중 4개가 여기 해당한다 (`.audit/whiteMaterials.mjs`).
 *
 * ⚠️ **텍스처가 있는 재질에는 안 붙인다.** 붙이면 확산색이 텍스처를 한 번 더
 * 곱해 온 신오가 어두워지고, 바이트가 달라지는 파일이 전부로 늘어난다
 */
function materialSpec(m) {
  return {
    tex: m.texture, pal: m.palette,
    // 반복·뒤집기는 텍스처를 만들 때 필요하고, 알파·면은 재질을 만들 때 쓴다
    rep: (m.repeatS ? 1 : 0) | (m.repeatT ? 2 : 0) | (m.flipS ? 4 : 0) | (m.flipT ? 8 : 0),
    a: m.alpha, f: m.faces,
    ...(m.texture === null ? { d: m.diffuse } : {}),
  }
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/fielddata/land_data/land_data.narc')
  const outDir = path.join(ROOT, 'public/data/chunks')
  fs.mkdirSync(outDir, { recursive: true })

  const index = []
  let totalVerts = 0, totalTris = 0, totalBytes = 0
  let mismatched = 0

  for (let i = 0; i < narc.length; i++) {
    const { model, modelAt, header } = chunkModel(narc[i])
    const pairs = readSbc(model, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    if (pairs.length !== header.polygons) {
      throw new Error(`청크 ${i}: SBC가 짝 ${pairs.length}개인데 폴리곤은 ${header.polygons}개다`)
    }
    const materials = parseMaterials(model, modelAt, header)
    const polygons = parsePolygons(model, modelAt, header)

    const verts = []
    const indices = []
    const submeshes = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mesh = buildMesh(poly.dl, header.upScale, materials[pair.material])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push({ material: pair.material, start: indices.length, count: mesh.indices.length })
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    if (verts.length !== header.verts) mismatched++

    // 쓰는 재질만 남긴다. 청크가 안 그리는 재질도 목록에는 들어 있다
    const meta = {
      verts: verts.length,
      indices: indices.length,
      materials: materials.map(materialSpec),
      submeshes: submeshes.map((s) => [s.material, s.start, s.count]),
    }

    // 파일 하나에 자기 설명까지 담는다. 666개 몫을 색인 하나로 모으면 1.4MB짜리
    // 파일을 첫 프레임에 받아야 하는데, 정작 한 화면에 쓰는 것은 스물몇 개다
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
    // 색인은 u16이다. 청크 하나가 65536정점을 넘는 일은 없다 (최대 실측 아래 참고)
    const idxAt = head + verts.length * VERTEX_BYTES
    indices.forEach((v, k) => { buf.writeUInt16LE(v, idxAt + k * 2) })
    fs.writeFileSync(path.join(outDir, `${i}.bin`), buf)

    index.push(verts.length)
    totalVerts += verts.length
    totalTris += indices.length / 3
    totalBytes += buf.length
  }

  const out = writeJson('chunks/index.json', {
    posScale: POS_SCALE, uvScale: UV_SCALE, vertexBytes: VERTEX_BYTES,
    unitsPerTile: UNITS_PER_TILE, count: narc.length,
  })
  console.log(
    `청크 ${narc.length}개 → 정점 ${totalVerts} · 삼각형 ${totalTris} · ` +
    `${(totalBytes / 1024 / 1024).toFixed(1)}MB (평균 ${(totalBytes / narc.length / 1024).toFixed(0)}KB)`,
  )
  console.log(
    `  헤더 정점 수와 어긋난 청크 ${mismatched}개 · 한 청크 최대 정점 ${Math.max(...index)}개` +
    ` · 색인 ${out.rel} (${out.kb}KB)`,
  )
}

module.exports = {
  readSbc, parseMaterials, buildMesh, chunkModel, materialSpec,
  VERTEX_BYTES, POS_SCALE, UV_SCALE, UNITS_PER_TILE,
}

if (require.main === module) main()
