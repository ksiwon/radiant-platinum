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
  blocks, readSbc, parseMaterials, buildMesh, packChunk, placePair, sbcBillboards, wantedItems, type Vertex,
} from './chunks'
import { bakeSheet, type Sheet } from './sheets'
import { framesOf, propModelInfo } from './propAnims'
import { patTextures, readNsbtp } from './nsbtp'
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
  // ── 창기둥 영상 (`overlay100`) — 애니 차례는 원작이 붙이는 칸 차례다 (`ov100_021D4B4C(칸, …)`) ──
  // 장면 0 (`ov100_021D2F0C.c`) — 부르기
  { name: 'pillarMap', narc: TENGAN, model: 46, anims: [] },
  { name: 'pillars', narc: TENGAN, model: 24, anims: [22, 23] },
  { name: 'darkOrb', narc: TENGAN, model: 79, anims: [77, 78, 80, 81] },
  { name: 'blob', narc: TENGAN, model: 65, anims: [] },
  { name: 'dialga', narc: TENGAN, model: 66, anims: [67] },
  { name: 'palkia', narc: TENGAN, model: 68, anims: [69] },
  { name: 'hero', narc: TENGAN, model: 61, anims: [62] },
  { name: 'heroine', narc: TENGAN, model: 63, anims: [64] },
  { name: 'cyrus', narc: TENGAN, model: 13, anims: [14] },
  { name: 'galaxy', narc: TENGAN, model: 84, anims: [82, 83] },
  // 장면 1 (`ov100_021D13E4.c`) — 호수의 셋
  { name: 'lakeBg', narc: TENGAN, model: 60, anims: [] },
  { name: 'uxie', narc: TENGAN, model: 59, anims: [57, 58] },
  { name: 'mesprit', narc: TENGAN, model: 45, anims: [43, 44] },
  { name: 'azelf', narc: TENGAN, model: 17, anims: [15, 16] },
  // 장면 2 (`ov100_021D1C44.c`) — 기라티나
  { name: 'drip', narc: TENGAN, model: 53, anims: [51, 52] },
  { name: 'orb', narc: TENGAN, model: 55, anims: [54, 56] },
  { name: 'giratinaA', narc: TENGAN, model: 26, anims: [25, 27] },
  { name: 'giratinaB', narc: TENGAN, model: 29, anims: [28, 30] },
  { name: 'giratinaC', narc: TENGAN, model: 32, anims: [31, 33] },
  { name: 'giratinaD', narc: TENGAN, model: 35, anims: [34, 36] },
  { name: 'giratinaE', narc: TENGAN, model: 38, anims: [37, 39] },
  { name: 'shadowA', narc: TENGAN, model: 41, anims: [40] },
  { name: 'shadowB', narc: TENGAN, model: 42, anims: [] },
]

/** 애니 머리 — 맵 소품의 셋(`framesOf`)에 재질 색(BMA0)과 보임(BVA0)을 더한다. 프레임 수 자리는 같다 */
function animHeader(member: Uint8Array): Pick<AnimRow, 'kind' | 'frames'> | null {
  const tag = String.fromCharCode(member[0]!, member[1]!, member[2]!, member[3]!)
  if (tag === 'BMA0' || tag === 'BVA0') {
    const got = framesOf(new Uint8Array([...'BCA0'].map((c) => c.charCodeAt(0)).concat([...member.subarray(4)])))
    return got ? { kind: tag, frames: got.frames } : null
  }
  return framesOf(member)
}

interface AnimRow { kind: 'BCA0' | 'BTA0' | 'BTP0' | 'BMA0' | 'BVA0', frames: number, at: number, size: number }

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
    info: ReturnType<typeof propModelInfo> & { rest?: ([number, number, number] | null)[] }
    anims: AnimRow[]
    /**
     * 그림 알파로 비치는 재질 (재질 차례). 그림이 A3I5(1) · A5I3(6)이면 텍셀마다 알파가 있다 — 문의 고리 · 성운이 그렇다.
     * 재질 알파(31)만 보면 불투명으로 그려 화면이 한 색으로 막힌다
     */
    blend: number[]
    /**
     * 재질마다의 빛 — `[켠 빛, 확산 r g b, 환경 r g b]`(RGB5). 영상이 원작 두 빛으로 명암을 넣는다(`ov100_021D47A0`).
     * 굽는 메시는 빛을 켠 정점을 흰색으로 둔다(`buildMesh`) — 명암은 화면이 법선으로 다시 낸다
     */
    light: number[][]
    /** 기본 자세를 굽는 데 대신 쓴 배율 (노드마다 · 안 바꾼 노드는 null) — 없으면 모두 원래 배율이다 */
    rest?: ([number, number, number] | null)[]
    /** 광고판 노드 `[노드, 0 BB · 1 BBY]` — 그 노드의 조각은 카메라를 본다 (`sbcBillboards`) */
    billboard: [number, 0 | 1][]
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
    const nodes = parseNodes(file, view, modelAt)
    // ⚠️ **기본 자세 배율이 0인 노드는 1로 굽는다.** 원작은 노드 공간의 정점에 그 틱의 행렬을 곱하지만 우리는 기본 자세로 발라
    // 굽는다 — 배율 0이면 정점이 한 점(한 면)으로 눌려 애니가 되살릴 수 없다. 유크시 · 엠라이트 · 아그놈의 빛무리, 기라티나
    // 그림자(x 0), 기둥에서 떨어지는 방울(전부 0)이 그렇다. 화면은 이 대신 쓴 배율(`rest`)로 되돌린다
    const flat = (v: number): boolean => Math.abs(v) < 1e-6
    const bakeNodes = nodes.map((n) => (n.s.some(flat) ? { ...n, s: n.s.map((v) => (flat(v) ? 1 : v)) as typeof n.s } : n))
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset, bakeNodes)

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const poly = polygons[pair.polygon]
      const mat = materials[pair.material]
      if (!poly || !mat) throw new Error(`${spec.name}: SBC가 없는 것을 가리킨다`)
      const mesh = buildMesh(poly.dl, header.upScale, mat)
      placePair(mesh.verts, pair, bakeNodes)
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
      // ⚠️ **BTP0가 부르는 그림도 같이 굽는다** — 재질은 첫 그림 하나만 가리킨다. 주인공(`pl_boy01c`)은 32장을 갈아 끼운다
      const pat: [string, string][] = []
      for (const member of spec.anims) {
        const raw = narcEntry(narc, member)
        if (raw !== null && String.fromCharCode(...raw.subarray(0, 4)) === 'BTP0') pat.push(...patTextures(readNsbtp(raw)))
      }
      baked = await bakeSheet(tex0, wantedItems(materials, tex0, pat), palAt)
    }
    if (baked) out.set(`data/demo/${spec.name}.png`, baked.png)

    const anims: AnimRow[] = []
    for (const member of spec.anims) {
      const raw = narcEntry(narc, member)
      const got = raw === null ? null : animHeader(raw)
      if (raw === null || got === null) throw new Error(`${spec.narc} ${String(member)}번이 애니가 아니다`)
      anims.push({ ...got, at: total, size: raw.length })
      parts.push(raw)
      total += raw.length
    }
    const five = (c: readonly number[]): number[] => c.map((v) => v >> 3)
    const light = materials.map((m) => [m.lights, ...five(m.diffuse), ...five(m.ambient)])
    const billboard = sbcBillboards(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    const info = propModelInfo(nodes, pairs, materials)
    const rest = bakeNodes.map((n, i) => (n === nodes[i] ? null : [...n.s] as [number, number, number]))
    models[spec.name] = {
      sheet: baked?.sheet ?? null, info: rest.some((r) => r !== null) ? { ...info, rest } : info, anims, blend, light, billboard,
    }

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
