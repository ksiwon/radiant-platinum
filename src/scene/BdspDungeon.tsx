// 던전을 **BDSP 던전**으로 세운다 (docs/orders/VISUAL_20260930.md §1)
//
// 호수 · 숲 · 동굴 · 탑은 원작이 제 행렬을 쓰는 맵이라 원작 그림이 그대로 섰고, 1인칭으로 돌아보면 합성 벽(갈색 상자)과 검은
// 하늘이 드러났다. BDSP는 같은 던전을 입체로 다시 지었다(`Environments/prefab_map/d##…` 138벌 · `models/dungeon/*.glb`).
//
// ⚠️ **좌표를 옮기지 않는다.** 방과 같다 — 원작 칸 좌표로 지어져 있어 행렬 원점에 그대로 놓는다(`d27r0101` 상자 −2~68 × 0~64).
// 짝도 방과 같은 규칙이다(`roomFor` — 이름 → 같은 행렬의 형제). 충돌 · 높이 · 워프 · 사람은 원작 자료가 쥔다 — 이 층은 그림만이다.
//
// ⚠️ **그림은 glb 밖에 있다.** 던전끼리 한 벌을 나눠 쓰므로(`tex/{해시}.png`) glb를 풀기 전에 그 주소를 설치본 주소로 잇는다
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager, Mesh, Vector3, type Group } from 'three'
import { assets } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { roomFor } from './BdspRoom'
import { bdspLights, type BdspLights } from './bdspLights'
import { disposeTree } from './disposeTree'
import { fieldFade, type FieldFade } from './fieldFade'

const ROOT = 'models/dungeon'

let index: Promise<ReadonlySet<string>> | null = null
/** 구워 둔 던전들 (`models/dungeon/index.json`). 없는 설치본이면 빈 목록 — 그때는 원작 그림 그대로다 */
function dungeonIndex(): Promise<ReadonlySet<string>> {
  index ??= assets().text(`${ROOT}/index.json`)
    .then((t) => new Set(((JSON.parse(t) as { dungeons?: { name: string }[] }).dungeons ?? []).map((d) => d.name)))
    .catch(() => new Set<string>())
  return index
}

/** 지금 맵의 던전 이름 — 목차가 오기 전과 던전이 없는 맵은 `null` */
export function useBdspDungeon(mapId: number): string | null {
  const [names, setNames] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let alive = true
    void dungeonIndex().then((n) => { if (alive) setNames(n) })
    return () => { alive = false }
  }, [])
  return names ? roomFor(mapId, names) : null
}

/**
 * 하늘이 트인 던전인가 — 원작 배틀 배경이 풀밭 ~ 눈이다 (`generated/battle_backgrounds.txt`: 0 PLAIN · 1 WATER · 2 CITY · 3 FOREST ·
 * 4 MOUNTAIN · 5 SNOW · 6~8 INDOORS · 9~11 CAVE).
 *
 * ⚠️ **헤더의 맵 갈래로는 못 가른다.** 호수 입구 · 영원의 숲 · 동굴이 다 같은 던전형(`mapType` 3)이라 하늘이 안 서서, BDSP로 세운
 * 호숫가 위가 검게 비었다. 배틀 배경은 원작이 그 자리의 바깥을 적어 둔 값이다 — 풀밭 ~ 눈으로 찍힌 던전은 호수 셋의 입구 ·
 * 영원의 숲 · 대습초원 · 꽃향기의 꽃밭 · 만월섬 · 신월섬 · 송별의 샘 · 자랑의 뒷마당 · 천관산 바깥 · 창기둥이다.
 *
 * 원작 그림이 서는 던전에는 안 쓴다 — 3인칭 부감용 판때기라 가장자리 너머에 하늘을 걸면 공중에 뜬 널판이 된다 (`MapStreamer`)
 */
export function openAir(header: { battleBg?: number } | null | undefined): boolean {
  const bg = header?.battleBg ?? -1
  return bg >= 0 && bg <= OPEN_AIR_LAST
}
/** `BACKGROUND_SNOW` — 바깥 배경의 끝 */
const OPEN_AIR_LAST = 5

/** glb 안 JSON이 가리키는 바깥 그림 주소들 */
export function imageUris(glb: ArrayBuffer): string[] {
  const view = new DataView(glb)
  const length = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, length))) as { images?: { uri?: string }[] }
  return (json.images ?? []).flatMap((i) => (i.uri === undefined ? [] : [i.uri]))
}

/** 주인공의 어느 높이를 겨누는가 — `PropFade`의 `AIM_HEIGHT`와 같다 */
const AIM = 1.2

export function BdspDungeon({ name }: { name: string }) {
  const [scene, setScene] = useState<Group | null>(null)
  const fade = useRef<FieldFade | null>(null)
  const lights = useRef<BdspLights | null>(null)
  const tick = useRef(0)
  const cam = useRef(new Vector3())
  const aim = useRef(new Vector3())
  useFrame(({ camera }) => {
    if (!fade.current || (tick.current++ % 3) !== 0) return
    lights.current?.update(worldState.time.gameHour)
    const p = worldState.player.position
    camera.getWorldPosition(cam.current)
    aim.current.set(p.x, p.y + AIM, p.z)
    fade.current.update(cam.current, aim.current, worldState.camera.mode !== 'first')
  })
  useEffect(() => {
    let alive = true
    const provider = assets()
    const held: string[] = []
    let built: Group | null = null
    const load = async (): Promise<Group> => {
      const glb = await provider.bytes(`${ROOT}/${name}.glb`)
      const urls = new Map<string, string>()
      for (const uri of new Set(imageUris(glb))) {
        const path = `${ROOT}/${uri}`
        held.push(path)
        urls.set(uri, await provider.objectUrl(path))
      }
      const manager = new LoadingManager()
      manager.setURLModifier((u) => urls.get(u) ?? u)
      const gltf = await new GLTFLoader(manager).parseAsync(glb, '')
      return gltf.scene
    }
    load()
      .then((root) => {
        if (!alive) { disposeTree(root); return }
        built = root
        root.traverse((o) => {
          if (!(o instanceof Mesh)) return
          o.receiveShadow = true
          o.castShadow = true
        })
        // ⚠️ **흐림이 먼저다** — `BdspField`와 같은 까닭이다
        fade.current = fieldFade(root)
        lights.current = bdspLights(root)
        lights.current.update(worldState.time.gameHour)
        setScene(root)
      })
      .catch((e: unknown) => { console.error(`던전 ${name}을 못 세웠다`, e) })
      .finally(() => { for (const p of held) provider.releaseObjectUrl(p) })
    // ⚠️ **떼면 버린다** (`disposeTree`) — 나눠 쓰는 그림도 던전마다 새로 풀어 올리므로 그 벌은 이 던전 몫이다
    return () => { alive = false; if (built) disposeTree(built) }
  }, [name])
  return scene ? <primitive object={scene} /> : null
}
