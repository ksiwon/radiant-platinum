// 안 그려지던 물체 열 종 (PARITY §1.27)
//
// 배치된 그림 172종 중 열 종은 화면에 **아무것도 안 세우고 있었다.** 간판
// 여섯(212건) · 눈덩이(19) · 책(7) · 사천왕 방문(8) · 로토무 방 벽(1),
// 다 합쳐 배치 247건이다.
//
// ⚠️ **판때기를 못 찾은 것이 아니라 원작에 판때기가 없다.** 원작에서 이 열
// 종은 **3D 오브젝트**라 2D 그림표(`mmodel.narc`)에 아예 없고, 렌더러 표가
// 사람 렌더러가 아닌 쪽으로 보낸다 (`ov5_021FAF40.c`). 그래서 `npcSprite`가
// `null`을 주고 `NpcSprites`가 조용히 건너뛰었다.
//
// ⚠️ **돌지 않는다.** 원작이 자리만 주고 그린다 —
// `Simple3D_DrawRenderObjWithPos`에 회전 인자가 없다 (`ov5_021F1310`).
// 배치표의 `facing`은 말을 걸 때 쓰는 값이지 모델을 돌리는 값이 아니다.
//
// ⚠️ **길은 이미 막고 있었다.** 안 보여도 통행은 `actor/obstacles`가 맡는다
// (§1.28) — 눈덩이 미는 것도 얼음 미끄럼도 그대로 돌고 있었다. 없던 것은 몸뿐이다.
//
// ⚠️ **BDSP 위에서도 같은 자리다.** BDSP 방 · 지역 · 던전은 원작 칸 좌표 그대로
// 지어져(`BdspRoom` · `BdspField` 머리말) 옮길 오프셋이 없고, 땅 높이도 원작과
// 같다 — 여기 세우는 자리(`groundYAt`)를 그대로 쓴다. 다만 **간판은 BDSP 지역에
// 구워져 있는 곳이 많다**(`isBakedSign`) — 그 자리에서만 원작 간판을 안 세운다.
// 실측(바깥 간판 189곳 · 칸 한가운데에서 1.2칸 안): 간판 26/29 · 우편함 2/2 ·
// 게시판 59/64(`Guide`) · 화살표 70/72 · 체육관 8/8 · 팁 14/14, 합 179곳이 BDSP에
// 있다(던전 D03R0101 · D31도 0.2~0.4칸). 나머지 열 곳(2~13칸 떨어짐)은 원작 것을 세운다 — 맵 통째로 내리면 빠진다.
// 책(방 넷 다 0.29칸에 `Book_03`)과 사천왕 방문(방 넷 다 0.04~0.10칸에 `DoorInner`)은 종류째 BDSP에 있다
// (`BDSP_BAKED_KINDS`) · 로토무 방 벽은 BDSP에 없어 늘 선다.
//
// **눈덩이는 BDSP 기믹 모델이다** (`gimmick/obj0004_00` Snowball · `engine/world/gimmicks`). BDSP도 체육관 방에 안 굽고 기믹으로
// 세우는 물건이라 방 glb에는 없다 — 원작 소품 대신 그 모델을 세운다. 기믹 그룹이 없는 옛 설치본은 원작 소품이 선다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, InstancedMesh, Matrix4, Mesh, Vector3, type BufferGeometry, type Material, type Object3D } from 'three'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { PROP_KIND_BY_GFX } from '../import/platinum/fldeffProps'
import { useLoadedProps } from './propMeshes'
import { groundYAt } from './distortion'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'
import { GIMMICK_MODELS } from '../engine/world/gimmicks'
import { gimmickPieces, loadGimmick, type GimmickPiece } from './gimmickModels'

/**
 * BDSP가 구워 둔 간판 · 우편함 · 게시판 재질 (`SignBoard_0x` · `Boardletter` · `Boardnumber` · `Post_01` · `Guide_0x` ·
 * `GuideLetter_01`). 게시판 빛(`GuideLight`) · 벽보(`Poster`)는 아니다
 */
export function isBakedSign(m: Material): boolean {
  return /SignBoard|Boardletter|Boardnumber|_Post_\d|_Guide(Letter)?_\d/.test(m.name)
}

/** 원작 간판 여섯 종(29~34 — 간판 · 우편함 · 게시판 · 화살표 · 체육관 · 팁)만 BDSP 것과 견준다 */
const SIGN_KINDS = new Set([29, 30, 31, 32, 33, 34])

/** 원작 간판 칸 한가운데와 BDSP 간판 한가운데가 이만큼(칸) 안이면 같은 간판이다 — 실측 짝은 다 이 안이다 */
const SIGN_MATCH = 1.2

/** 지금 씬에 붙은 BDSP 층들의 간판 자리 (x, z) */
const bakedSigns = new Set<readonly [number, number]>()

/**
 * BDSP 층이 붙을 때 그 안의 간판 자리와 환풍구 자리(`bakedVents`)를 등록한다. 돌려준 함수로 뗀다.
 * 씬이 제자리(원점)에 놓인 채로 부른다 — BDSP 층은 행렬 원점에 그대로 선다.
 *
 * ⚠️ **환풍구도 여기서 적는다** — 붙고 떼는 자리가 간판과 같다(`BdspRoom` · `BdspField` · `BdspDungeon`이 이 하나를 부른다)
 */
export function holdBdspSigns(root: Object3D): () => void {
  root.updateMatrixWorld(true)
  const signs: (readonly [number, number])[] = []
  const vents: (readonly [number, number])[] = []
  const bollards: BakedBox[] = []
  let template: VentTemplate | null = null
  const at = new Matrix4()
  const c = new Vector3()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    const pale = mats.some(isBakedBollard)
    const into = mats.some(isBakedSign) ? signs : mats.some(isBakedVent) ? vents : null
    if (into === null && !pale) return
    o.geometry.computeBoundingBox()
    const box = o.geometry.boundingBox
    if (!box) return
    box.getCenter(c)
    const center = c.clone()
    const places: Matrix4[] = []
    if (o instanceof InstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, at); places.push(at.clone().premultiply(o.matrixWorld)) }
    } else places.push(o.matrixWorld.clone())
    for (const m of places) {
      if (into === null) {
        const b = new Box3().copy(box).applyMatrix4(m)
        bollards.push([b.min.x, b.min.z, b.max.x, b.max.z])
        continue
      }
      const w = center.clone().applyMatrix4(m)
      into.push([w.x, w.z])
      // 환풍구 한 벌을 틀로 적어 둔다 — BDSP가 빠뜨린 두 자리에 같은 모델을 세운다 (`VentModels`)
      if (into === vents && template === null) {
        const bottom = new Vector3(center.x, box.min.y, center.z).applyMatrix4(m)
        template = { geometry: o.geometry as BufferGeometry, material: o.material as Material | Material[], place: m, bottom }
      }
    }
  })
  for (const p of signs) bakedSigns.add(p)
  for (const p of vents) bakedVents.add(p)
  for (const b of bollards) bakedBollards.add(b)
  const held = template
  if (held !== null) ventTemplates.add(held)
  return () => {
    for (const p of signs) bakedSigns.delete(p)
    for (const p of vents) bakedVents.delete(p)
    for (const b of bollards) bakedBollards.delete(b)
    if (held !== null) ventTemplates.delete(held)
  }
}

/** 이 자리(월드 x, z)에 BDSP가 구운 간판이 있는가 */
export function bakedSignNear(x: number, z: number): boolean {
  for (const [sx, sz] of bakedSigns) if (Math.hypot(sx - x, sz - z) < SIGN_MATCH) return true
  return false
}

// ── 환풍구 ────────────────────────────────────────────────────────────────────────────────────────────────
//
// 환풍구(`OBJ_EVENT_GFX_VENT` — 그림 182 · `generated/object_events_gfx.txt` 183줄)는 원작에서 **판때기**다(`spriteTable`의
// `venthole`). 그런데 BDSP 지역은 같은 자리에 원통 모델(`M_C_001_Intake_01`)을 구워 두어서, 판때기를 그대로 세우면 한 물체가
// 모델과 도트 판 두 벌로 선다(209번도로 · 1인칭에서 모델 뒤로 판이 삐져나온다).
//
// 실측(배치 65곳 · 지역 glb 13벌의 `Intake` 인스턴스 101개 · 칸 한가운데에서 가장 가까운 것): **63곳이 0.00칸**이고
// 둘은 1.00칸 — 이웃 칸의 환풍구다(`events_fight_area` 648,438 · `events_route_212_south` 462,826). 그 둘은 BDSP에 없다 — 같은
// `Intake` 메시를 그 칸에 옮겨 세운다(`VentModels` · 틀은 붙은 지역에서 하나 적는다). 지역이 안 붙었으면 판때기가 선다.
// 방 · 던전 glb에는 `Intake`가 없다(환풍구 열여덟 맵이 다 바깥이다).
//
// ⚠️ **판만 거른다.** 배치는 그대로라 통행(`actor/obstacles`)과 말 걸기(스크립트 2027)는 안 바뀐다

/** `OBJ_EVENT_GFX_VENT` */
export const VENT_GFX = 182

/** BDSP가 구워 둔 환풍구 재질 (`M_C_001_Intake_01`) */
export function isBakedVent(m: Material): boolean {
  return /_Intake_\d/.test(m.name)
}

/** 배치 칸 한가운데와 BDSP 환풍구 한가운데가 이만큼(칸) 안이면 같은 환풍구다 — 짝은 다 0.00칸, 이웃 칸은 1.00칸이다 */
const VENT_MATCH = 0.5

/** 지금 씬에 붙은 BDSP 층들의 환풍구 자리 (x, z) */
const bakedVents = new Set<readonly [number, number]>()

/** 이 자리(월드 x, z)에 BDSP가 구운 환풍구가 있는가 */
export function bakedVentNear(x: number, z: number): boolean {
  for (const [sx, sz] of bakedVents) if (Math.hypot(sx - x, sz - z) < VENT_MATCH) return true
  return false
}

/**
 * BDSP 환풍구 한 벌의 틀 — 지역 glb의 `Intake` 메시 하나와 그 자리. 붙은 지역마다 하나를 적는다(`holdBdspSigns`).
 * `bottom`은 그 자리에서 메시 밑면 한가운데다 — 다른 칸에 옮길 때 이 점을 칸 한가운데 땅에 댄다
 */
interface VentTemplate { geometry: BufferGeometry, material: Material | Material[], place: Matrix4, bottom: Vector3 }

/** 지금 씬에 붙은 BDSP 지역들의 환풍구 틀 */
const ventTemplates = new Set<VentTemplate>()

/** 아무 틀 하나 — 지역이 하나도 안 붙었으면 null */
function anyVentTemplate(): VentTemplate | null {
  for (const t of ventTemplates) return t
  return null
}

/**
 * 배치 중 판때기(`NpcSprites`)가 건너뛸 몫 — BDSP가 모델로 이미 세운 환풍구 · 말뚝. 지난 값(`was`)과 같으면 그것을 그대로
 * 돌려준다(프레임마다 불러도 상태를 안 흔든다).
 *
 * 환풍구는 BDSP가 빠뜨린 두 자리(머리말)도 지역이 붙어 있으면 든다 — 그 자리에는 붙은 지역의 `Intake` 틀을 옮겨 세운다
 * (`VentModels`). 말뚝은 BDSP 지역이 그 칸에 `BlockPale`을 구워 둔 것만 든다 (`bakedBollardAt`)
 */
export function bakedVentActors(list: readonly NpcActor[], was: ReadonlySet<NpcActor>): ReadonlySet<NpcActor> {
  const anyTemplate = anyVentTemplate() !== null
  const takes = (actor: NpcActor): boolean => {
    const x = actor.x + 0.5, z = actor.z + 0.5
    return actor.gfx === VENT_GFX ? anyTemplate || bakedVentNear(x, z)
      : actor.gfx === BOLLARD_GFX && bakedBollardAt(x, z)
  }
  // ⚠️ **바뀌지 않았으면 아무것도 안 만든다** — 프레임마다 불리므로 Set · 배열을 먼저 만들지 않고 지난 값과 바로 견준다.
  // 몫이 지난 값의 부분집합이고 개수가 같으면 같은 집합이다 (배우는 목록에 한 번씩만 든다)
  let n = 0, same = true
  for (const actor of list) {
    if (!takes(actor)) continue
    n++
    if (!was.has(actor)) { same = false; break }
  }
  if (same && n === was.size) return was
  const out = new Set<NpcActor>()
  for (const actor of list) if (takes(actor)) out.add(actor)
  return out
}

/**
 * BDSP가 빠뜨린 환풍구 — 붙은 지역의 `Intake` 틀을 그 칸 한가운데 땅에 옮겨 세운다. 틀의 회전 · 크기는 그대로 둔다
 * (원작 칸 둘 다 바깥이고 BDSP 환풍구 101개가 다 같은 메시다)
 */
function VentModels({ grid, layer, mapId }: { grid: MapGrid, layer: number, mapId: number }) {
  const [vents, setVents] = useState<readonly NpcActor[]>([])
  /** 이 맵의 목록을 읽어 둔 맵 — 아직 안 읽었으면 null */
  const readFor = useRef<number | null>(null)
  const meshes = useRef<(Mesh | null)[]>([])
  const [template, setTemplate] = useState<VentTemplate | null>(null)
  useEffect(() => { readFor.current = null; setVents([]) }, [mapId])
  useFrame(() => {
    // ⚠️ **배우 목록이 아직 앞 맵의 것일 수 있다** (`npcActors.mapId` · `BerryPatchProps`와 같은 경주). 맞는 목록이 올 때까지
    // 프레임마다 다시 본다 — 맵 id만 믿고 한 번 읽으면 앞 맵의 환풍구가 이 맵 좌표에 선다
    if (readFor.current !== mapId && npcActors.mapId === mapId) {
      readFor.current = mapId
      setVents(npcActors.list.filter((a) => a.gfx === VENT_GFX))
    }
    const t = anyVentTemplate()
    if (t !== template) setTemplate(t)
    if (t === null) return
    for (const [i, actor] of vents.entries()) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const x = actor.x + 0.5, z = actor.z + 0.5
      mesh.visible = actor.visible && !bakedVentNear(x, z)
      if (!mesh.visible) continue
      const y = groundYAt(grid, world.mapId, x, z, layer, actor.y)
      t.place.decompose(mesh.position, mesh.quaternion, mesh.scale)
      mesh.position.x += x - t.bottom.x
      mesh.position.y += y - t.bottom.y
      mesh.position.z += z - t.bottom.z
    }
  })
  if (template === null || vents.length === 0) return null
  return (
    <group>
      {vents.map((a, i) => (
        <mesh
          key={`${String(a.localID)}/${String(i)}`}
          ref={(m) => { meshes.current[i] = m }}
          geometry={template.geometry}
          material={template.material}
          visible={false}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}

// ── 말뚝 ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// 말뚝(`OBJ_EVENT_GFX_BOLLARD` — 그림 192 · `pole`)은 원작에서 판때기다. 배치 16곳 중 **열 곳은 BDSP 지역이 같은 칸에 흰 돌기둥
// (`M_C_001_BlockPale_*` · 높이 0.75칸)을 구워 두었다** — 연고시티 C05 넷(472·473·485·486, 687) · 만월섬 D15 셋(40, 275·276·278) ·
// 신월섬 D30 셋(151, 275·276·278). 칸 한가운데에서 위로부터 쏘면 그 열 칸만 땅 + 0.75에 `BlockPale`이 맞는다
// (`.audit/probe/gimmickLedges.mts look`). 그 자리에서 판때기까지 세우면 한 물체가 두 벌로 선다.
//
// 나머지 여섯은 BDSP에 짝이 없다 — 연고시티 체육관 방 `C05GYM0104`(8, 9·10)과 갤럭시단아지트 `D26R0104`(18·19, 14)는 그 칸이 맨바닥이고,
// 파이트에리어 C11(617, 434·435)은 BDSP 지역(`area014`)에서 바다다. 그 여섯은 판때기가 선다. BDSP 필드 glb의 `M_T_013_Bollard_01`
// (항구 계류주 0.89×0.69×0.83칸 · 선단 353·359,246 · 운하 42,753·756)은 모양이 다른 물건(버섯꼴 계류주)이라 갖다 쓰지 않는다.
//
// ⚠️ **판만 거른다.** 배치는 그대로라 통행(`actor/obstacles`)은 안 바뀐다

/** `OBJ_EVENT_GFX_BOLLARD` */
export const BOLLARD_GFX = 192

/** BDSP가 구운 말뚝 자리 재질 (`M_C_001_BlockPale_*`) */
export function isBakedBollard(m: Material): boolean {
  return /_BlockPale_/.test(m.name)
}

/** 바닥에서 본 상자 (최소 x, 최소 z, 최대 x, 최대 z) */
type BakedBox = readonly [number, number, number, number]

/** 지금 씬에 붙은 BDSP 층들의 `BlockPale` 상자 */
const bakedBollards = new Set<BakedBox>()

/** 이 자리(칸 한가운데 월드 x, z)를 BDSP `BlockPale`이 덮는가 */
export function bakedBollardAt(x: number, z: number): boolean {
  for (const [x0, z0, x1, z1] of bakedBollards) if (x0 <= x && x <= x1 && z0 <= z && z <= z1) return true
  return false
}

/** 눈덩이 소품 번호 (`fldeffProps`의 35 — 그림 118) */
const SNOWBALL_KIND = 35

/** 이 그림이 판때기가 아니라 소품인가 */
function propKindOf(gfx: number): number | null {
  return PROP_KIND_BY_GFX.get(gfx) ?? null
}

/**
 * **종류째 BDSP 방에 구워진 소품** — 책(36)과 사천왕 방문(37). 실측(glb 정점 · 배치 칸 한가운데에서 가장 가까운 조각):
 *
 * | 종류 | BDSP에 있나 |
 * | --- | --- |
 * | 책(그림 183) | 방 넷 다 0.29칸에 `Book_03` |
 * | 사천왕 방문(그림 209) | 방 넷 다 0.04~0.10칸에 `DoorInner` |
 * | 눈덩이(그림 118) | 체육관 방에 없다 — 가장 가까운 것이 계단(`OutStair`) 0.64칸 |
 * | 로토무 방 벽(그림 262) | 없다 — 가장 가까운 것이 방 벽(`ComWall_05`) 1.12칸 |
 *
 * 간판(29~34)은 자리마다 견준다(`bakedSignNear`). 눈덩이 · 로토무 방 벽(`C04R0201` 하나)은 BDSP 위에서도 선다 — 안 세우면
 * 선녀시티 체육관(`C09GYM0101`)의 눈덩이 19개가 **보이지 않는 벽**이 되어 미는 퍼즐을 눈 감고 풀어야 한다
 */
const BDSP_BAKED_KINDS: ReadonlySet<number> = new Set([36, 37])

/**
 * 이 소품을 세우는가. 숨은 사람은 안 세우고(사천왕 방문과 로토무 방 벽은 이야기가 진행되면 플래그로 사라진다 — 그것을 보는
 * 것이 `visible`이다), BDSP가 그 자리에 구워 둔 것이면 두 벌이 되므로 안 세운다
 *
 * @param bdsp BDSP 층이 서서 원작 그림을 숨겼는가 (`MapStreamer`의 `bdspDraws`)
 */
export function propShown(kind: number, x: number, z: number, visible: boolean, bdsp: boolean): boolean {
  if (!visible) return false
  if (SIGN_KINDS.has(kind) && bakedSignNear(x, z)) return false
  return !(bdsp && BDSP_BAKED_KINDS.has(kind))
}

interface Props {
  grid: MapGrid
  layer: number
  /** 맵이 바뀌면 배치를 다시 훑는다 */
  mapId: number
  /** BDSP 층이 서서 원작 그림을 숨겼는가 — 종류째 BDSP에 있는 것(`BDSP_BAKED_KINDS`)을 거른다 */
  bdsp: boolean
}

export function ObjectProps({ grid, layer, mapId, bdsp }: Props) {
  /**
   * 이 맵에서 소품으로 서야 하는 사람들.
   *
   * ⚠️ **`info.sprite`가 아니라 `gfx`를 본다** — 자리표시자(`OBJ_EVENT_GFX_VAR_*`)는
   * 변수로 실제 그림이 정해지고, 그 결과가 간판일 수 있다
   */
  const [placed, setPlaced] = useState<readonly { actor: NpcActor, kind: number }[]>([])
  useEffect(() => {
    const out: { actor: NpcActor, kind: number }[] = []
    for (const actor of npcActors.list) {
      const kind = propKindOf(actor.gfx)
      if (kind !== null) out.push({ actor, kind })
    }
    setPlaced(out)
  }, [mapId])

  /** 이 맵이 쓰는 종류만 받는다. 열을 다 받을 이유가 없다 */
  const kinds = useMemo(
    () => [...new Set(placed.map((p) => p.kind))].sort((a, b) => a - b),
    [placed],
  )
  const { byKind, offsets } = useLoadedProps(kinds)

  /**
   * 눈덩이의 BDSP 모델 (`gimmick/obj0004_00`). `undefined`는 받는 중이라 아무것도 안 세운다 · `null`은 없어서 원작 소품이 선다
   */
  const [snow, setSnow] = useState<GimmickPiece | null | undefined>(undefined)
  const wantsSnow = kinds.includes(SNOWBALL_KIND)
  useEffect(() => {
    if (!wantsSnow) return
    let alive = true
    void loadGimmick(GIMMICK_MODELS.snowball).then((gltf) => {
      if (alive) setSnow(gltf === null ? null : gimmickPieces(gltf, GIMMICK_MODELS.snowball)[0] ?? null)
    })
    return () => { alive = false }
  }, [wantsSnow])

  const meshes = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    for (const [i, at] of placed.entries()) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const x = at.actor.x + 0.5
      const z = at.actor.z + 0.5
      mesh.visible = propShown(at.kind, x, z, at.actor.visible, bdsp)
      if (!mesh.visible) continue
      // BDSP 눈덩이는 밑동이 원점이다 — 원작 소품의 자리 어긋남을 안 쓴다
      const off = at.kind === SNOWBALL_KIND && snow ? [0, 0, 0] : offsets[at.kind] ?? [0, 0, 0]
      mesh.position.set(
        x + off[0]!,
        groundYAt(grid, world.mapId, x, z, layer, at.actor.y) + off[1]!,
        z + off[2]!,
      )
    }
  })

  const vents = bdsp ? <VentModels grid={grid} layer={layer} mapId={mapId} /> : null
  if (placed.length === 0) return vents
  return (
    <group>
      {vents}
      {placed.map((at, i) => {
        if (at.kind === SNOWBALL_KIND && snow !== null) {
          if (snow === undefined) return null
          return (
            <mesh
              key={`${String(at.actor.localID)}/${String(i)}`}
              ref={(m) => { meshes.current[i] = m }}
              geometry={snow.geometry}
              material={snow.material}
              visible={false}
              castShadow
              receiveShadow
            />
          )
        }
        const got = byKind.get(at.kind)
        if (got === undefined) return null
        return (
          <mesh
            key={`${String(at.actor.localID)}/${String(i)}`}
            ref={(m) => { meshes.current[i] = m }}
            geometry={got.mesh.geometry}
            material={got.materials}
            visible={false}
          />
        )
      })}
    </group>
  )
}
