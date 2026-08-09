// 3인칭에서 **카메라와 플레이어 사이에 든** 건물을 비켜 준다.
//
// 나무는 이미 비켜 준다 (`Foliage`의 `nearScale`). 그런데 집은 안 비켜서, 길을
// 걷다 집 옆을 지나면 **화면의 절반이 지붕**이 된다 — 3인칭 카메라가 플레이어
// 뒤 8타일·위 4타일에 있어서 그 사이에 벽이 들어오기 때문이다. 원작 DS 카메라는
// 고정 부감이라 이런 일이 없었다.
//
// **나무처럼 줄이지 않고 흐려서 지운다.** 집이 쪼그라들어 땅에 빨려 드는 것은
// 나무가 작아지는 것과 달리 눈에 걸린다. 소품은 수가 적어서(창 하나에 수십 개)
// 개체마다 재질을 따로 두는 값이 싸다.
//
// ⚠️ **카메라까지의 거리로만 재면 안 된다.** 처음에 그렇게 했다가 집은 사라지고
// **문짝만 남았다.** 문은 집과 별개의 배치라 상자가 따로인데, 집의 앞벽보다
// 조금 멀어서 덜 흐려진 것이다. 재야 할 것은 거리가 아니라 **가리고 있는가**다 —
// 카메라에서 플레이어까지 그은 선에 얼마나 가까운지를 본다. 그러면 그 선을
// 함께 막고 선 것들이 같이 비켜난다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Vector3, type BufferGeometry, type Group, type Material } from 'three'
import { worldState } from '../state/worldState'

/** 이보다 선에 가까이 서 있으면 다 지운다 (타일) */
const BLOCK_R = 0.7
/** 이 구간에서 흐려진다. 갑자기 없어지면 깜빡임으로 읽힌다 */
const FADE_SPAN = 1.3
/**
 * 이보다 옅어지면 아예 안 그린다.
 *
 * **바닥값을 안 남긴다.** 처음엔 12%를 남겨 뒀는데, 카메라가 든 집의 앞벽이
 * 잔디 위에 갈색 판으로 떠 있는 그림이 됐다 — 나무는 0까지 줄어드는데 집만
 * 유령으로 남으면 그게 더 고장으로 보인다
 */
const GONE = 0.03
/** 한 프레임에 따라가는 몫. 1이면 카메라를 돌릴 때 깜빡인다 */
const EASE = 0.14

/**
 * 선을 몇 토막으로 끊어 재는가.
 *
 * 카메라에서 플레이어까지가 8.9타일이라 열여섯 토막이면 간격이 0.56타일이고,
 * 그게 `BLOCK_R`보다 짧다 — 토막 사이로 빠져나가는 벽이 없다는 뜻이다
 */
const STEPS = 16

/** 플레이어의 어느 높이를 겨누는가. 발밑을 겨누면 머리를 가린 지붕이 안 걸린다 */
const AIM_HEIGHT = 1.2



/** 가리는 선까지의 거리 → 불투명도. 1이면 손대지 않은 것이다 */
export function fadeFor(distance: number): number {
  return Math.min(1, Math.max(0, (distance - BLOCK_R) / FADE_SPAN))
}

interface Props {
  /** 흐려질 소품의 지오메트리. 상자를 여기서 잰다 */
  geometry: BufferGeometry
  /**
   * 그 소품만 쓰는 재질. **공유 재질을 넘기면 다른 집까지 같이 흐려진다**.
   *
   * ⚠️ **배열 자체도 소품마다 하나여야 한다** — 그릴 때마다 새로 만들면
   * `useEffect`의 의존이 매번 바뀌어 **정리 함수가 프레임마다 돈다.** 그
   * 정리가 원래 값을 되돌리는 일이라, 실제로 그 길로 롬의 반투명이 통째로
   * 지워졌다 (`ChunkModels`의 `Prop.fade`)
   */
  materials: readonly Material[]
  children: React.ReactNode
}

/**
 * 재질이 **원래** 갖고 있던 값.
 *
 * ⚠️ **흐리게 하는 것은 덮어쓰기가 아니라 곱하기다.** 여기가 틀려 있었다 —
 * `opacity = 흐린정도`로 덮어썼더니 롬이 정해 둔 반투명이 사라졌다. 소품 590종
 * 1,333개 재질 중 **279개(21%)가 불투명이 아니고**, 그중 146개가 집 밑에 까는
 * 그림자(`h_kage`, 알파 9/31)다. 그게 1.0으로 덮여서 마을마다 집 밑에
 * **새까만 판때기**가 깔려 있었다
 */
interface Base {
  opacity: number
  transparent: boolean
  depthWrite: boolean
}

const probe = new Vector3()
const aim = new Vector3()

/**
 * 자식 소품 하나를 "가리고 있는 정도"에 따라 흐리게 한다.
 *
 * 재질을 프레임마다 만지므로 **그 소품 전용이어야 한다**. 부르는 쪽(`ChunkModels`)이
 * 소품마다 재질을 따로 굽는 이유가 이것이다
 */
export function PropFade({ geometry, materials, children }: Props) {
  const group = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  // 로컬 상자는 지오메트리가 정한다. 자리·회전·크기는 부모 그룹이 갖고 있어서
  // 프레임마다 `matrixWorld`를 곱한다
  const local = useMemo(() => {
    geometry.computeBoundingBox()
    return geometry.boundingBox ?? new Box3(new Vector3(), new Vector3())
  }, [geometry])

  const box = useRef(new Box3())
  const at = useRef(1)
  const shadows = useRef(true)

  // 손대기 전의 값. 흐려질 때는 여기에 곱하고, 돌아올 때는 여기로 돌아온다
  const base = useMemo((): Base[] => materials.map((m) => ({
    opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite,
  })), [materials])

  // 흐려진 채로 언마운트되면 그 재질을 물려받은 다음 소품이 흐리게 시작한다
  useEffect(() => () => {
    materials.forEach((m, i) => {
      const b = base[i]
      if (!b) return
      m.transparent = b.transparent
      m.opacity = b.opacity
      m.depthWrite = b.depthWrite
    })
  }, [materials, base])

  useFrame(() => {
    const node = group.current
    if (!node) return
    // 1인칭은 눈이 곧 플레이어라 가릴 사이가 없다 — 코앞의 벽이 사라지면 더 이상하다
    let want = 1
    if (worldState.camera.mode !== 'first') {
      const world = box.current.copy(local).applyMatrix4(node.matrixWorld)
      const p = worldState.player.position
      aim.set(p.x, p.y + AIM_HEIGHT, p.z)
      // ⚠️ **플레이어보다 멀리 있는 것은 안 건드린다.**
      //
      // 이게 없으면 플레이어가 마주 보고 선 집이 반쯤 비친다 — 집은 겨눈 자리
      // 바로 너머에 있는데 흐려짐 구간이 거기까지 닿아서, 떡잎마을 주인공 집이
      // 42%로 비치고 문짝만 또렷하게 남았다. 카메라에서 그 상자까지가 카메라에서
      // 플레이어까지보다 멀면 가릴 수가 없다
      const reach = camera.position.distanceTo(aim) - BLOCK_R
      if (world.distanceToPoint(camera.position) < reach) {
        let closest = Infinity
        for (let i = 0; i <= STEPS; i++) {
          probe.lerpVectors(camera.position, aim, i / STEPS)
          const d = world.distanceToPoint(probe)
          if (d < closest) closest = d
          if (closest === 0) break
        }
        want = fadeFor(closest)
      }
    }

    const next = at.current + (want - at.current) * EASE
    if (Math.abs(next - at.current) < 0.002) return
    at.current = next

    // 다 옅어졌으면 통째로 안 그린다. 드로우콜도 그만큼 준다
    node.visible = next > GONE
    const solid = next >= 0.995
    materials.forEach((m, i) => {
      const b = base[i]
      if (!b) return
      // **곱한다.** 롬이 정한 반투명(집 밑 그림자 9/31 등) 위에 흐림을 얹는다
      m.opacity = b.opacity * next
      // 원래 반투명이던 것은 되돌아와도 반투명이다
      const blend = b.transparent || !solid
      // ⚠️ `transparent`를 바꾸면 파이프라인이 다시 서야 한다. 값이 실제로
      // 뒤집힐 때만 표시를 세운다 — 프레임마다 세우면 WebGPU에서 매번 다시 굽는다
      if (m.transparent !== blend) {
        m.transparent = blend
        // 반투명일 때 깊이를 쓰면 그 뒤의 것이 통째로 안 그려진다
        m.depthWrite = b.depthWrite && solid
        m.needsUpdate = true
      }
    })
    // 흐려지기 시작하면 그림자부터 뗀다. 안 그러면 없는 집의 그림자가 땅에 남는다
    if (solid !== shadows.current) {
      shadows.current = solid
      node.traverse((o) => {
        if ('castShadow' in o) (o as { castShadow: boolean }).castShadow = solid
      })
    }
  })

  return <group ref={group}>{children}</group>
}
