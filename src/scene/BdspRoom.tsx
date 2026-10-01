// 실내를 **BDSP 방**으로 세운다 (docs/orders/VISUAL_20260929.md §5)
//
// 원작 실내는 저폴리 상자에 작은 그림을 입힌 것이라 가까이서 보면 가구가 판때기다. BDSP는 같은 방을 입체로 다시 지었고
// (`Environments/prefab_map` — 225벌이 우리 맵 이름과 짝이 맞는다), 방 이름이 원작 내부 맵 이름과 같다(`C01R0101`).
//
// ⚠️ **좌표는 대개 옮기지 않는다.** BDSP 방은 원작 칸 좌표 그대로 지어져 있다 — 방송국 1층(`c01r0101`)의 사람 셋과 워프 셋이
// 원작과 같은 칸에 서고(`PlaceData_C01R0101` · `MapWarp_C01R0101`), 바닥이 x 1~20 · z 3~13으로 우리 칸 경계와 같다.
// 그래서 행렬 원점에 그대로 놓는다. 충돌 · 높이 · 워프 · 사람은 여전히 원작 자료가 쥔다 — 이 층은 그림만이다.
// 통째로 칸 단위만큼 밀려 지어진 방만 옮긴다(`placementOf`).
//
// ⚠️ **천장은 1인칭에서만 보인다.** BDSP는 부감 게임이라 방에 천장이 덮여 있고(`Ceil*`), 3인칭 카메라는 그 위에 있다.
// 부감이 안 보여 준 자리(남쪽 벽 · 문간 · 천장 없는 홀)는 그 방의 재질로 메운다(`roomShell`).
//
// ⚠️ **방이 없는 맵은 원작 그림 그대로다.** 짝은 이름이 먼저고, 없으면 같은 원작 방 모양(행렬)을 쓰는 다른 맵의 방을 빌린다 —
// 포켓몬센터 · 상점은 BDSP에 잔모래마을 것 한 벌씩뿐이고(`t02pc0101` · `t02fs0101`) 원작도 방 모양을 돌려쓴다
//
// ⚠️ **움직이는 장치는 원작 쪽이 그린다** (`FeatureProps` · `movingProps`). BDSP 체육관에는 승강판 · 톱니 · 물바닥이 정적 메시로
// 구워져 있어서(애니메이션 0개) 그대로 두면 굳은 BDSP 장치 위에서 원작 장치가 따로 움직였다. 원작 장치가 그 맵에 서면 BDSP의 그
// 부분만 숨긴다(`deviceMaterials`)
import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, BufferAttribute, BufferGeometry, Mesh, Vector3, type Group, type Material, type Object3D } from 'three'
import { assets } from '../data/providers/assetProvider'
import { firstPersonView } from '../engine/actor/camera'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { mapById, warpsOf, world } from '../engine/map/world'
import { liftForMap } from '../engine/world/platformLift'
import { PASTORIA_GYM_MAP } from '../engine/world/pastoriaGym'
import { sunyshoreRoomOf } from '../engine/world/sunyshoreGym'
import { disposeTree } from './disposeTree'
import { useBdspMark } from './bdspReady'
import { liveWater } from './BdspField'
import { holdBdspDoors } from './DoorAnimations'
import { holdBdspSigns } from './ObjectProps'
import { shellRoom } from './roomShell'

const loader = new GLTFLoader()

/** 구워 둔 방 이름들 (`models/room/index.json`). 없는 설치본이면 빈 목록 — 그때는 다들 원작 그림이다 */
let index: Promise<ReadonlySet<string>> | null = null
function roomIndex(): Promise<ReadonlySet<string>> {
  index ??= assets().text('models/room/index.json')
    .then((t) => new Set((JSON.parse(t) as { rooms?: string[] }).rooms ?? []))
    .catch(() => new Set<string>())
  return index
}

/**
 * **원작 방과 생김이 다른** BDSP 방 — 이름은 짝이 맞지만 BDSP가 체육관을 다시 지어서 원작 칸 위에 얹으면 어긋난다. 이 방들은
 * 원작 그림으로 그린다(장치도 원작 쪽이 움직인다).
 *
 * 실측 (`models/room/*.glb` ↔ 원작 이벤트 자료):
 * · `c02gym0101` 운하 — 층 바닥이 y 0 · 21 · 42 · 63이다. 원작은 10칸 간격(10 · 20 · 30 · `CANALAVE_FLOOR_HEIGHT`)이고 관장이 30에
 *   선다 — 2층부터 발밑이 비고 판 스물넷이 허공을 오간다
 * · `c04gym0101` 영원 — BDSP는 입구 방(x 3~14 · z −1~12)과 꽃밭(`c04gym0102`)을 따로 지었다. 원작은 한 방이라 입구 워프 (11, 27)와
 *   시계 한가운데 (11, 13)가 BDSP 바닥 밖이다
 * · `c07gym0101` 장막 — 입구 매트가 z 25.7인데 원작 워프는 z 30이고, 바닥이 z 26에서 끝나 원작 사람 (13, 29)가 바닥 밖에 선다.
 *   BDSP 타이어 열(바닥에 누운 것)과 원작 타이어 더미 열하나는 (8, 10) 한 곳만 겹친다
 * · `c05gym0101` · `c05gym0104` 연고 체육관 입구 · 넷째 방 — BDSP는 두 이름에 같은 한 방(바닥 x 1~18 · z 0~23, 문 매트
 *   (9, 22))을 구웠다. 원작 입구 방은 바깥 문이 (4, 8)이고 넷째 방은 (4, 13)으로 돌아간다 — 문만 x 5 · z 14칸 어긋난다
 * · `c01r0601` GTS — BDSP 문 매트는 (10, 15)인데 원작 문은 (13, 18)이다. 방을 (3, 3) 옮겨도 원작 사람 (24, 7) · (25, 12) ·
 *   (3, 9) · (3, 13)이 바닥(옮긴 뒤 x 4~23) 밖이다 — 원작 방이 더 넓다(행렬 205 건물이 x 26.5까지)
 * · `c07r0101` 게임코너(맵 136) — BDSP는 게임코너를 없앴고 이 이름에 **옷가게**를 지었다(옷걸이 · 마네킹 · 매대). 칸은 맞지만
 *   슬롯 · 코인 교환대가 하나도 없다 (PARITY §7.6 — 슬롯은 돈다)
 */
export const MISFIT_ROOMS: ReadonlySet<string> = new Set([
  'c02gym0101', 'c04gym0101', 'c07gym0101', 'c05gym0101', 'c05gym0104', 'c01r0601', 'c07r0101',
])

/**
 * **칸 단위로 통째 밀려 지어진 방** — 그만큼 옮겨 놓는다 (칸, [x, z]). 잰 법: 바깥으로 나가는 문 워프 칸 한가운데 ↔ 같은 x의
 * 문 매트(`M_C_001_Mat_*`, 바닥에 누운 것) z 한가운데. 맞는 방은 매트가 칸 한가운데보다 0.21 남쪽이다(`t01r0301` 8.71 ↔ 문
 * (4, 8) · `c07r0201` 12.71 ↔ (10, 12) — 방 83벌이 같다).
 * · `c04r0201` 갤럭시단 빌딩 1층(맵 72 · 같은 행렬의 572) — 매트 z 12.71 ↔ 문 (11, 15) 15.5: −2.79 = −3.00 − (−0.21). 계단
 *   (`Stair_01` z 2.95~4.79)도 원작 계단 워프 (14, 6)과 같은 3칸이다
 */
const ROOM_PLACEMENT: Readonly<Record<string, readonly [number, number]>> = { c04r0201: [0, 3] }

/** 그 방을 놓을 자리 (칸) — 대개 원점이다 */
export function placementOf(room: string): { x: number, z: number } {
  const p = ROOM_PLACEMENT[room]
  return p ? { x: p[0], z: p[1] } : { x: 0, z: 0 }
}

/** 이 맵이 쓸 방. 이름이 먼저 · 없으면 같은 행렬의 다른 맵 방 · 둘 다 없으면 `null`. 생김이 다른 방(`MISFIT_ROOMS`)은 안 쓴다 */
export function roomFor(mapId: number, rooms: ReadonlySet<string>): string | null {
  const here = mapById(mapId)
  if (!here || here.matrix === 0) return null
  const fits = (name: string): boolean => rooms.has(name) && !MISFIT_ROOMS.has(name)
  const own = here.name.toLowerCase()
  if (rooms.has(own)) return fits(own) ? own : null
  for (const m of world.maps ?? []) {
    if (m.matrix !== here.matrix) continue
    const name = m.name.toLowerCase()
    if (fits(name)) return name
  }
  return null
}

/**
 * 이 맵에서 원작 장치(`movingProps`의 `featureProps`)가 **실제로 서는** BDSP 장치 재질. 없으면 `null` — 그대로 둔다.
 *
 * 움직이는 부분만이다 — 틀 · 단추는 원작 쪽이 따로 안 그리므로 BDSP 것이 남아야 한다(들판 체육관 단추 `Button_0x` ·
 * `SwitchFrame`은 둔다). 실측 자리:
 * · 승강판(`platformLift` — 강철섬 B1F · B2F · B3F, 사천왕 방 앞 다섯, 챔피언 방): BDSP `…_Elevator_01`이 원작 시작 칸에 판 크기로
 *   선다(사천왕 방 앞 x 3.02~5.98 · z 11.02~12.98 ↔ 원작 (3, 11) · 챔피언 방 (7.02~9.98, 8.02~9.98) ↔ (7, 8))
 * · 들판 물바닥(`PASTORIA_GYM_MAP`): BDSP `SeaWater_03`이 y 4 한 장(x 1~26 · z 2~40)이다 — 원작 높이판 상자(1, 2, 25, 38)와 같은
 *   자리이고, 높이는 원작 세 단(0 · 2 · 4) 중 가장 높은 단에 굳어 있다
 * · 물가 톱니(`sunyshoreRoomOf`): `GearCorner_01`이 톱니, `Switch_01`이 톱니 위 길이다 — 1번 방 톱니 셋의 한가운데가
 *   (3.5, 8.5) · (8.5, 8.5) · (13.5, 8.5)로 원작 `SUNYSHORE_GEARS` + `SUNYSHORE_PROP_OFFSET`과 같다
 */
export function deviceMaterials(mapId: number): RegExp | null {
  if (liftForMap(mapId) !== null) return /_Elevator_\d/
  if (mapId === PASTORIA_GYM_MAP) return /_SeaWater_\d/
  if (sunyshoreRoomOf(mapId) !== null) return /_(GearCorner|Switch)_\d/
  return null
}

/** 원작 장치가 대신 그리는 BDSP 장치를 숨긴다. 숨긴 메시들을 돌려준다 — 맵이 바뀌면 되살릴 몫이다 */
export function hideDevices(root: Object3D, mapId: number): Mesh[] {
  const re = deviceMaterials(mapId)
  const out: Mesh[] = []
  if (!re) return out
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!mats.some((m) => re.test(m.name))) return
    o.visible = false
    out.push(o)
  })
  return out
}

/** 지금 맵의 방 이름 — 목차가 오기 전과 방이 없는 맵은 `null` */
export function useBdspRoom(mapId: number): string | null {
  const [rooms, setRooms] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let alive = true
    void roomIndex().then((r) => { if (alive) setRooms(r) })
    return () => { alive = false }
  }, [])
  return rooms ? roomFor(mapId, rooms) : null
}

/**
 * 사천왕 방문 그림 번호 (`OBJ_EVENT_GFX_ELITE_FOUR_ROOM_DOOR` — `generated/object_events_gfx.txt` 210째 줄, 0부터 209)
 */
export const ELITE_FOUR_DOOR_GFX = 209

/** 사천왕 방 넷 (맵 177 · 179 · 181 · 183 — 나무 · 대지 · 불꽃 · 사념) */
const ELITE_FOUR_ROOM = /^c10r010[3579]$/

/**
 * **사천왕 방문 — BDSP 문짝을 원작 문 객체에 매단다.** 원작은 방문 둘이 객체다(`LOCALID_ENTRANCE_DOOR` (8, 12) ·
 * `LOCALID_EXIT_DOOR` (8, 2), `FLAG_HIDE_POKEMON_LEAGUE_*_DOOR`) — 들어오면 뒷문이 닫히고 이기면 앞문이 열린다(객체가 사라진다).
 * BDSP는 두 문짝을 **닫힌 채 한 조각**(`M_D_047_DoorInner_01`, z 2.40~2.46 · 12.40~12.46)으로 구웠고, 원작 문 객체는 BDSP 위에서
 * 안 선다(`ObjectProps`의 `BDSP_BAKED_KINDS`) — 그대로 두면 이긴 뒤에도 앞문이 닫힌 채 그 속으로 걸어 나갔다.
 *
 * 그래서 문짝을 z로 둘로 갈라 각자 그 칸의 문 객체가 서 있을 때만 보인다(`eliteDoorShown`). 갈라 둔 조각은 `holdBdspDoors`가
 * 문짝 하나씩으로 잡는다
 */
export function splitEliteFourDoors(root: Object3D, room: string): { mesh: Mesh, x: number, z: number }[] {
  if (!ELITE_FOUR_ROOM.test(room)) return []
  const found: Mesh[] = []
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (mats.length === 1 && /_DoorInner_\d/.test(mats[0]!.name)) found.push(o)
  })
  const out: { mesh: Mesh, x: number, z: number }[] = []
  for (const o of found) {
    const g = (o.geometry as BufferGeometry).index ? (o.geometry as BufferGeometry).toNonIndexed() : o.geometry as BufferGeometry
    const pos = g.getAttribute('position')
    g.computeBoundingBox()
    const mid = (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2
    const halves: [number[], number[]] = [[], []]
    for (let i = 0; i + 2 < pos.count; i += 3) {
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
      halves[cz < mid ? 0 : 1].push(i)
    }
    if (halves[0].length === 0 || halves[1].length === 0) continue
    const parent = o.parent
    if (!parent) continue
    for (const tris of halves) {
      const piece = new BufferGeometry()
      for (const [key, attr] of Object.entries(g.attributes)) {
        const a = attr as BufferAttribute
        const arr = new (a.array.constructor as new (n: number) => Float32Array)(tris.length * 3 * a.itemSize)
        for (const [k, i] of tris.entries()) {
          for (let v = 0; v < 3 * a.itemSize; v++) arr[k * 3 * a.itemSize + v] = a.array[i * a.itemSize + v]!
        }
        piece.setAttribute(key, new BufferAttribute(arr, a.itemSize, a.normalized))
      }
      const mesh = new Mesh(piece, o.material)
      mesh.name = `${o.name} (${String(out.length)})`
      mesh.position.copy(o.position); mesh.quaternion.copy(o.quaternion); mesh.scale.copy(o.scale)
      mesh.receiveShadow = o.receiveShadow; mesh.castShadow = o.castShadow
      parent.add(mesh)
      mesh.updateMatrixWorld(true)
      const c = new Box3().setFromObject(mesh).getCenter(new Vector3())
      // 방 그룹 안 좌표 — 놓을 자리(`placementOf`)는 아직 안 걸었다
      out.push({ mesh, x: Math.floor(c.x), z: Math.floor(c.z) })
    }
    parent.remove(o)
    if (g !== o.geometry) g.dispose()
    o.geometry.dispose()
  }
  return out
}

/** 그 칸에 사천왕 방문 객체가 서 있는가 — 깃발로 숨은 문은 배치표에서 아예 안 선다 */
export function eliteDoorShown(list: readonly NpcActor[], x: number, z: number): boolean {
  return list.some((a) => a.gfx === ELITE_FOUR_DOOR_GFX && a.x === x && a.z === z && a.visible)
}

export function BdspRoom({ name, mapId }: { name: string, mapId: number }) {
  const [scene, setScene] = useState<Group | null>(null)
  const [failed, setFailed] = useState(false)
  /** 렌즈마다 켜고 끌 것 (`shellRoom`) · 문 객체에 매단 사천왕 방문 */
  const [lens, setLens] = useState<{
    first: readonly Object3D[], hanging: readonly Object3D[], shafts: readonly Object3D[]
    doors: readonly { mesh: Mesh, x: number, z: number }[]
  }>({ first: [], hanging: [], shafts: [], doors: [] })
  useBdspMark(name, scene !== null, failed)

  useEffect(() => {
    let alive = true
    const path = `models/room/${name}.glb`
    const provider = assets()
    let held: Group | null = null
    let release: (() => void)[] = []
    provider.objectUrl(path)
      .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
      .then((gltf) => {
        if (!alive) { disposeTree(gltf.scene); return }
        held = gltf.scene
        hideDevices(gltf.scene, mapId)
        liveWater(gltf.scene)
        const at = placementOf(name)
        const doors = splitEliteFourDoors(gltf.scene, name)
          .map((d) => ({ mesh: d.mesh, x: d.x + at.x, z: d.z + at.z }))
        // 껍데기는 방 그룹 안 좌표로 짓는다 — 워프도 그 좌표로 옮겨 넘긴다
        const shell = shellRoom(gltf.scene, warpsOf(mapId).map((w) => ({ x: w.x - at.x, z: w.z - at.z })))
        gltf.scene.position.set(at.x, 0, at.z)
        // 문짝 · 간판 자리는 세계 좌표로 잡는다 — 놓을 자리를 건 뒤에
        release = [holdBdspDoors(gltf.scene), holdBdspSigns(gltf.scene)]
        // 문빛(`EntranceLight`)은 줄기이면서 바닥 남쪽 끝 너머에 매달려 있다 — 어느 렌즈에서도 안 그린다
        const both = shell.shafts.filter((s) => shell.hanging.includes(s))
        for (const o of both) o.visible = false
        setLens({
          first: shell.first,
          hanging: shell.hanging.filter((o) => !both.includes(o)),
          shafts: shell.shafts.filter((o) => !both.includes(o)),
          doors,
        })
        setScene(gltf.scene)
      })
      .catch((e: unknown) => {
        console.error(`방 ${name}을 못 세웠다`, e)
        if (alive) setFailed(true)
      })
    // ⚠️ **떼면 버린다** (`disposeTree`)
    return () => {
      alive = false
      for (const r of release) r()
      if (held) disposeTree(held)
    }
  }, [name, mapId])

  useFrame(() => {
    // ⚠️ **눈이 실제로 어디 있나로 가른다** (`firstPersonView`) — 설정 값을 보면 컷신 동안 3인칭 카메라가 천장에 막힌다
    const first = firstPersonView()
    for (const c of lens.first) c.visible = first
    // 바닥 남쪽 끝 너머 문 · 문턱 · 문빛은 부감에서 방 앞 허공에 매달린다
    for (const c of lens.hanging) c.visible = first
    // 빛 줄기는 눈높이에서 사람 모양 흰 덩이로 읽힌다
    for (const c of lens.shafts) c.visible = !first
    for (const d of lens.doors) d.mesh.visible = eliteDoorShown(npcActors.list, d.x, d.z)
  })

  return scene ? <primitive object={scene} /> : null
}
