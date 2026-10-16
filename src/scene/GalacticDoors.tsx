// 갤럭시단 아지트 문 — BDSP 자동문을 원작 문 객체에 매단다 (3D_GAP_AUDIT §3.1)
//
// 원작의 아지트 문(`OBJ_EVENT_GFX_GALACTIC_HQ_DOOR` 202)은 **두 칸짜리 미닫이를 객체 둘로** 세운 것이다 — 서 · 동 한 짝씩
// (`LOCALID_GALACTIC_HQ_DOOR_WEST` · `_EAST`), 맵 다섯 곳 열 짝. 열쇠를 쓰면 스크립트가 두 짝을 바깥으로 한 칸씩 밀고
// (`WalkFastWest` · `WalkFastEast`) 숨김 플래그를 세운 뒤 지운다(`RemoveObject` — `scripts_galactic_hq_3f.s` 39~45줄 · 1F · 창고 같다).
// 원작 모델은 판때기가 아니라 뒤로 기운 판 한 장이다(`galactic_hq_door.nsbmd` — 폭 1 · 높이 0.125~2.25칸 · z −0.44→−0.88).
//
// BDSP는 같은 칸에 자동문 `M_C_001_AutoDoor_01`을 **닫힌 채** 구워 두었다 (실측 — 칸 한가운데가 문짝 상자 안이다):
//
// | 맵 | 원작 칸 | BDSP 문짝 |
// | --- | --- | --- |
// | 143 `C07R0301` 창고 | (8,7) (9,7) | 메시 하나 · x 8.00~10.00 · z 7.30~7.70 (두 짝이 한 조각) |
// | 305 `D26R0101` 1F | (22,18) (23,18) | 인스턴스 둘 · 한 칸씩 · z 18.30~18.70 |
// | 307 `D26R0103` 3F | (27,19) (28,19) | 〃 z 19.30~19.70 |
// | 308 `D26R0104` 4F | (8,14) (9,14) | 〃 z 14.30~14.70 |
// | 310 `D26R0106` B2F | (14,8) (15,8) | 〃 z 8.30~8.70 |
//
// 그대로 두면 문 하나가 BDSP 문짝과 원작 판 두 벌로 서고, 연 뒤에도 BDSP 문짝은 닫힌 채 남아 그 속으로 걸어 들어간다.
// 그래서 **구운 문짝은 숨기고, 그 기하를 칸마다 오려 객체 자리에 세운다** — 객체가 미끄러지면 문짝이 같이 미끄러지고(한 칸 밀기가
// 그대로 보인다), 객체가 숨거나 지워지면 문짝도 없다. 이미 플래그가 선 채 들어오면 객체가 아예 없어 문짝도 안 선다.
// 판때기는 같은 칸에 구운 문짝이 있을 때만 거른다(`bakedHqDoorAt` — `ObjectProps`의 `bakedVentActors`). BDSP가 안 섰으면 판이 선다.
//
// ⚠️ **워프 문 쪽(`DoorAnimations`)과 안 겹친다.** 다섯 맵 다 문짝에서 두 칸 안에 워프가 없다(`warp_events` 대조) — 구운 문짝을
// 워프 문으로 움직이는 `BdspDoor`는 이 문짝을 집지 않는다. 숨김은 인스턴스 행렬을 0으로 접는 것이라 그쪽이 되돌려도(`restoreLeaf`) 다시 접힌다
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Box3, BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, type Material, type Object3D,
} from 'three'
import { npcActors } from '../engine/actor/npcs'
import { isCloneNpc, npcsOf } from '../engine/map/world'

/** `OBJ_EVENT_GFX_GALACTIC_HQ_DOOR` */
export const GALACTIC_HQ_DOOR_GFX = 202

/** BDSP가 구워 둔 자동문 재질 (`M_C_001_AutoDoor_01`) */
function isBakedAutoDoor(m: Material): boolean {
  return /_AutoDoor_\d/.test(m.name)
}

/** 구운 자동문 한 조각 — 여러 번 서면 인스턴스 하나다 */
interface AutoDoorSource {
  mesh: Mesh
  /** 인스턴스 번호. 한 번 서는 메시면 −1 */
  index: number
  /** 그 조각의 월드 행렬 (붙일 때 잰 것) */
  place: Matrix4
  /** 원래 인스턴스 행렬 — 숨겼다가 되돌린다 */
  base: Matrix4
  /** 월드 상자 */
  box: Box3
  /** 지금 숨겼는가 */
  hidden: boolean
}

/** 지금 씬에 붙은 BDSP 층들의 자동문 */
const sources = new Set<AutoDoorSource>()

/** 인스턴스를 숨길 때 넣는 행렬 — 크기 0 */
const FOLDED = new Matrix4().makeScale(0, 0, 0)

/**
 * BDSP 층이 붙을 때 그 안의 자동문을 등록한다. 돌려준 함수로 뗀다(숨겼던 것은 되돌린다).
 * `ObjectProps`의 `holdBdspSigns`가 부른다 — 방 · 지역 · 던전이 다 그 하나를 부른다. 씬이 제자리(원점)에 놓인 채로 부른다
 */
export function holdAutoDoors(root: Object3D): () => void {
  root.updateMatrixWorld(true)
  const mine: AutoDoorSource[] = []
  const at = new Matrix4()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!mats.some(isBakedAutoDoor)) return
    const geo = o.geometry as BufferGeometry
    geo.computeBoundingBox()
    const local = geo.boundingBox
    if (!local) return
    if (o instanceof InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, at)
        const place = at.clone().premultiply(o.matrixWorld)
        mine.push({ mesh: o, index: i, place, base: at.clone(), box: local.clone().applyMatrix4(place), hidden: false })
      }
    } else {
      const place = o.matrixWorld.clone()
      mine.push({ mesh: o, index: -1, place, base: new Matrix4(), box: local.clone().applyMatrix4(place), hidden: false })
    }
  })
  for (const s of mine) sources.add(s)
  return () => {
    for (const s of mine) { showSource(s); sources.delete(s) }
  }
}

function hideSource(s: AutoDoorSource): void {
  if (s.hidden) return
  s.hidden = true
  if (s.mesh instanceof InstancedMesh) {
    s.mesh.setMatrixAt(s.index, FOLDED)
    s.mesh.instanceMatrix.needsUpdate = true
  } else s.mesh.visible = false
}

function showSource(s: AutoDoorSource): void {
  if (!s.hidden) return
  s.hidden = false
  if (s.mesh instanceof InstancedMesh) {
    s.mesh.setMatrixAt(s.index, s.base)
    s.mesh.instanceMatrix.needsUpdate = true
  } else s.mesh.visible = true
}

/** 조각이 칸 (x, z) 한가운데를 바닥에서 덮는가 */
function covers(s: AutoDoorSource, x: number, z: number): boolean {
  const cx = x + 0.5, cz = z + 0.5
  return s.box.min.x <= cx && cx <= s.box.max.x && s.box.min.z <= cz && cz <= s.box.max.z
}

/** 칸 (x, z)를 덮는 구운 자동문들 */
function sourcesAt(x: number, z: number): AutoDoorSource[] {
  return [...sources].filter((s) => covers(s, x, z))
}

/** 이 칸(원작 객체 칸)에 BDSP가 구운 자동문이 있는가 — 있으면 판때기 대신 그 문짝이 선다. 프레임마다 불린다 */
export function bakedHqDoorAt(x: number, z: number): boolean {
  for (const s of sources) if (covers(s, x, z)) return true
  return false
}

/** 칸 경계 여유 (칸) */
const EDGE = 1e-3

/**
 * 조각의 기하 중 칸 (x, z)에 드는 삼각형만 오린다 — 무게중심이 그 칸 안인 것. 월드 자리에 구워 넣고 칸 한가운데를 원점으로 옮긴다.
 *
 * 창고(`C07R0301`)는 두 짝이 한 메시라(x 8~10) 이것으로 칸마다 가른다. 던전 넷은 인스턴스가 이미 한 칸씩이라 통째로 든다
 */
export function cutDoorCell(geometry: BufferGeometry, place: Matrix4, x: number, z: number): BufferGeometry | null {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  flat.applyMatrix4(place)
  const pos = flat.getAttribute('position')
  const keep: number[] = []
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
    const mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
    // 경계를 양쪽 다 넣는다 — 문짝 바깥 끝면(창고 x 10.00)은 무게중심이 칸 선 위에 있다
    if (mx >= x - EDGE && mx <= x + 1 + EDGE && mz >= z - EDGE && mz <= z + 1 + EDGE) keep.push(t)
  }
  if (keep.length === 0) { flat.dispose(); return null }
  const out = new BufferGeometry()
  for (const [name, attr] of Object.entries(flat.attributes)) {
    const size = attr.itemSize
    const src = attr.array
    const arr = new (src.constructor as new (n: number) => typeof src)(keep.length * 3 * size)
    let o = 0
    for (const t of keep) for (let k = 0; k < 3; k++) for (let c = 0; c < size; c++) arr[o++] = src[(t + k) * size + c]!
    out.setAttribute(name, new BufferAttribute(arr, size, attr.normalized))
  }
  flat.dispose()
  out.translate(-(x + 0.5), 0, -(z + 0.5))
  out.computeBoundingSphere()
  return out
}

/** 문 객체 한 짝 */
interface DoorPiece {
  localID: number
  /** 배치표 칸 — 문짝을 오린 칸 */
  x: number
  z: number
  mesh: Mesh
}

/**
 * 아지트 문짝을 객체 자리에 세운다. 구운 문짝은 접어 둔다(머리말). 지금 맵의 배치표에서 문 객체를 읽는다 — **숨김 플래그가
 * 선 것까지**(그 칸의 구운 문짝도 접어야 열린 문이 열린 채 남는다)
 */
export function GalacticDoors({ mapId }: { mapId: number }) {
  const groupRef = useRef<Group>(null)
  /** 이 맵의 문 칸 (배치표) */
  const cells = useMemo(
    () => npcsOf(mapId).filter((n) => n.sprite === GALACTIC_HQ_DOOR_GFX && !isCloneNpc(n)),
    [mapId],
  )
  const pieces = useRef<DoorPiece[]>([])
  /** 문짝을 오려 둔 조각들 — 붙은 층이 바뀌면 다시 오린다 */
  const cutFrom = useRef<Set<AutoDoorSource>>(new Set())

  useEffect(() => () => {
    const group = groupRef.current
    for (const p of pieces.current) { group?.remove(p.mesh); p.mesh.geometry.dispose() }
    pieces.current = []
    for (const s of cutFrom.current) showSource(s)
    cutFrom.current = new Set()
  }, [cells])

  useFrame(() => {
    const group = groupRef.current
    if (group === null || cells.length === 0) return
    // 붙은 층의 조각이 바뀌었으면(떼고 붙였다) 다시 오린다
    const now = new Set<AutoDoorSource>()
    for (const n of cells) for (const s of sourcesAt(n.x, n.z)) now.add(s)
    const same = now.size === cutFrom.current.size && [...now].every((s) => cutFrom.current.has(s))
    if (!same) {
      for (const p of pieces.current) { group.remove(p.mesh); p.mesh.geometry.dispose() }
      pieces.current = []
      for (const s of cutFrom.current) if (!now.has(s)) showSource(s)
      for (const n of cells) {
        for (const s of sourcesAt(n.x, n.z)) {
          const geometry = cutDoorCell(s.mesh.geometry as BufferGeometry, s.place, n.x, n.z)
          if (geometry === null) continue
          const mats = (Array.isArray(s.mesh.material) ? s.mesh.material : [s.mesh.material]) as Material[]
          const mesh = new Mesh(geometry, mats.find(isBakedAutoDoor) ?? mats[0])
          mesh.name = `아지트 문 ${String(n.localID)}`
          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.visible = false
          group.add(mesh)
          pieces.current.push({ localID: n.localID, x: n.x, z: n.z, mesh })
        }
      }
      cutFrom.current = now
    }
    for (const s of now) hideSource(s)
    // ⚠️ **배우 목록이 아직 앞 맵의 것일 수 있다** (`VentModels`와 같은 경주) — 맞는 목록이 올 때까지 문짝을 안 세운다
    const ours = npcActors.mapId === mapId
    for (const p of pieces.current) {
      const actor = ours ? npcActors.byLocalID.get(p.localID) : undefined
      p.mesh.visible = actor !== undefined && actor.visible
      if (actor === undefined || !p.mesh.visible) continue
      p.mesh.position.set(
        actor.x + 0.5 + (actor.offsetX ?? 0),
        actor.offsetY ?? 0,
        actor.z + 0.5 + (actor.offsetZ ?? 0),
      )
    }
  })

  return <group ref={groupRef} />
}
