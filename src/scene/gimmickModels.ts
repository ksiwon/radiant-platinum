// 필드 기믹의 BDSP 모델을 받는다 (docs/orders/BATTLE_FX_20261004.md §8 · `engine/world/gimmicks`)
//
// 바위깨기 바위 · 풀베기 나무 · 괴력 바위 · 꿀나무 · 눈덩이. 다섯 벌 다 합쳐 415KB(구운 크기)라 한 번 받으면 놓지 않는다.
//
// ⚠️ **없으면 원작 그림으로 선다.** `gimmicks` 그룹을 안 구운 옛 설치본이다 — 받기가 **실패로 끝난 뒤에만** 원작 쪽을 세운다.
// 받는 동안은 아무것도 안 세운다: 원작 덩이를 먼저 올리면 같은 자리에서 모양이 한 번 바뀐다(`Ledges`의 준비 대기와 같은 까닭)
import { BufferGeometry, Mesh, type Material, type Object3D } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { assets } from '../data/providers/assetProvider'

const loader = new GLTFLoader()

/** 받는 중 · 받음 · 없음 */
type GimmickState = 'loading' | GLTF | 'missing'

const states = new Map<string, GimmickState>()
const waiting = new Map<string, Promise<GLTF | null>>()

/** 그 번들의 지금 상태. 처음 부르면 받기 시작한다 — 프레임마다 불러도 된다 */
export function gimmickState(name: string): GimmickState {
  const had = states.get(name)
  if (had !== undefined) return had
  void loadGimmick(name)
  return states.get(name) ?? 'loading'
}

/** 기믹 glb 하나. 못 받으면 null — 그 뒤로는 원작 그림이 선다 */
export function loadGimmick(name: string): Promise<GLTF | null> {
  let hit = waiting.get(name)
  if (hit === undefined) {
    const path = `models/gimmick/${name}.glb`
    const provider = assets()
    states.set(name, 'loading')
    hit = provider.objectUrl(path)
      .then((url) => loader.loadAsync(url).finally(() => { provider.releaseObjectUrl(path) }))
      .then((gltf) => {
        gltf.scene.traverse((o: Object3D) => {
          if (!(o instanceof Mesh)) return
          o.castShadow = true
          o.receiveShadow = true
        })
        states.set(name, gltf)
        return gltf
      })
      .catch(() => { states.set(name, 'missing'); return null })
    waiting.set(name, hit)
  }
  return hit
}

/** 정적 기믹 한 벌의 그릴 것 — 노드 자리를 구워 넣은 모양과 재질 (인스턴싱 · 한 메시씩 세우기에 같이 쓴다) */
export interface GimmickPiece { geometry: BufferGeometry, material: Material | Material[] }

const pieces = new Map<string, GimmickPiece[]>()

/**
 * 정적 기믹(뼈 없는 넷)의 조각들. 구운 glb는 재질마다 프리미티브 하나라 넷 다 조각이 하나다.
 * 노드 행렬은 모양에 구워 넣는다 — 인스턴스 행렬이 자리만 맡게
 */
export function gimmickPieces(gltf: GLTF, name: string): GimmickPiece[] {
  const had = pieces.get(name)
  if (had !== undefined) return had
  const out: GimmickPiece[] = []
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o: Object3D) => {
    if (!(o instanceof Mesh)) return
    const geometry = (o.geometry as BufferGeometry).clone()
    geometry.applyMatrix4(o.matrixWorld)
    geometry.computeBoundingSphere()
    out.push({ geometry, material: o.material as Material | Material[] })
  })
  pieces.set(name, out)
  return out
}
