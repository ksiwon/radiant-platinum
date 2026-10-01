// 파트너 고르는 장면의 3D 모델 — 브라우저에서 (DATA.md §2.14)
//
// `graphic/ev_pokeselect.narc` 열여덟 칸 중 여섯 칸이 NSBMD다. 어느 칸이 무엇인지는
// 짐작하지 않는다 — `choose_starter/choose_starter_app.c`의 `Make3DGraphics`가
// 번호를 그대로 적어 준다:
//
//   Load3DGraphics(&[0], 1, 0, …)              모델 1 · 애니 0   덮인 서류가방
//   Load3DGraphicsWithoutAnimation(&[1], 8, …) 모델 8            열린 서류가방
//   for i in 2..4: Load3DGraphics(&[i], 3+(i−2)*2, 2+(i−2)*2, …) 모델 3·5·7 몬스터볼
//   Load3DGraphicsWithoutAnimation(&[5], 9, …) 모델 9            바닥(그림자)
//
// 파일 형식은 소품과 같다(`PT3C`) — 읽는 쪽이 하나면 된다.
//
// **관절 애니(BCA0)는 맵 소품처럼 원작 바이트를 그대로 잇는다**(`anims.bin`) — 푸는 것은
// 화면 쪽(`scene/propAnim`)이다. 0·2·4·6번이 그것이다:
//
//   0 `psel_all`  41프레임  덮인 가방(모델 1) 안의 볼 셋과 그림자가 튀어나와 제자리에 앉고
//                           가방 아래짝이 90° 눕는다. 마지막 프레임이 열린 가방(모델 8)과
//                           정점 평균 0.001타일 안에서 겹친다 — 원작은 거기서 모델 8로 갈아 끼운다
//   2·4·6 `psel_mb_a/b/c`  73프레임  고른 볼이 흔들린다 (`UpdateSelectedPokeballAnimation`)
//
// 되돌리는 데 드는 모델 속살(`propModelInfo`)도 같이 싣는다. ⚠️ **노드 사슬은 늘 싣는다.**
// 볼은 맨 위 노드(`mb_null_*`)가 x로 흔들리고 볼·그림자가 그 자식이다 — 쉴 때는 맨 위가
// 단위라 `readSbc`가 사슬을 안 붙이는데(결과가 안 바뀐다), 그러면 애니에서 흔들림이 빠진다.
//
// 글창 팔레트(16번 · `Graphics_LoadPalette(…, 16, 0, FRAME_PALETTE_INDEX * 32, 32, …)`)의
// 첫 줄도 싣는다. 뱅크 360의 1~3번이 분류와 이름을 `{COLOR n}`으로 칠하는데, 그 색이
// 이 팔레트의 `n·2+1`번이다 (`render_text.c`의 `CHAR_CONTROL_SET_COLOR`).
//
// ⚠️ **노드 쪽(`tools/extract/starterScene.js`)은 이 함수를 그대로 부른다** — 읽는 코드를
// 두 벌 두지 않는다 (「굽는 쪽이 둘이다」)
import { narcEntry } from './nds'
import { readDict, parseModel, parseNodes, parsePolygons } from './nsbmd'
import { parseTex0 } from './nitrotex'
import {
  blocks, readSbc, parseMaterials, buildMesh, nodeChain, packChunk, placePair, wantedItems, type Vertex,
} from './chunks'
import { bakeSheet, type Sheet } from './sheets'
import { maybeLz77, palettes } from './ntrgfx'
import { propModelInfo } from './propAnims'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/ev_pokeselect.narc'
/** 구울 칸. `Make3DGraphics`가 부르는 모델 번호 그대로다 */
const MODELS = [1, 8, 3, 5, 7, 9]
/** 애니 칸. 모델 1의 짝이 0, 볼 3·5·7의 짝이 2·4·6이다 */
const CLIPS: Readonly<Record<number, number>> = { 1: 0, 3: 2, 5: 4, 7: 6 }
/** 글창 팔레트 (`FRAME_PALETTE_INDEX`에 싣는 것) */
const TEXT_PALETTE = 16

/** `[r,g,b]` → `#rrggbb` */
const hex = (c: readonly number[]): string =>
  `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** JNT0 애니 하나의 프레임 수. 머리 네 글자로 자리가 맞는지 먼저 본다 */
function clipFrames(file: Uint8Array): number {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const at = view.getUint32(16, true)
  const tag = String.fromCharCode(file[at]!, file[at + 1]!, file[at + 2]!, file[at + 3]!)
  if (tag !== 'JNT0') throw new Error(`JNT0가 아니다: ${tag}`)
  const list = readDict(file, view, at + 8)
  const head = at + view.getUint32(list[0]!.at, true)
  const magic = String.fromCharCode(file[head]!, file[head + 1]!, file[head + 2]!, file[head + 3]!)
  if (magic !== 'J\0AC') throw new Error('관절 애니 머리가 아니다')
  return view.getUint16(head + 4, true)
}

export async function convertStarterScene(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(NARC)
  if (!narc) throw new Error(`${NARC}을 못 읽었다`)

  const out: Produced = new Map()
  const sheets: Record<number, Sheet | null> = {}
  const clips: Record<number, number> = {}
  /** `anims.bin` 안의 `[자리, 길이]` */
  const anims: Record<number, [number, number]> = {}
  const info: Record<number, ReturnType<typeof propModelInfo> & { parents: number[] }> = {}
  const parts: Uint8Array[] = []
  let total = 0

  for (const [n, id] of MODELS.entries()) {
    const file = narcEntry(narc, id)
    if (!file) throw new Error(`${NARC} ${String(id)}번이 없다`)
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
    const found = blocks(file, view)
    const mdlAt = found.MDL0
    if (mdlAt === undefined) throw new Error(`모델 ${String(id)}에 MDL0가 없다`)
    const list = readDict(file, view, mdlAt + 8)
    const modelAt = mdlAt + view.getUint32(list[0]!.at, true)
    const header = parseModel(file, view, modelAt)
    const materials = parseMaterials(file, view, modelAt, header)
    const polygons = parsePolygons(file, view, modelAt, header)
    const nodes = parseNodes(file, view, modelAt)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset, nodes)

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mat = materials[pair.material]
      if (!poly || !mat) throw new Error(`모델 ${String(id)}: SBC가 없는 것을 가리킨다`)
      const mesh = buildMesh(poly.dl, header.upScale, mat)
      placePair(mesh.verts, pair, nodes)
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    // 헤더가 적어 둔 정점 수와 우리가 편 수가 같아야 한다. 다르면 SBC를 잘못 걸었다
    if (verts.length !== header.verts) {
      throw new Error(
        `모델 ${String(id)}: 정점 ${String(verts.length)} ≠ 헤더 ${String(header.verts)}`,
      )
    }
    out.set(`data/starter/${String(id)}.bin`, packChunk(verts, indices, materials, submeshes))

    let baked: { png: Uint8Array, sheet: Sheet } | null = null
    const texAt = found.TEX0
    if (texAt !== undefined) {
      const tex0 = parseTex0(file, texAt)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      baked = await bakeSheet(tex0, wantedItems(materials, tex0), palAt)
    }
    if (baked) out.set(`data/starter/${String(id)}.png`, baked.png)
    sheets[id] = baked?.sheet ?? null

    const clip = CLIPS[id]
    if (clip !== undefined) {
      const bin = narcEntry(narc, clip)
      if (!bin) throw new Error(`${NARC} 애니 ${String(clip)}번이 없다`)
      clips[id] = clipFrames(bin)
      anims[id] = [total, bin.length]
      parts.push(bin)
      total += bin.length
      const chain = nodeChain(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset, nodes)
      info[id] = {
        ...propModelInfo(nodes, pairs, materials),
        parents: nodes.map((_, i) => chain.parents[i] ?? -1),
      }
    }
    check(ctx)
    ctx.onProgress?.(n + 1, MODELS.length)
    await breathe(ctx)
  }

  const bytes = new Uint8Array(total)
  let o = 0
  for (const p of parts) { bytes.set(p, o); o += p.length }
  out.set('data/starter/anims.bin', bytes)

  const pal = narcEntry(narc, TEXT_PALETTE)
  if (!pal) throw new Error(`${NARC} 글창 팔레트 ${String(TEXT_PALETTE)}번이 없다`)
  const text = palettes(maybeLz77(pal))[0]!.map(hex)

  out.set('data/starter/index.json', json({ models: MODELS, sheets, clips, anims, info, text }))
  return out
}
