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
  readDict, runDisplayList, vertexFrom, parseModel, parsePolygons, parseNodes, applyNode, fx32,
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
  // ⚠️ **어느 노드에 매달렸는지도 같이 적는다.** `NODE(id, 보임)`이 그 뒤 조각의
  // 행렬을 갈아 끼운다 — 백화점 바닥이 노드 하나에 매달려 z로 12칸 옮겨져 있다.
  // 이것을 안 적으면 조각이 전부 원점에 겹쳐 쌓인다 (`nsbmd.parseNodes`)
  let node = 0
  let p = at
  while (p < end) {
    const raw = buf[p++]
    const op = raw & 0x1f
    const flags = raw >> 5
    const n = sbcOperands(op, flags)
    const args = []
    for (let i = 0; i < n; i++) args.push(buf[p++])
    if (op === 0x04) material = args[0]
    else if (op === 0x02) node = args[0]
    else if (op === 0x05) pairs.push({ material, polygon: args[0], node })
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
  // ⚠️ **원작이 안 보이는 면에 칠해 둔 검정을 그대로 쓰면 안 된다.**
  //
  // 그림 없는 재질은 확산색이 그 면의 유일한 색인데, 원작은 **고정 카메라가
  // 못 보는 면**의 정점색을 (0,0,0)으로 눕혀 둔다 — 그러면 확산색을 곱해도
  // 검정이다. 우리 실내 카메라는 벽 꼭대기보다 위에서 내려다보므로(50.09도)
  // 그 면이 화면에 든다: 연고 콘테스트회장(청크 241 재질 15)은 y 2.875에
  // x −15~−4로 뻗은 **벽 꼭대기 띠**고, 화면 왼쪽 29%를 검은 쐐기로 덮었다.
  // 구저택(510 재질 23)도 같다.
  //
  // 실측으로 청크 전체에 **그림 없고 정점색이 검은 서브메시 128개**가 있는데,
  // 그중 확산색까지 검은 것(59개·1,231삼각형)은 진짜 그림자라 그대로 두고,
  // **확산색이 있는 것(61개·714삼각형)만** 흰 정점색으로 되돌린다
  // (`node .audit/probe/blackWhat.mjs contest`)
  const lit = material.diffuse[0] + material.diffuse[1] + material.diffuse[2] > 0
  if (!material.texture && lit) {
    for (const v of verts) {
      if (v.color[0] === 0 && v.color[1] === 0 && v.color[2] === 0) v.color = [255, 255, 255]
    }
  }
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
 * 중 4개가 여기 해당한다 (`.audit/probe/whiteMaterials.mjs`).
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

/**
 * 조각을 **제 노드 자리로 옮긴다** (`nsbmd.parseNodes`).
 *
 * ⚠️ **이동은 유닛이고 정점은 이미 타일이다.** `buildMesh`가 `pos × upScale ÷ 16`
 * 으로 타일로 옮겨 놓았으므로 노드 이동도 16으로 나눠야 한다. 원작이 조각에
 * `upScale`을 먼저 먹이고(`POSSCALE`) 노드 행렬을 바깥에 두는 차례라 그렇다
 */
function placeByNode(verts, node) {
  if (!node) return
  const still = node.t[0] === 0 && node.t[1] === 0 && node.t[2] === 0
    && node.s.every((v) => v === 1)
    && node.m.every((v, i) => v === (i % 4 === 0 ? 1 : 0))
  if (still) return
  for (const v of verts) {
    const p = applyNode(
      { t: node.t.map((c) => c / UNITS_PER_TILE), m: node.m, s: node.s },
      v.pos[0], v.pos[1], v.pos[2])
    v.pos = p
    // 법선은 회전만 먹인다 — 이동은 방향을 안 바꾸고 크기는 되돌린다
    const m = node.m
    const n = [
      m[0] * v.normal[0] + m[1] * v.normal[1] + m[2] * v.normal[2],
      m[3] * v.normal[0] + m[4] * v.normal[1] + m[5] * v.normal[2],
      m[6] * v.normal[0] + m[7] * v.normal[1] + m[8] * v.normal[2],
    ]
    v.normal = n.map((c) => Math.max(-127, Math.min(127, Math.round(c))))
  }
}


/**
 * **원작이 위를 가리려고 깔아 둔 새까만 천장을 안 굽는다.**
 *
 * 굴에는 불투명·그림 없음·확산 (0,0,0)짜리 **납작한 검은 판**이 바닥 위에
 * 떠 있다. 원작 카메라는 그 위에서 내려다보지 않으므로 그것이 「위쪽을 가리는
 * 뚜껑」 노릇만 한다. 우리 3인칭은 주인공보다 네 칸 위에 서므로 **그 뚜껑을
 * 위에서 본다** — 강철섬(맵 293, 청크 504~507)에서 y 10에 깔린 판이 화면의
 * 92%를 검게 덮었다 (`node .audit/probe/blackWhat.mjs ironisle`).
 *
 * **아래에서 보면 없애도 똑같다** — 검은 판이든 아무것도 없는 허공이든 검정이다.
 *
 * 실측으로 이 잣대에 걸리는 것이 청크 51개에 서브메시 51개·삼각형 527개고,
 * **전부 바닥에서 2칸 넘게 떠 있으며 대개 그 청크의 제일 높은 자리**다.
 * 바닥에 깔린 검은 판(그림자)은 하나도 안 걸린다
 */

/** 칸 하나를 4×4로 찍어 본다. 반 칸짜리 바닥도 바닥이다 */
const COVER_SUB = 4
/** 그중 몇 개가 걸려야 바닥인가 — 반 칸 */
const COVER_MIN = 8

/**
 * **발밑에 그려진 것이 있는가** — 청크 32×32 칸마다 한 비트.
 *
 * ⚠️ **`src/import/platinum/chunks.ts`의 `coverBits`와 한 글자도 다르면 안 된다.**
 * 굽는 쪽이 둘이라(IMPORT.md) 여기와 저기가 갈리면 설치본과 개발 서버가 다른
 * 벽을 갖는다. e2e ⑨·⑮가 두 산출물을 바이트로 견주므로 갈리면 빨갛게 난다.
 *
 * 정수로만 잰다 — 파일에 실제로 들어가는 값(`Math.round(pos × POS_SCALE)`)을
 * 쓰고 안팎 판정도 정수 외적이라, 부동소수점 끝자리가 갈릴 자리가 없다.
 *
 * ⚠️ **한 표본만 걸려도 바닥으로 치면 안 된다.** 사천왕 방(land 260)에서 방
 * 동쪽 벽의 **꼭대기**(y=3, 방 바닥은 y=-0.13)가 x=17에 0.18칸만 걸치는데,
 * 그것 하나로 한 칸이 통째로 「바닥」이 되고 이어 붙이는 규칙이 거기까지 열 칸을
 * 뚫었다. 그래서 **열여섯 표본 중 여덟(반 칸)** 이상일 때만 바닥으로 친다 —
 * 배틀팩토리 아래 줄처럼 판이 반 칸인 자리는 딱 여덟이라 그대로 남는다.
 *
 * ⚠️ **벽을 바닥으로 세지 않는다.** XZ로 눌러 넓이가 0인 면(정확히 수직인 벽)은
 * 빠지지만, 조금이라도 기운 벽은 얇은 띠로 남아 4×4 표본에 걸린다. 실제로
 * 사천왕 방(land 260)에서 방 동쪽 벽의 바깥 면이 x=17에 **한 칸짜리 바닥**으로
 * 찍혔고, 이어 붙이는 규칙이 거기까지 열 칸을 뚫었다. 그래서 면의 법선이
 * **수평에서 60° 안**일 때만 바닥으로 친다 (`3·ny² ≥ nx² + nz²`).
 */
function coverBits(verts, indices) {
  const bits = Buffer.alloc(32 * 32 / 8)
  const n = verts.length
  const px = new Int32Array(n)
  const py = new Int32Array(n)
  const pz = new Int32Array(n)
  const mid = 16 * POS_SCALE
  for (let i = 0; i < n; i++) {
    px[i] = Math.round(verts[i].pos[0] * POS_SCALE) + mid
    py[i] = Math.round(verts[i].pos[1] * POS_SCALE)
    pz[i] = Math.round(verts[i].pos[2] * POS_SCALE) + mid
  }
  const step = POS_SCALE / (COVER_SUB * 2)
  // 칸마다 표본을 **몇 개** 덮었는지 센다. 삼각형이 여럿이면 합쳐서 센다
  const hits = Buffer.alloc(32 * 32 * COVER_SUB * COVER_SUB / 8)
  const mark = (tile, s) => {
    const at = tile * COVER_SUB * COVER_SUB + s
    hits[at >> 3] |= 1 << (at & 7)
  }
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2]
    const ax = px[a], az = pz[a], bx = px[b], bz = pz[b], cx = px[c], cz = pz[c]
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
    if (area === 0) continue
    if (!flatEnough(px, py, pz, a, b, c)) continue
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / POS_SCALE))
    const x1 = Math.min(31, Math.floor(Math.max(ax, bx, cx) / POS_SCALE))
    const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz) / POS_SCALE))
    const z1 = Math.min(31, Math.floor(Math.max(az, bz, cz) / POS_SCALE))
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const at = tz * 32 + tx
        for (let sz = 0; sz < COVER_SUB; sz++) {
          for (let sx = 0; sx < COVER_SUB; sx++) {
            const qx = tx * POS_SCALE + step + sx * 2 * step
            const qz = tz * POS_SCALE + step + sz * 2 * step
            const w0 = (bx - ax) * (qz - az) - (bz - az) * (qx - ax)
            const w1 = (cx - bx) * (qz - bz) - (cz - bz) * (qx - bx)
            const w2 = (ax - cx) * (qz - cz) - (az - cz) * (qx - cx)
            if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
              mark(at, sz * COVER_SUB + sx)
            }
          }
        }
      }
    }
  }
  for (let tile = 0; tile < 32 * 32; tile++) {
    let n = 0
    for (let s = 0; s < COVER_SUB * COVER_SUB; s++) {
      const at = tile * COVER_SUB * COVER_SUB + s
      if ((hits[at >> 3] & (1 << (at & 7))) !== 0) n++
    }
    if (n >= COVER_MIN) bits[tile >> 3] |= 1 << (tile & 7)
  }
  return bits
}

/** 딛을 만큼 누운 면인가 — 법선이 수평에서 60° 안인가 */
function flatEnough(px, py, pz, a, b, c) {
  const ux = (px[b] - px[a]) / POS_SCALE, uy = (py[b] - py[a]) / POS_SCALE
  const uz = (pz[b] - pz[a]) / POS_SCALE
  const vx = (px[c] - px[a]) / POS_SCALE, vy = (py[c] - py[a]) / POS_SCALE
  const vz = (pz[c] - pz[a]) / POS_SCALE
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  return 3 * ny * ny >= nx * nx + nz * nz
}

/** 소품 모델의 XZ 상자 — `POS_SCALE` 단위 정수 넷. 그린 것이 없으면 null */
function coverBox(verts) {
  if (verts.length === 0) return null
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const v of verts) {
    const x = Math.round(v.pos[0] * POS_SCALE), z = Math.round(v.pos[2] * POS_SCALE)
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  return [x0, z0, x1, z1]
}

const CEILING_LIFT = 1.5

function dropBlackCeilings(verts, indices, submeshes, materials) {
  let minY = Infinity
  for (const v of verts) if (v.pos[1] < minY) minY = v.pos[1]
  const keep = []
  let dropped = 0
  for (const s of submeshes) {
    const m = materials[s.material]
    const black = m.texture === null && m.alpha === 31
      && m.diffuse[0] + m.diffuse[1] + m.diffuse[2] === 0
    let lo = Infinity, hi = -Infinity
    if (black) {
      for (let t = 0; t < s.count; t++) {
        const y = verts[indices[s.start + t]].pos[1]
        if (y < lo) lo = y
        if (y > hi) hi = y
      }
    }
    if (black && hi - lo <= 0.05 && lo >= minY + CEILING_LIFT) { dropped += s.count / 3; continue }
    keep.push(s)
  }
  if (dropped === 0) return { indices, submeshes, dropped }
  const out = []
  const packed = []
  for (const s of keep) {
    packed.push({ material: s.material, start: out.length, count: s.count })
    for (let t = 0; t < s.count; t++) out.push(indices[s.start + t])
  }
  return { indices: out, submeshes: packed, dropped }
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/fielddata/land_data/land_data.narc')
  const outDir = path.join(ROOT, 'public/data/chunks')
  fs.mkdirSync(outDir, { recursive: true })

  const index = []
  /** 청크마다 32×32 비트 — 발밑에 그려진 것이 있는가 */
  const covers = []
  let totalVerts = 0, totalTris = 0, totalBytes = 0
  let mismatched = 0
  let ceilings = 0

  for (let i = 0; i < narc.length; i++) {
    const { model, modelAt, header } = chunkModel(narc[i])
    const pairs = readSbc(model, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    if (pairs.length !== header.polygons) {
      throw new Error(`청크 ${i}: SBC가 짝 ${pairs.length}개인데 폴리곤은 ${header.polygons}개다`)
    }
    const materials = parseMaterials(model, modelAt, header)
    const polygons = parsePolygons(model, modelAt, header)
    const nodes = parseNodes(model, modelAt)

    const verts = []
    let indices = []
    let submeshes = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mesh = buildMesh(poly.dl, header.upScale, materials[pair.material])
      placeByNode(mesh.verts, nodes[pair.node])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push({ material: pair.material, start: indices.length, count: mesh.indices.length })
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    if (verts.length !== header.verts) mismatched++
    const cut = dropBlackCeilings(verts, indices, submeshes, materials)
    indices = cut.indices
    submeshes = cut.submeshes
    ceilings += cut.dropped

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
    // 걷어낸 천장은 바닥이 아니다 — 남은 색인으로만 찍는다
    covers.push(coverBits(verts, indices))

    index.push(verts.length)
    totalVerts += verts.length
    totalTris += indices.length / 3
    totalBytes += buf.length
  }

  // 청크마다 128B. 충돌은 스트리밍을 기다리면 안 되므로 한 파일로 둔다
  fs.writeFileSync(path.join(outDir, 'cover.bin'), Buffer.concat(covers))
  const out = writeJson('chunks/index.json', {
    posScale: POS_SCALE, uvScale: UV_SCALE, vertexBytes: VERTEX_BYTES,
    unitsPerTile: UNITS_PER_TILE, count: narc.length,
  })
  console.log(
    `청크 ${narc.length}개 → 정점 ${totalVerts} · 삼각형 ${totalTris} · ` +
    `${(totalBytes / 1024 / 1024).toFixed(1)}MB (평균 ${(totalBytes / narc.length / 1024).toFixed(0)}KB)`,
  )
  console.log(
    `  헤더 정점 수와 어긋난 청크 ${mismatched}개 · 한 청크 최대 정점 ${Math.max(...index)}개`
    + ` · 안 구운 검은 천장 ${ceilings}삼각형` +
    ` · 색인 ${out.rel} (${out.kb}KB)`,
  )
}

module.exports = {
  readSbc, parseMaterials, buildMesh, placeByNode, chunkModel, materialSpec,
  VERTEX_BYTES, POS_SCALE, UV_SCALE, UNITS_PER_TILE,
}

if (require.main === module) main()
