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
// ⚠️ **애니메이션 곡선(JNT0)은 아직 안 굽는다.** 0·2·4·6번이 그것이고, 가방이
// 열리는 동작과 고른 볼이 흔들리는 동작이 거기 있다. 지금은 덮인 모델과 열린
// 모델을 갈아 끼워서 순서만 원작대로 간다.
//
// 대신 **길이는 읽는다.** 헤더가 `"J\0AC"` · `u16 프레임 수` · `u16 노드 수`라
// 거기까지만 봐도 몇 프레임짜리인지 나온다. 그래야 가방이 열리는 자리에서
// 기다리는 시간이 원작과 같다.
//
// ⚠️ **노드 쪽(`tools/extract/starterScene.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { readDict, parseModel, parsePolygons } from './nsbmd'
import { parseTex0 } from './nitrotex'
import {
  blocks, readSbc, parseMaterials, buildMesh, packChunk, wantedItems, type Vertex,
} from './chunks'
import { bakeSheet, type Sheet } from './sheets'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/ev_pokeselect.narc'
/** 구울 칸. `Make3DGraphics`가 부르는 모델 번호 그대로다 */
const MODELS = [1, 8, 3, 5, 7, 9]
/** 길이만 읽을 칸. 모델 1의 짝이 0, 볼 3·5·7의 짝이 2·4·6이다 */
const CLIPS: Readonly<Record<number, number>> = { 1: 0, 3: 2, 5: 4, 7: 6 }

/** JNT0 애니 하나의 프레임 수. 머리 네 글자로 자리가 맞는지 먼저 본다 */
export function clipFrames(file: Uint8Array): number {
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
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mat = materials[pair.material]
      if (!poly || !mat) throw new Error(`모델 ${String(id)}: SBC가 없는 것을 가리킨다`)
      const mesh = buildMesh(poly.dl, header.upScale, mat)
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
    }
    check(ctx)
    ctx.onProgress?.(n + 1, MODELS.length)
    await breathe(ctx)
  }

  out.set('data/starter/index.json', json({ models: MODELS, sheets, clips }))
  return out
}
