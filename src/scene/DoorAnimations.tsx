import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Box3, DoubleSide, InstancedMesh, Matrix4, Mesh, Vector3, type Group, type Material, type Object3D,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { loadPropAnims } from '../data/gameData'
import type { PropAnimsFile } from '../data/schema'
import { DOOR_KIND, type DoorKind } from '../import/platinum/propAnims'
import { type DoorVisual, useDoorVisualStore } from './doorVisualStore'

/**
 * 표를 못 받았을 때 쓰는 길이 (ms).
 *
 * ⚠️ **원작 값이 아니다.** 진짜 길이는 `bm_anime.narc`의 클립이 든다 —
 * 소품마다 다르고 열 때(클립 0)와 닫을 때(클립 1)가 따로다. 설치본에
 * `data/props/anims.json`이 없을 때만 여기로 떨어진다
 */
const FALLBACK_MS = 200

/** 원작은 한 틱에 한 프레임 돌린다 (`MapPropAnimation_AdvanceFrame`) */
const FRAME_MS = 1000 / 60

interface DoorClip {
  kind: DoorKind
  /** 여는 데 걸리는 시간 (ms) — 클립 0 */
  openMs: number
  /** 닫는 데 걸리는 시간 (ms) — 클립 1 */
  shutMs: number
}

/**
 * 소품 번호로 그 문의 갈래와 길이를 낸다.
 *
 * 원작은 그 자리에 실제로 놓인 **소품 모델 번호**로 가르고
 * (`DoorAnimation_FindDoorAndLoad`가 스무 종을 훑는다) **열 때 클립 0 · 닫을
 * 때 클립 1**을 튼다 (`DoorAnimation_Play*Animation`). 우리 격자도 그 번호를
 * 안다 (`grid.propModelAt`).
 *
 * 실측 — 나무 여닫이는 여닫이 다 **8프레임(133ms)**이고, 포켓몬센터 미닫이는
 * **15프레임(250ms)** · 체육관 미닫이는 **10프레임(167ms)**이다. 한동안
 * 모두가 200ms였다
 */
export function doorClip(model: number, table: PropAnimsFile | null): DoorClip {
  const kind = DOOR_KIND[model] ?? 'hinged'
  const ids = table?.props[String(model)]
  if (!ids || ids.length < 2 || !table) return { kind, openMs: FALLBACK_MS, shutMs: FALLBACK_MS }
  const span = (at: number | undefined): number => {
    const frames = at === undefined ? undefined : table.members[at]?.frames
    return frames === undefined ? FALLBACK_MS : frames * FRAME_MS
  }
  return { kind, openMs: span(ids[0]), shutMs: span(ids[1]) }
}

export function progress(door: DoorVisual, clip: DoorClip, now = performance.now()): number {
  const span = door.phase === 'closing' ? clip.shutMs : clip.openMs
  const t = Math.min(1, Math.max(0, (now - door.since) / Math.max(1, span)))
  if (door.phase === 'opening') return t
  if (door.phase === 'closing') return 1 - t
  return door.phase === 'open' ? 1 : 0
}

function Door({ door, y, clip }: { door: DoorVisual; y: number; clip: DoorClip }) {
  const leaf = useRef<Group>(null)
  useFrame(() => {
    const group = leaf.current
    if (!group) return
    const t = progress(door, clip)
    const eased = t * t * (3 - 2 * t)
    if (clip.kind === 'hinged') {
      group.rotation.y = -eased * Math.PI * 0.52
      group.scale.x = 1
      return
    }
    // ⚠️ **미닫이는 안 돈다.** 원작 클립(`gym_door00op`)이 문짝의 **X 크기를
    // 0으로 눌러** 문틀 속으로 넣는다 — 여닫이처럼 돌리면 문이 통로를 가로막고
    // 선다 (DATA §2.31)
    group.rotation.y = 0
    group.scale.x = Math.max(0.001, 1 - eased)
  })
  return (
    <group position={[door.x + 0.5, y, door.z + 0.5]} rotation={[0, door.yaw, 0]}>
      {/* 기존 정적 문을 가리는 어두운 통로. 문짝이 돌면 실제 빈 공간이 남는다. */}
      <mesh position={[0, 0.92, -0.045]}>
        <planeGeometry args={[0.92, 1.84]} />
        <meshBasicMaterial color="#07090e" />
      </mesh>
      <mesh position={[-0.5, 0.94, 0]} castShadow>
        <boxGeometry args={[0.1, 1.98, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <mesh position={[0.5, 0.94, 0]} castShadow>
        <boxGeometry args={[0.1, 1.98, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <boxGeometry args={[1.1, 0.1, 0.14]} />
        <meshStandardMaterial color="#473322" roughness={0.88} />
      </mesh>
      <group ref={leaf} position={[-0.43, 0, 0.035]}>
        <mesh position={[0.43, 0.92, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.84, 1.76, 0.09]} />
          <meshStandardMaterial color="#765334" roughness={0.82} metalness={0.02} />
        </mesh>
        <mesh position={[0.72, 0.9, 0.07]} castShadow>
          <sphereGeometry args={[0.055, 12, 8]} />
          <meshStandardMaterial color="#d3ad58" metalness={0.72} roughness={0.28} />
        </mesh>
      </group>
    </group>
  )
}

// ── BDSP 문짝 ────────────────────────────────────────────────────────────────────────────────────────────
//
// BDSP 방 · 지역 · 던전에는 문짝이 **정적 메시로 구워져** 있다(재질 `…_DoorOuter_…` · `…_DoorInner_…` · `…_AutoDoor_…` ·
// `…_DoorElv_…` · `…_Door_01`). BDSP가 서면 원작 소품이 숨으므로(`ChunkModels`의 `dsHidden`) 원작 문짝 클립도 안 돌고, 그대로
// 두면 닫힌 문 앞에서 덮개만 걸린다. 그래서 **구운 문짝을 원작 클립의 갈래와 길이로 움직인다** — 여닫이는 경첩 쪽 모서리를
// 축으로 안쪽으로 돌리고, 미닫이는 문짝의 가로를 바깥 모서리 쪽으로 눌러 넣는다(`gym_door00op`과 같은 움직임 · DATA §2.31).
//
// 실측 (`models/field/area001~003`): 문짝 한가운데가 그 문의 워프 칸 한가운데에서 0.03~0.35칸 안이고(영원시티는 1.0~1.3칸 —
// 워프가 문 앞 칸이다), 포켓몬센터 자동문은 0.75칸 두 짝이 나란히 선다(`DoorOuter_02_02` · `DoorOuter_04`)

/** 구운 BDSP 문짝 재질인가. 게이트(`BarrierGate` · `PalGate` · `Gate_01`)와 문 앞 빛(`GateLight`)은 문짝이 아니다 */
export function isDoorLeaf(m: Material): boolean {
  return /_(DoorOuter|DoorInner|DoorElv|AutoDoor|Door)_\d/.test(m.name)
}

/** 구운 문짝 하나 — 여러 번 서는 것이면 인스턴스 하나다 */
interface DoorLeaf {
  mesh: Mesh
  /** 인스턴스 번호. 한 번 서는 메시면 −1 */
  index: number
  /** 월드 상자 (붙일 때 잰 것) */
  box: Box3
  /** 원래 행렬 — 메시면 제 `matrix`, 인스턴스면 그 인스턴스 행렬 */
  base: Matrix4
}

/** 지금 씬에 붙은 BDSP 층들의 문짝 */
const leaves = new Set<DoorLeaf>()

/** 문 칸 한가운데에서 이만큼(칸) 안의 문짝이 그 문의 것이다 — 영원시티가 1.3칸이다 */
const LEAF_REACH = 1.5
/** 문짝 밑동과 문 칸 땅 높이가 이만큼(칸) 안이어야 한다 — 위층 문을 끌고 가지 않게 */
const LEAF_RISE = 1.5

/**
 * BDSP 층이 붙을 때 그 안의 문짝을 등록한다. 돌려준 함수로 뗀다(움직이던 문짝은 원래 자리로 돌린다).
 *
 * ⚠️ **씬이 제자리(원점)에 놓인 채로 부른다** — 상자를 여기서 한 번 잰다. BDSP 층은 행렬 원점에 그대로 선다(`BdspRoom` 머리말)
 */
export function holdBdspDoors(root: Object3D): () => void {
  root.updateMatrixWorld(true)
  const mine: DoorLeaf[] = []
  const at = new Matrix4()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!mats.some(isDoorLeaf)) return
    o.geometry.computeBoundingBox()
    const local = o.geometry.boundingBox as Box3 | null
    if (!local) return
    if (o instanceof InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, at)
        const box = local.clone().applyMatrix4(at.clone().premultiply(o.matrixWorld))
        mine.push({ mesh: o, index: i, box, base: at.clone() })
      }
    } else {
      o.updateMatrix()
      mine.push({ mesh: o, index: -1, box: local.clone().applyMatrix4(o.matrixWorld), base: o.matrix.clone() })
    }
  })
  for (const l of mine) leaves.add(l)
  return () => {
    for (const l of mine) { restoreLeaf(l); leaves.delete(l) }
  }
}

/** 그 문 칸(땅 높이 `y`)에 붙은 BDSP 문짝들. 없으면 빈 목록 — 그때는 원작 길로 간다 */
export function bdspDoorLeaves(x: number, z: number, y: number): DoorLeaf[] {
  const cx = x + 0.5, cz = z + 0.5
  const c = new Vector3()
  return [...leaves].filter((l) => {
    l.box.getCenter(c)
    return Math.hypot(c.x - cx, c.z - cz) <= LEAF_REACH && Math.abs(l.box.min.y - y) <= LEAF_RISE
  })
}

/** 문짝에 월드 변환 `d`를 얹는다 — 원래 행렬 앞에 곱한다 */
function poseLeaf(l: DoorLeaf, d: Matrix4): void {
  if (l.mesh instanceof InstancedMesh) {
    const w = l.mesh.matrixWorld
    const local = new Matrix4().copy(w).invert().multiply(d).multiply(w).multiply(l.base)
    l.mesh.setMatrixAt(l.index, local)
    l.mesh.instanceMatrix.needsUpdate = true
    return
  }
  const parent = l.mesh.parent
  const pw = parent ? parent.matrixWorld : new Matrix4()
  l.mesh.matrixAutoUpdate = false
  l.mesh.matrix.copy(pw).invert().multiply(d).multiply(pw).multiply(l.base)
  l.mesh.matrixWorldNeedsUpdate = true
}

function restoreLeaf(l: DoorLeaf): void {
  if (l.mesh instanceof InstancedMesh) {
    l.mesh.setMatrixAt(l.index, l.base)
    l.mesh.instanceMatrix.needsUpdate = true
    return
  }
  l.mesh.matrix.copy(l.base)
  l.mesh.matrixAutoUpdate = true
  l.mesh.matrixWorldNeedsUpdate = true
}

/** 여닫이가 다 열렸을 때 도는 각 — 우리 문짝(`Door`)과 같다 */
const SWING = Math.PI * 0.52

/**
 * 문짝 하나가 열린 정도 `eased`(0~1)일 때 얹을 월드 변환.
 *
 * 문의 가로축은 `yaw`가 정한다(`doorVisualStore`의 `doorYaw` — 주인공에서 문 쪽이 안쪽 +z). 문짝이 문 한가운데에서 가로로 비켜
 * 섰으면(두 짝 자동문) 바깥 모서리가 축이고, 한가운데면 왼쪽(−x) 모서리가 축이다 — 우리 문짝(`Door`)과 같은 쪽이다
 */
export function leafPose(box: Box3, middle: Vector3, yaw: number, kind: DoorKind, eased: number): Matrix4 {
  const ax = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const c = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const width = Math.abs(size.x * ax.x) + Math.abs(size.z * ax.z)
  const off = c.clone().sub(middle).dot(ax)
  const side = off > 0.1 ? 1 : -1
  const pivot = c.clone().addScaledVector(ax, side * width / 2)
  const to = new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
  const from = new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  if (kind === 'hinged') {
    // 왼쪽 경첩은 −각, 오른쪽 경첩은 +각이어야 둘 다 안쪽(+z)으로 열린다
    return to.multiply(new Matrix4().makeRotationY(side * SWING * eased)).multiply(from)
  }
  const turn = new Matrix4().makeRotationY(yaw)
  const back = new Matrix4().makeRotationY(-yaw)
  const squeeze = new Matrix4().makeScale(Math.max(0.001, 1 - eased), 1, 1)
  return to.multiply(turn).multiply(squeeze).multiply(back).multiply(from)
}

/** 열린 문 너머를 가리는 어두운 판의 색 — 우리 문짝(`Door`)의 통로와 같다 */
const PASSAGE = '#07090e'

/** 구운 문짝을 원작 클립의 갈래 · 길이로 움직인다 */
function BdspDoor({ door, clip, found }: { door: DoorVisual, clip: DoorClip, found: readonly DoorLeaf[] }) {
  const passage = useRef<Group>(null)
  const span = useMemo(() => {
    const all = new Box3()
    for (const l of found) all.union(l.box)
    const ax = new Vector3(Math.cos(door.yaw), 0, -Math.sin(door.yaw))
    const inward = new Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw))
    const size = all.getSize(new Vector3())
    const width = Math.abs(size.x * ax.x) + Math.abs(size.z * ax.z)
    const middle = all.getCenter(new Vector3())
    // 여닫이는 문짝이 안쪽으로 한 짝 너비만큼 돈다 — 그 뒤에 판을 세워야 문짝이 판을 안 뚫는다
    const depth = (clip.kind === 'hinged' ? width : 0) + 0.06
    const at = middle.clone().addScaledVector(inward, depth)
    return { middle, width, height: size.y, at }
  }, [found, door.yaw, clip.kind])
  // 목록은 그릴 때마다 새로 찾으므로(`bdspDoorLeaves`) 의존에 걸면 문 상태가 바뀔 때마다 되돌린다 — 뗄 때 한 번만 되돌린다
  const latest = useRef(found)
  latest.current = found
  useEffect(() => () => { for (const l of latest.current) restoreLeaf(l) }, [])
  useFrame(() => {
    const t = progress(door, clip)
    const eased = t * t * (3 - 2 * t)
    for (const l of found) poseLeaf(l, leafPose(l.box, span.middle, door.yaw, clip.kind, eased))
    if (passage.current) passage.current.visible = t > 0
  })
  return (
    <group ref={passage} position={span.at} rotation={[0, door.yaw, 0]} visible={false}>
      <mesh>
        <planeGeometry args={[span.width, span.height]} />
        <meshBasicMaterial color={PASSAGE} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * 문 하나를 누가 돌리는가 — `bdsp` 구운 BDSP 문짝 · `ours` 우리 문짝(`Door`) · `null` 아무도(원작 소품이 제 클립으로 돈다).
 *
 * ⚠️ **BDSP 위에서는 우리 문짝을 안 세운다.** 우리 문짝은 갈색 문틀 · 검은 통로 판을 통째로 세우는 것이라, 구운 문짝을 못 찾은
 * 문(문짝이 문 칸에서 `LEAF_REACH` 밖)에 세우면 BDSP 벽 앞에 상자 문이 하나 더 선다. 그 문은 안 움직이고 워프만 걸린다
 *
 * @param found 그 문 칸 둘레에서 찾은 구운 문짝 수 (`bdspDoorLeaves`)
 * @param bdsp BDSP 층이 서서 원작 그림을 숨겼는가
 */
export function pickDoor(
  found: number, model: number, anims: PropAnimsFile | null, bdsp: boolean,
): 'bdsp' | 'ours' | null {
  if (found > 0) return 'bdsp'
  if (bdsp) return null
  if (DOOR_KIND[model] !== undefined && anims?.props[String(model)] !== undefined) return null
  return 'ours'
}

/**
 * 배치가 **없는** 문 자리에만 우리 문짝을 세운다.
 *
 * ⚠️ **원작 문짝이 있으면 그것이 돈다.** 소품 배치가 있는 자리는
 * `ChunkModels`가 세운 그 메시를 `AnimatedProp`이 원작 클립(`bm_anime`)으로
 * 직접 돌린다 — 여기서 또 세우면 문이 두 겹이 된다. 남는 것은 `propModelAt`이
 * 문 모델을 못 찾는 자리뿐이고, 거기서는 세울 원작 메시가 아예 없다.
 *
 * ⚠️ **BDSP가 선 자리는 구운 문짝이 먼저다** (`BdspDoor`). 원작 소품이 숨어 있으므로 원작 문짝 클립은 안 돈다 (`pickDoor`)
 */
export function DoorAnimations({ grid, bdsp }: {
  grid: MapGrid
  /** BDSP 층이 서서 원작 그림을 숨겼는가 (`MapStreamer`의 `bdspDraws`) — 그 위에는 우리 문틀을 안 세운다 */
  bdsp: boolean
}) {
  // ⚠️ **셀렉터 안에서 배열을 만들면 안 된다.** zustand 5는 `useSyncExternalStore`에
  // `Object.is`로만 견주므로 `Object.values`가 매번 새 배열을 돌려주면 스냅숏이
  // 늘 바뀐 것으로 보인다 — 무한 렌더로 `<Canvas>`가 통째로 죽어서 필드 화면이
  // 한 색으로 남았다. 바뀌지 않는 표를 받아 놓고 여기서 편다
  const table = useDoorVisualStore((state) => state.doors)
  const doors = useMemo(() => Object.values(table), [table])
  const [anims, setAnims] = useState<PropAnimsFile | null>(null)
  useEffect(() => {
    let alive = true
    void loadPropAnims().then((got) => {
      if (alive) setAnims(got)
    })
    return () => {
      alive = false
    }
  }, [])
  return (
    <group>
      {doors.map((door) => {
        const model = grid.propModelAt(door.x, door.z)
        const y = grid.heightAtWorld(door.x + 0.5, door.z + 0.5, 0) ?? 0
        // BDSP가 서면 구운 문짝이 그 자리에 있다 — 원작 소품은 숨었으므로 그 문짝을 원작 클립으로 돌린다
        const found = bdspDoorLeaves(door.x, door.z, y)
        const pick = pickDoor(found.length, model, anims, bdsp)
        if (pick === 'bdsp') return <BdspDoor key={door.tag} door={door} clip={doorClip(model, anims)} found={found} />
        if (pick === 'ours') return <Door key={door.tag} door={door} clip={doorClip(model, anims)} y={y} />
        return null
      })}
    </group>
  )
}
