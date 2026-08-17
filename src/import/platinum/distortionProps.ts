// 필드 이펙트 소품 — 브라우저에서 (DATA.md §2.2 · PARITY §6.10 · §1.27)
//
// `/data/mmodel/fldeff.narc`의 NSBMD 서른아홉 칸이다. 이름은 깨어진 세계에서
// 왔지만 지금은 그 세계만의 것이 아니다 — 장막시티 체육관의 샌드백과 타이어,
// 나무열매 밭의 흙, 그리고 **안 그려지던 물체 열 종**(§1.27)이 다 여기 있다.
// 아카이브가 하나고 굽는 길이 같아서 표 하나로 둔다.
//
// ⚠️ **이게 없으면 판이 안 보인다.** 깨어진 세계의 「블록」은 지형이 아니라
// 소품이라, 밟으면 나타나야 할 발판이 상태로만 켜지고 화면에는 아무 일도 안
// 일어난다. 허공을 걷다가 길을 잃는다.
//
// ⚠️ **한동안 설치한 사람에게는 이 그룹이 통째로 없었다.** 노드 추출기
// (`tools/extract/distortionProps.js`)만 있고 브라우저 변환기가 없어서,
// 개발 서버에서는 `public/data/`에 구워 둔 것이 보이고 **설치본에서는 아무것도
// 안 보였다.** `public/data/`는 리포에도 배포물에도 안 들어간다 (DEPLOY §4).
//
// 파일 형식은 청크·소품과 같다(`PT3C`) — 읽는 쪽이 하나면 된다.
//
// ⚠️ **노드 쪽과 한 줄씩 같아야 한다.** 산출물을 바이트로 견주는 검사가 있다
// (DEPLOY §5 ⑨).
import { narcEntry } from './nds'
import { readDict, parseModel, parsePolygons } from './nsbmd'
import { parseTex0 } from './nitrotex'
import {
  blocks, readSbc, parseMaterials, buildMesh, packChunk, wantedItems, type Vertex,
} from './chunks'
import { bakeSheet, type Sheet } from './sheets'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'
import { PROP_MODEL_INDEX, PROP_POS_OFFSET } from './fldeffProps'

const NARC = '/data/mmodel/fldeff.narc'

export async function convertDistortionProps(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(NARC)
  if (!narc) throw new Error(`${NARC}을 못 읽었다`)

  const out: Produced = new Map()
  const sheets: (Sheet | null)[] = []

  for (const [kind, at] of PROP_MODEL_INDEX.entries()) {
    const file = narcEntry(narc, at)
    if (!file) throw new Error(`${NARC}에 ${String(at)}번 파일이 없다`)
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
    const found = blocks(file, view)
    const mdlAt = found.MDL0
    if (mdlAt === undefined) throw new Error(`소품 ${String(kind)}에 MDL0가 없다`)
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
      if (!poly || !mat) throw new Error(`소품 ${String(kind)}: SBC가 없는 것을 가리킨다`)
      const mesh = buildMesh(poly.dl, header.upScale, mat)
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    out.set(
      `data/distortionProps/${String(kind)}.bin`,
      packChunk(verts, indices, materials, submeshes),
    )

    let baked: { png: Uint8Array, sheet: Sheet } | null = null
    const texAt = found.TEX0
    if (texAt !== undefined) {
      const tex0 = parseTex0(file, texAt)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      baked = await bakeSheet(tex0, wantedItems(materials, tex0), palAt)
    }
    if (baked) out.set(`data/distortionProps/${String(kind)}.png`, baked.png)
    sheets.push(baked?.sheet ?? null)

    check(ctx)
    ctx.onProgress?.(kind + 1, PROP_MODEL_INDEX.length)
    await breathe(ctx)
  }

  out.set('data/distortionProps/index.json', json({
    count: PROP_MODEL_INDEX.length, sheets, offsets: PROP_POS_OFFSET,
  }))
  return out
}
