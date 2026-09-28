// 이야기 연출의 3D 모델 — 창기둥과 깨어진 세계로 가는 문 (DATA.md §2.21f)
//
// 필드 밖에서 도는 연출 셋이 쓰는 모델이다. 어느 아카이브의 몇 번이 무엇인지는 원작이 적어 준다:
//
//   문 (`dw_warp/dw_warp.c`)                  `demo/title/titledemo.narc` 16 모델 · 18 BCA0 · 17 BTA0
//   붉은 사슬 (`ov6_0223E140.c`의 `ov6_02240104`)  `arc/demo_tengan_gra.narc` 6 모델 · 4 BCA0 (5 BMA0는 아직 안 읽는다)
//   호수의 구슬 셋 (같은 파일 `v3` 표)            같은 아카이브 12·11 유크시 · 8·7 아그놈 · 10·9 엠라이트
//
// 모델은 소품과 같은 `PT3C`로 굽고, 애니는 맵 소품처럼 **원작 바이트를 그대로** 잇는다(`anims.bin`) — 푸는 것은
// 화면 쪽이다(`scene/propAnim`). 관절 애니를 되돌리는 데 드는 모델 속살(`propModelInfo`)도 같이 싣는다.
//
// ⚠️ **굽는 쪽 둘이 이 함수 하나를 부른다** — 노드 추출기(`tools/extract/demoModels.mjs`)는 롬을 여는 자리만 다르다.
// 해석 코드를 두 벌 두지 않는다 (「굽는 쪽이 둘이다」)
import { narcEntry } from './nds'
import { readDict, parseModel, parseNodes, parsePolygons } from './nsbmd'
import { parseTex0 } from './nitrotex'
import {
  blocks, readSbc, parseMaterials, buildMesh, packChunk, placeByNode, wantedItems, type Vertex,
} from './chunks'
import { bakeSheet, type Sheet } from './sheets'
import { framesOf, propModelInfo } from './propAnims'
import { breathe, check, json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const TITLE_DEMO = '/demo/title/titledemo.narc'
const TENGAN = '/arc/demo_tengan_gra.narc'

interface DemoModel {
  /** 굽는 이름 — `data/demo/<name>.{bin,png}` */
  name: string
  narc: string
  model: number
  /** 딸린 애니 멤버 (원작이 붙이는 차례) */
  anims: readonly number[]
}

/** 구울 것. 번호는 위 머리말의 원작 자리 그대로다 */
export const DEMO_MODELS: readonly DemoModel[] = [
  { name: 'portal', narc: TITLE_DEMO, model: 16, anims: [18, 17] },
  { name: 'redChain', narc: TENGAN, model: 6, anims: [4] },
  { name: 'orbUxie', narc: TENGAN, model: 12, anims: [11] },
  { name: 'orbAzelf', narc: TENGAN, model: 8, anims: [7] },
  { name: 'orbMesprit', narc: TENGAN, model: 10, anims: [9] },
]

interface AnimRow { kind: 'BCA0' | 'BTA0' | 'BTP0', frames: number, at: number, size: number }

export async function convertDemoModels(ctx: ConvertContext): Promise<Produced> {
  const out: Produced = new Map()
  const narcs = new Map<string, Uint8Array>()
  const open = async (path: string): Promise<Uint8Array> => {
    const hit = narcs.get(path)
    if (hit) return hit
    const got = await readRomFile(ctx, path)
    narcs.set(path, got)
    return got
  }

  const models: Record<string, {
    sheet: Sheet | null
    info: ReturnType<typeof propModelInfo>
    anims: AnimRow[]
    /**
     * 그림 알파로 비치는 재질 (재질 차례). 그림이 A3I5(1) · A5I3(6)이면 텍셀마다 알파가 있다 — 문의 고리 · 성운이 그렇다.
     * 재질 알파(31)만 보면 불투명으로 그려 화면이 한 색으로 막힌다
     */
    blend: number[]
  }> = {}
  const parts: Uint8Array[] = []
  let total = 0

  for (const [n, spec] of DEMO_MODELS.entries()) {
    const narc = await open(spec.narc)
    const file = narcEntry(narc, spec.model)
    if (!file) throw new Error(`${spec.narc} ${String(spec.model)}번이 없다`)
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
    const found = blocks(file, view)
    const mdlAt = found.MDL0
    if (mdlAt === undefined) throw new Error(`${spec.name}에 MDL0가 없다`)
    const list = readDict(file, view, mdlAt + 8)
    const modelAt = mdlAt + view.getUint32(list[0]!.at, true)
    const header = parseModel(file, view, modelAt)
    const materials = parseMaterials(file, view, modelAt, header)
    const polygons = parsePolygons(file, view, modelAt, header)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    const nodes = parseNodes(file, view, modelAt)

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mat = materials[pair.material]
      if (!poly || !mat) throw new Error(`${spec.name}: SBC가 없는 것을 가리킨다`)
      const mesh = buildMesh(poly.dl, header.upScale, mat)
      placeByNode(mesh.verts, nodes[pair.node])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    out.set(`data/demo/${spec.name}.bin`, packChunk(verts, indices, materials, submeshes))

    let baked: { png: Uint8Array, sheet: Sheet } | null = null
    const blend: number[] = []
    const texAt = found.TEX0
    if (texAt !== undefined) {
      const tex0 = parseTex0(file, texAt)
      for (const [i, m] of materials.entries()) {
        const fmt = tex0.textures.find((t) => t.name === m.texture)?.format
        if (fmt === 1 || fmt === 6) blend.push(i)
      }
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      baked = await bakeSheet(tex0, wantedItems(materials, tex0), palAt)
    }
    if (baked) out.set(`data/demo/${spec.name}.png`, baked.png)

    const anims: AnimRow[] = []
    for (const member of spec.anims) {
      const raw = narcEntry(narc, member)
      const got = raw === null ? null : framesOf(raw)
      if (raw === null || got === null) throw new Error(`${spec.narc} ${String(member)}번이 애니가 아니다`)
      anims.push({ ...got, at: total, size: raw.length })
      parts.push(raw)
      total += raw.length
    }
    models[spec.name] = { sheet: baked?.sheet ?? null, info: propModelInfo(nodes, pairs, materials), anims, blend }

    check(ctx)
    ctx.onProgress?.(n + 1, DEMO_MODELS.length)
    await breathe(ctx)
  }

  const bytes = new Uint8Array(total)
  let o = 0
  for (const p of parts) { bytes.set(p, o); o += p.length }
  out.set('data/demo/anims.bin', bytes)
  out.set('data/demo/index.json', json({ models }))
  return out
}
