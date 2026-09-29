// 야외를 **BDSP 지역**으로 세운다 (docs/orders/VISUAL_20260929.md §2)
//
// 원작 야외는 저폴리 지형에 64px 안팎의 그림이라 가까이서 보면 벽 · 나무 · 언덕이 미완성으로 읽힌다(배포판에서 짚였다). BDSP는
// 같은 신오를 입체로 다시 지었다 — `Environments/fields`의 지역 13벌 + 대습지(`models/field/*.glb` · `import/bdsp/field.ts`).
//
// ⚠️ **좌표를 옮기지 않는다.** BDSP 야외는 원작 월드 좌표 그대로다(x만 뒤집혀 있고 변환기가 되돌린다) — 떡잎마을 집이 같은 칸에
// 서고 땅 높이도 같다(`field.ts` 머리말). 충돌 · 높이 · 워프 · 사람은 원작 자료가 그대로 쥔다 — 이 층은 그림만이다.
//
// ⚠️ **지역 통째로 받는다.** 한 지역이 260칸 사방이라 청크처럼 쪼개지 않는다. 플레이어 둘레(`REACH`)에 상자가 걸리는 지역만 세운다
import { useEffect, useState } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AdditiveBlending, Mesh, type Group, type Material } from 'three'
import { assets } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'

const loader = new GLTFLoader()

/** 플레이어 둘레 이만큼(칸) 안에 상자가 걸리는 지역을 세운다 */
const REACH = 80

export interface FieldEntry { name: string, box: readonly [number, number, number, number] }

let index: Promise<readonly FieldEntry[]> | null = null
/** 구워 둔 지역들 (`models/field/index.json`). 없는 설치본이면 빈 목록 — 그때는 원작 그림 그대로다 */
export function fieldIndex(): Promise<readonly FieldEntry[]> {
  index ??= assets().text('models/field/index.json')
    // ⚠️ **대습지(`safari`)는 안 세운다** — 상자가 (22~104, 24~128)라 바깥 좌표가 아니다(제 행렬의 좌표로 보인다). 짝을 재기 전까지 뺀다
    .then((t) => ((JSON.parse(t) as { fields?: FieldEntry[] }).fields ?? []).filter((f) => /^area\d+$/.test(f.name)))
    .catch(() => [])
  return index
}

/** 이 자리(칸)를 덮는 지역이 있나 */
export function fieldCovers(fields: readonly FieldEntry[], x: number, z: number, pad = 0): boolean {
  return fields.some((f) => x >= f.box[0] - pad && x <= f.box[2] + pad && z >= f.box[1] - pad && z <= f.box[3] + pad)
}

/**
 * 지금 세울 지역 이름들 — 바깥(행렬 0)에서 플레이어 둘레에 걸리는 것. 반 초마다 다시 본다(걷는 동안 지역 경계를 넘는다)
 */
export function useBdspFields(outdoor: boolean): { fields: readonly FieldEntry[], near: readonly string[] } {
  const [fields, setFields] = useState<readonly FieldEntry[]>([])
  const [near, setNear] = useState<readonly string[]>([])
  useEffect(() => {
    let alive = true
    void fieldIndex().then((f) => { if (alive) setFields(f) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!outdoor || fields.length === 0) { setNear([]); return }
    const pick = (): void => {
      const p = worldState.player.position
      const want = fields.filter((f) => fieldCovers([f], p.x, p.z, REACH)).map((f) => f.name).sort()
      setNear((was) => (was.join() === want.join() ? was : want))
    }
    pick()
    const id = setInterval(pick, 500)
    return () => { clearInterval(id) }
  }, [outdoor, fields])
  return { fields, near }
}

/** 창빛 · 조명 줄기 — 더해지는 빛으로 (`BdspRoom`과 같은 사정) */
const isLightShaft = (m: Material): boolean => /_(Window)?Light_\d/.test(m.name)

function FieldArea({ name }: { name: string }) {
  const [scene, setScene] = useState<Group | null>(null)
  useEffect(() => {
    let alive = true
    const path = `models/field/${name}.glb`
    const provider = assets()
    provider.objectUrl(path)
      .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
      .then((gltf) => {
        if (!alive) return
        gltf.scene.traverse((o) => {
          if (!(o instanceof Mesh)) return
          o.receiveShadow = true
          o.castShadow = true
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of mats) {
            if (!isLightShaft(m)) continue
            m.blending = AdditiveBlending
            m.transparent = true
            m.depthWrite = false
            m.opacity = 0.35
            o.castShadow = false
          }
        })
        setScene(gltf.scene)
      })
      .catch((e: unknown) => { console.error(`지역 ${name}을 못 세웠다`, e) })
    return () => { alive = false }
  }, [name])
  return scene ? <primitive object={scene} /> : null
}

/** 걷는 동안 지역이 바뀌면 그 자리에서 갈아 끼운다 — 목록이 곧 세울 것이다 (`useBdspFields`) */
export function BdspField({ near }: { near: readonly string[] }) {
  return <>{near.map((n) => <FieldArea key={n} name={n} />)}</>
}
