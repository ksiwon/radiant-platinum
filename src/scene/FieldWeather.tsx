import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  type BufferAttribute, DataTexture, Group, InstancedMesh, LinearFilter, Object3D, PointLight, RGBAFormat,
} from 'three'
import { worldState } from '../state/worldState'
import { lookForward } from '../engine/input/mouse'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'
import type { Building } from '../engine/map/zone'
import { loadPropMesh, type ChunkMesh } from './chunkMesh'
import {
  type FieldWeatherKind, weatherCapacity, weatherCount, weatherLayout, weatherProfile, wrapAround,
} from './weatherVisual'

/**
 * 입자 하나. 자리는 **단위 값**으로 둔다 — 가로·세로는 −1~1, 높이는 0~1.
 * 상자 크기는 시점마다 달라서(`weatherLayout`) 그릴 때 곱한다
 */
interface Particle {
  x: number
  y: number
  z: number
  phase: number
  speed: number
  size: number
}

function unit(i: number, salt: number): number {
  const x = Math.sin((i + 1) * (12.9898 + salt * 31.7)) * 43758.5453
  return x - Math.floor(x)
}

function weatherParticle(i: number): Particle {
  return {
    x: unit(i, 1) * 2 - 1,
    y: unit(i, 2),
    z: unit(i, 3) * 2 - 1,
    phase: unit(i, 4) * Math.PI * 2,
    speed: 0.72 + unit(i, 5) * 0.62,
    size: 0.65 + unit(i, 6) * 0.7,
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

// ── 지붕 밑 ──────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ **관문 안에 비가 내렸다** (213번도로 관문 문간 1인칭). BDSP 관문은 실내까지 지어져 있고 문이 뚫려 있어서 문간에서 안이
// 들여다보이는데, 날씨 상자는 지붕을 몰라 그 안에도 빗줄기를 세웠다.
//
// 지붕은 **원작 건물 소품**이 말한다 (`grid.meta.buildings` — 집·관문은 청크 모델이 아니라 따로 놓인 소품이다). 그 소품의
// 누운 면이 덮은 칸이 지붕 밑이다. BDSP 건물은 원작 칸 좌표 그대로 서므로 이 칸이 그 자리다. 실측 —
//
//     213번도로 관문 (소품 40 @ 643,813)  원작 지붕 칸 x640~645 · z811~814, 높이 밑동+3.7~3.9
//                                        BDSP 관문 x639.5~646.5 · z810.1~815.9, 높이 밑동+4 (`area013` `BarrierGate_01`)
//     연고시티 관문 (소품 39 @ 459,681)     BDSP x456.1~461.9 · z676.4~684.6, 높이 밑동+4
//
// 원작 지붕 판은 벽 **안쪽**에 걸리고 BDSP 실내는 벽까지 간다 — 그 한 칸을 이웃 여덟 칸으로 번져 메운다(`roofCells`).
//
// ⚠️ **연기·폭포는 지붕이 아니다.** 소품 상자로 재면 하드마운틴 화산 연기(소품 585)가 16.7×15.8칸을 22칸 높이까지 덮어
// 화산재가 통째로 빠진다. 그 판은 45°쯤 눕힌 판(기울기 칸당 1.45)이라 **바닥을 고르는 잣대**(`plates`의 0.7)로 거르면
// 한 칸도 안 남는다. 폭포(305~308)·문짝은 선 판이라 애초에 안 걸린다

/** 지붕으로 칠 만큼 누운 면 — 바닥을 고르는 잣대와 같다 (`plates.FLOOR_NORMAL`) */
const ROOF_NORMAL = 0.7
/**
 * 밑동에서 이만큼은 높아야 지붕이다(칸). 1인칭 눈이 1.38이다 (`actor/camera`의 `EYE_HEIGHT`).
 *
 * 실측(날씨 맵 소품 40종): 관문 3.7~3.9 · 집 3.2~5.0 · 신전 6.0은 넘고, 컨테이너 1.8~1.9 · 수영장 0.41 · 용암 0 · 바닥 판
 * 0.06은 안 넘는다 — 사람이 그 밑에 설 수 없는 것들이다
 */
const ROOF_MIN = 2

/** 지붕 칸 열쇠 — **월드** 칸이다. `plates.cellKey`는 청크 로컬(−128~384)이라 오버월드 960칸에서 겹친다 */
const roofKey = (tx: number, tz: number): number => tx * 4096 + tz

/** 소품 하나의 자리 — `Building`에서 쓰는 칸만 */
type RoofSpot = Pick<Building, 'x' | 'y' | 'z'> & Partial<Pick<Building, 'rot' | 'scale'>>

/**
 * 칸마다 **지붕 높이**(월드 y). 지붕 밑이 아닌 칸은 없다.
 *
 * 소품을 놓는 변환은 `ChunkModels`가 나무 비킬 상자를 찍는 것과 같다 — Y축 회전 · 크기. 오버월드 배치는 실측으로 501개 전부
 * 회전 0 · 크기 1이다
 */
export function roofCells(spots: readonly { at: RoofSpot, mesh: ChunkMesh }[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const { at, mesh } of spots) {
    const pos = (mesh.geometry.getAttribute('position') as BufferAttribute | undefined)?.array
    const index = mesh.geometry.getIndex()?.array
    if (!pos || !index) continue
    const a = at.rot?.[1] ?? 0
    const [sx, sy, sz] = [at.scale?.[0] ?? 1, at.scale?.[1] ?? 1, at.scale?.[2] ?? 1]
    const cos = Math.cos(a), sin = Math.sin(a)
    const place = (i: number): [number, number, number] => {
      const px = pos[i * 3]! * sx, py = pos[i * 3 + 1]! * sy, pz = pos[i * 3 + 2]! * sz
      return [at.x + px * cos + pz * sin, at.y + py, at.z - px * sin + pz * cos]
    }
    const own = new Map<number, number>()
    for (let t = 0; t + 2 < index.length; t += 3) {
      const [ax, ay, az] = place(index[t]!)
      const [bx, by, bz] = place(index[t + 1]!)
      const [cx, cy, cz] = place(index[t + 2]!)
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9 || Math.abs(ny) / len < ROOF_NORMAL) continue
      const area = ux * vz - vx * uz
      if (Math.abs(area) < 1e-9) continue
      // 칸 한가운데가 그 삼각형 안에 드는 칸만 — `plates`가 바닥 칸을 찍는 것과 같은 잣대다
      for (let tz = Math.floor(Math.min(az, bz, cz)); tz <= Math.floor(Math.max(az, bz, cz)); tz++) {
        for (let tx = Math.floor(Math.min(ax, bx, cx)); tx <= Math.floor(Math.max(ax, bx, cx)); tx++) {
          const px = tx + 0.5 - ax, pz = tz + 0.5 - az
          const w1 = (px * vz - vx * pz) / area
          const w2 = (ux * pz - px * uz) / area
          if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
          const y = ay + w1 * uy + w2 * vy
          if (y - at.y < ROOF_MIN) continue
          const key = roofKey(tx, tz)
          if (y > (own.get(key) ?? -Infinity)) own.set(key, y)
        }
      }
    }
    // 벽까지 한 칸 번진다 (머리말의 실측)
    for (const [key, y] of own) {
      const tx = Math.round(key / 4096), tz = key - tx * 4096
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = roofKey(tx + dx, tz + dz)
          if (y > (out.get(k) ?? -Infinity)) out.set(k, y)
        }
      }
    }
  }
  return out
}

/** 그 자리(월드)가 지붕 밑인가 */
export function underRoof(roofs: ReadonlyMap<number, number>, x: number, y: number, z: number): boolean {
  const top = roofs.get(roofKey(Math.floor(x), Math.floor(z)))
  return top !== undefined && y < top
}

/** 이 청크와 이웃 한 겹의 소품으로 지붕 칸을 잰다. 소품 메시는 `ChunkModels`와 같은 보관함을 쓴다 */
async function loadRoofs(grid: MapGrid, chunk: number): Promise<Map<number, number>> {
  const spots = grid.chunksAround(chunk, 1).flatMap((c) => grid.meta.buildings[String(c.i)] ?? [])
  const ids = [...new Set(spots.map((b) => b.model))]
  const loaded = await Promise.all(ids.map((id) =>
    loadPropMesh(id).then((mesh) => [id, mesh] as const).catch(() => null)))
  const meshes = new Map(loaded.filter((x) => x !== null))
  return roofCells(spots.flatMap((b) => {
    const mesh = meshes.get(b.model)
    return mesh ? [{ at: b, mesh }] : []
  }))
}

// ── 눈송이 ───────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ **정팔면체(반지름 0.075)였다.** 빛도 번짐도 없는 단색 마름모라 1인칭에서 카메라 앞을 지나면 흰 종잇조각이 됐다 —
// 선단시티 1인칭에서 한 송이가 60px 남짓이었다. 세로 화각 55°(`FIELD_FOV`)에 화면 800px이면 한가운데가 768px/라디안이라,
// 지름 0.135(0.15 × 0.9)가 1.5칸 앞이면 69px이다.
//
// 그래서 **카메라를 보는 둥근 판**으로 그린다 — 가장자리로 갈수록 투명해지는 판(`flakeAlpha`)이다. 반투명 절반 자리의
// 지름을 예전 팔면체에 맞춰(`FLAKE_WIDTH`) 3인칭에서 보던 무게는 그대로 두고, 가까운 송이는 **화면 크기를 묶는다**(`flakeNear`)

/**
 * 눈송이 판 한 변(칸). `flakeAlpha`가 반지름 0.6에서 0.5라, 반투명 절반 자리의 지름이 0.25 × 0.6 = **0.15** —
 * 예전 팔면체의 지름과 같다
 */
const FLAKE_WIDTH = 0.25

/** 판 한가운데에서 가장자리(r = 1)까지의 불투명도. 0.2 안은 꽉 차고 바깥으로 부드럽게 0이 된다 */
export function flakeAlpha(r: number): number {
  const t = Math.min(1, Math.max(0, (r - 0.2) / 0.8))
  return 1 - t * t * (3 - 2 * t)
}

/**
 * 이 거리(칸)보다 가까운 송이는 거리에 비례해 줄여 **화면 크기를 묶는다.**
 *
 * 3인칭 카메라가 주인공에서 8.94칸(뒤 8 · 위 4 — `actor/camera`의 `THIRD`)이라 그 곁 송이는 반투명 절반 지름이 11.6px이다.
 * 그 절반 거리에서 묶으면 1인칭에서 제일 큰 송이가 **그 두 배(23px)**를 안 넘는다
 */
const FLAKE_NEAR = Math.hypot(8, 4) / 2

/** 카메라에서 `distance`칸 떨어진 송이의 축척 */
export function flakeNear(distance: number): number {
  return Math.min(1, Math.max(0, distance) / FLAKE_NEAR)
}

/** 눈송이 그림. 흰 바탕에 알파만 `flakeAlpha`다 */
function flakeTexture(): DataTexture {
  const n = 32
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2)
      const o = (y * n + x) * 4
      data[o] = 255; data[o + 1] = 255; data[o + 2] = 255
      data[o + 3] = Math.round(flakeAlpha(r) * 255)
    }
  }
  const texture = new DataTexture(data, n, n, RGBAFormat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * 맵 헤더의 원작 날씨 번호를 플레이어 주변의 실제 3D 입자로 그린다.
 *
 * 1인칭이면 상자를 줄여 시선 앞으로 밀고 빗방울을 늘린다 (`FIRST_LAYOUT`).
 * 인스턴스는 두 시점 중 큰 쪽으로 잡아 두고 `mesh.count`로 줄인다 — 시점을
 * 바꿀 때마다 메시를 다시 만들지 않는다.
 *
 * 지붕 밑(`underRoof`)에 든 입자는 안 그린다 — 남은 것만 앞에서부터 채운다
 */
export function FieldWeather({ kind }: { kind: FieldWeatherKind }) {
  const profile = weatherProfile(kind)
  const root = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const flash = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const capacity = profile ? weatherCapacity(profile) : 0
  const particles = useMemo(
    () => Array.from({ length: capacity }, (_, i) => weatherParticle(i)),
    [capacity],
  )
  const flake = profile?.shape === 'flake'
  const flakeMap = useMemo(() => (flake ? flakeTexture() : null), [flake])
  useEffect(() => () => { flakeMap?.dispose() }, [flakeMap])
  /** 지금 둘레의 지붕 칸과 그것을 잰 자리 (격자 · 판 · 청크) */
  const roofs = useRef<ReadonlyMap<number, number>>(new Map())
  const roofAsked = useRef('')

  useFrame(({ clock, camera }) => {
    const view = worldState.camera.mode
    const { range, height, ahead, dropWidth, dropLength } = weatherLayout(view)
    const player = worldState.player.position
    // 1인칭은 상자 중심을 시선 앞으로 민다. 입자는 월드 격자에 고정이다 (`wrapAround`)
    const forward = lookForward(worldState.camera.yaw)
    const cx = view === 'first' ? player.x + forward.x * ahead : player.x
    const cz = view === 'first' ? player.z + forward.z * ahead : player.z
    const group = root.current
    if (group) group.position.set(cx, player.y, cz)

    // 청크를 넘어가면 둘레 지붕을 다시 잰다. 새 답이 올 때까지는 앞엣것을 쓴다 — 이웃 한 겹이 겹친다
    const grid = world.grid
    if (grid && profile) {
      const chunk = grid.chunkIndexAt(Math.floor(player.x), Math.floor(player.z))
      const ask = `${String(grid.meta.id)}/${String(grid.revision)}/${String(chunk)}`
      if (roofAsked.current !== ask) {
        roofAsked.current = ask
        void loadRoofs(grid, chunk).then((made) => { if (roofAsked.current === ask) roofs.current = made })
      }
    }

    const instanced = mesh.current
    if (instanced && profile) {
      const time = clock.elapsedTime
      const count = Math.min(weatherCount(profile, view), particles.length)
      const drop = profile.shape === 'drop'
      let shown = 0
      for (let i = 0; i < count; i++) {
        const p = particles[i]!
        const y = p.y * height
        const falling = profile.fall >= 0
          ? height - wrap(time * profile.fall * p.speed + (height - y), height)
          : wrap(y - time * profile.fall * p.speed, height)
        const wind = time * profile.drift * p.speed
        const swirl = profile.shape === 'flake' || profile.shape === 'orb'
          ? Math.sin(time * 1.7 + p.phase) * 1.35
          : 0
        const sway = Math.cos(time * 1.1 + p.phase) * (profile.shape === 'grain' ? 1.2 : 0.3)
        // 3인칭은 예전 그대로 플레이어에 붙은 상자다. 1인칭은 고개를 돌릴 때
        // 빗발이 같이 미끄러지지 않게 월드 좌표에서 접는다
        const x = view === 'first'
          ? wrapAround(p.x * range + wind + swirl, cx, range)
          : wrap(p.x * range + wind + swirl + range, range * 2) - range
        const z = view === 'first'
          ? wrapAround(p.z * range + sway, cz, range)
          : p.z * range + sway
        const wy = player.y + falling - 2
        if (underRoof(roofs.current, cx + x, wy, cz + z)) continue
        dummy.position.set(x, falling - 2, z)
        const size = p.size * (drop ? 1 : profile.shape === 'orb' ? 1.7 : 0.9)
        if (flake) {
          // 둥근 판이라 돌릴 것이 없다 — 늘 카메라를 본다
          dummy.quaternion.copy(camera.quaternion)
          const d = Math.hypot(cx + x - camera.position.x, wy - camera.position.y, cz + z - camera.position.z)
          dummy.scale.setScalar(size * flakeNear(d))
        } else {
          dummy.rotation.set(0, p.phase + time * 0.4, drop ? -0.17 : time + p.phase)
          if (drop) dummy.scale.set(size * dropWidth, size * dropLength, size * dropWidth)
          else dummy.scale.setScalar(size)
        }
        dummy.updateMatrix()
        instanced.setMatrixAt(shown++, dummy.matrix)
      }
      instanced.count = shown
      instanced.instanceMatrix.needsUpdate = true
    }

    const light = flash.current
    if (light) {
      const pulse = Math.sin(clock.elapsedTime * 0.73) * Math.sin(clock.elapsedTime * 2.31)
      light.intensity = kind === 'storm' && pulse > 0.985 ? 18 : 0
      light.position.set(0, 12, 0)
    }
  })

  if (!profile && kind !== 'storm') return null
  return (
    <group ref={root}>
      {profile && (
        <instancedMesh ref={mesh} args={[undefined, undefined, particles.length]} frustumCulled={false}>
          {profile.shape === 'drop' ? (
            <cylinderGeometry args={[0.012, 0.018, 0.82, 4]} />
          ) : profile.shape === 'flake' ? (
            <planeGeometry args={[FLAKE_WIDTH, FLAKE_WIDTH]} />
          ) : profile.shape === 'orb' ? (
            <sphereGeometry args={[0.075, 10, 8]} />
          ) : (
            <tetrahedronGeometry args={[0.055, 0]} />
          )}
          {/* 갈래가 바뀌면 재질을 새로 만든다 — 그림(`map`)이 생기고 없어지면 셰이더가 갈린다 */}
          <meshBasicMaterial
            key={profile.shape}
            color={profile.color}
            map={flakeMap}
            transparent
            opacity={profile.opacity}
            depthWrite={false}
            fog={false}
          />
        </instancedMesh>
      )}
      <pointLight ref={flash} color="#dce9ff" distance={70} decay={1.4} intensity={0} />
    </group>
  )
}
