// 배틀 무대 (`public/models/arena/g0xx.glb`) — 모델 · 시간대 물들임 · 시퀀스 배경 물들임 · 카메라 충돌.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Color, Mesh, MeshStandardMaterial, NormalBlending, Vector3, type BufferGeometry, type Group, type Material } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyLightMode } from './arenaLight'
import { arenaRoom, seqStage } from './stageRefs'
import { buildArenaCollider, type ArenaCollider } from '../../engine/battle/fx/arenaCollider'
import { onProviderSwap } from '../../data/providers/assetProvider'
import { useAssetUrl } from '../../data/providers/useAssetUrl'
import type { TimeLook } from '../fx/sky'

/**
 * 무대 바닥의 높이 (실측).
 *
 * 우리가 정한 값이 아니라 그 모델의 지면이다. **무대 열여덟 벌 전부** 두 포켓몬
 * 자리 밑의 면이 y=0.000이고 `g001`만 0.001이다 (`arena.test`가 glb를 열어
 * 잰다) — 그래서 무대마다 높이를 따로 들고 다닐 이유가 없다.
 * 대체 지면(`Flat`)도 같은 높이에 둔다
 */
export const GROUND = 0.001

/**
 * 무대 파일마다 한 번만 짓는 카메라 충돌 (`buildArenaCollider`).
 *
 * 무대 삼각형은 파일이 정하고 파일 안의 모든 것(가시성 · 재질 블렌딩)은 `applyLightMode`가 같게 정하므로 같은
 * 파일이면 같은 BVH다 — 배틀을 열 때마다 수만 삼각형을 다시 짓지 않는다. 같은 파일이라도 반지름이 다르면
 * (거르는 삼각형이 달라진다) 다른 것이다.
 *
 * 충돌은 순수 배열이라 놓을 자원이 없다 — 설치본을 갈아 끼우면 옛 파일의 것이니 **비우기만** 한다
 */
const colliders = new Map<string, ArenaCollider>()

export function arenaColliderFor(file: string, radius: number, tris: () => number[]): ArenaCollider {
  const key = `${file}@${radius}`
  let room = colliders.get(key)
  if (!room) {
    room = buildArenaCollider(tris(), radius)
    colliders.set(key, room)
  }
  return room
}

export function clearArenaColliders(): void {
  colliders.clear()
}

onProviderSwap(() => { clearArenaColliders() })

/**
 * 시퀀스 카메라가 벽 · 천장 구조물에 안 박히게 무대 삼각형을 모은다.
 * 그려지는 불투명 면만 넣는다: 더하기 창빛(빛기둥 판)은 카메라를 막지 않는다. 무대 뿌리는 `STAGE_ORIGIN`
 * 그룹 바로 밑에 변환 없이 서므로 뿌리 기준 월드 행렬이 곧 무대 좌표다
 */
function opaqueTriangles(scene: Group): number[] {
  scene.updateMatrixWorld(true)
  const tris: number[] = []
  const v = new Vector3()
  scene.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const m = o.material as Material
    if (m.transparent || m.blending !== NormalBlending) return
    const geo = o.geometry as BufferGeometry
    const pos = geo.getAttribute('position')
    const index = geo.getIndex()
    const n = index ? index.count : pos.count
    for (let k = 0; k < n; k++) {
      v.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld)
      tris.push(v.x, v.y, v.z)
    }
  })
  return tris
}

/**
 * 배틀 무대 (`public/models/arena/g0xx.glb`).
 *
 * **원작 BDSP의 배틀 배경을 그대로 쓴다.** 우리가 지어낸 것이 아니라 롬에서
 * 꺼낸 것이다: `Environments/bg/arenas/ground/g0xx`를 정적 메시 수백 개 →
 * 재질 대여섯 벌로 구워 냈다 (`tools/extract/bdspArena.py`).
 *
 * ⚠️ **어느 무대인지는 맵이 정한다.** 맵 헤더의 `battleBG`가 고르고
 * (`battle/arena`), 파도타기 중이면 원작대로 바다가 선다. 어디서 싸우든 풀밭이
 * 서던 시절의 흔적이 남아 있으면 동굴에서 나무가 보인다.
 *
 * ⚠️ **원판 두 개를 띄우던 자리다.** 발판 위에 각자 서 있으면 무대가 아니라
 * 좌대 위의 인형으로 보인다 — 원작은 둘이 **같은 땅에** 선다.
 *
 * 한 벌이 2~8MB라 배틀이 열리는 순간에 받는다. 받는 동안은 아래 `Flat`이 대신
 * 선다 — 첫 프레임에 빈 화면을 보이지 않으려고
 */
export function Arena({ look, file, radius, onUp }: {
  look: TimeLook; file: string; radius: number; onUp: (up: boolean) => void
}) {
  const gltf = useLoader(GLTFLoader, useAssetUrl(`models/arena/${file}`))
  // 이 부품이 서는 것 자체가 「무대가 왔다」다 — `useLoader`가 풀려야 마운트된다.
  // ⚠️ **나갈 때 도로 내린다.** 깃발을 밖에서 초기화하면, 무대 파일이 이미
  // 캐시에 있는 **두 번째 배틀**에서 이 효과가 먼저 돌고 초기화가 나중에 돌아
  // 영영 안 서는 창이 생긴다 — 자기가 켜고 자기가 끄면 그 창이 없다
  useEffect(() => {
    onUp(true)
    return () => { onUp(false) }
  }, [onUp])
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.receiveShadow = true
        o.castShadow = false
        // 창빛은 더하기로, 그림 없는 창빛은 숨긴다 — 아니면 흰 널빤지가 선다 (`arenaLight`)
        if (o.material instanceof MeshStandardMaterial && !applyLightMode(o.material)) o.visible = false
      }
    })
    return root
  }, [gltf])
  // 카메라 충돌 — 무대 파일마다 한 번(`arenaColliderFor`). 지으면 이 판의 `arenaRoom`으로 건다
  const room = useMemo(() => arenaColliderFor(file, radius, () => opaqueTriangles(scene)), [scene, file, radius])
  useEffect(() => {
    arenaRoom.current = room
    return () => { if (arenaRoom.current === room) arenaRoom.current = null }
  }, [room])
  // 무대는 낮 기준으로 구워져 있다. 밤에 그대로 두면 배경만 대낮이라, 시간대의
  // 지면색을 곱해 톤을 맞춘다 — 오버월드에서 걸어 들어온 그 시각이어야 한다
  useEffect(() => {
    const tint = new Color(look.groundColor).lerp(new Color('#ffffff'), 0.45)
    scene.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshStandardMaterial) {
        // ⚠️ **덮어쓰면 안 된다. 곱해야 한다.** 무늬 있는 재질은 제 색이
        // 흰색이라 덮으나 곱하나 같지만, **무늬 없는 재질**은 색이 전부다 —
        // g010의 바닷물(0, 0.295, 0.502), g006의 굴 불빛(1, 0.548, 0.13).
        // 덮어쓰면 바다가 흙색으로 물든다
        const base = (o.userData.tone ??= o.material.color.clone()) as Color
        o.material.color.copy(base).multiply(tint)
        o.userData.lit = o.material.color.clone()
      }
    })
  }, [scene, look])
  // BDSP 시퀀스의 배경 물들임 (`EffSpBackColSet`). **무대만** 물든다 — 몸과 이펙트는 그대로라
  // 어두워진 땅 위에 기술이 선다. 끄면 위에서 맞춘 색으로 돌아간다
  const backWas = useRef<string>('')
  useFrame(() => {
    const b = seqStage.running ? seqStage.back : null
    const key = b ? `${b.color.join(',')}:${b.alpha.toFixed(3)}` : ''
    if (key === backWas.current) return
    backWas.current = key
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return
      const lit = o.userData.lit as Color | undefined
      if (!lit) return
      if (!b) { o.material.color.copy(lit); return }
      o.material.color.setRGB(
        lit.r * (1 - b.alpha) + b.color[0] * b.alpha,
        lit.g * (1 - b.alpha) + b.color[1] * b.alpha,
        lit.b * (1 - b.alpha) + b.color[2] * b.alpha,
      )
    })
  })
  return <primitive object={scene} />
}

/** 무대를 아직 못 받았을 때 서는 땅. 하늘 구보다 훨씬 작아 그 경계가 지평선이 된다 */
export function Flat({ look }: { look: TimeLook }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND, 0]} receiveShadow>
      <circleGeometry args={[34, 64]} />
      <meshStandardMaterial color={look.groundColor} roughness={1} />
    </mesh>
  )
}

