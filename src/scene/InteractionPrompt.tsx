import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, CanvasTexture, Group, LinearFilter, SRGBColorSpace,
  type Mesh, type MeshBasicMaterial, type PointLight,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { NO_SCRIPT, quarterOf, talkTile } from '../engine/map/world'
import { npcActors } from '../engine/actor/npcs'
import { worldState } from '../state/worldState'
import { npcBodyHeight } from './NpcModels'
import { spriteHeight } from './EmoteMarks'
import { promptNpcAt } from './promptTarget'

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
] as const

/** 켜졌을 때의 점광 세기. 꺼진 동안에는 0으로 두고 **끄지는 않는다** */
const GLOW = 1.15
/** 숨결 하나의 길이(초). 이보다 빠르면 깜빡이는 것으로 읽힌다 */
const BREATH = 1.7

/**
 * 말을 걸 수 있다는 표시.
 *
 * ⚠️ **머리 위에 「A」를 띄우지 않는다.** 키 이름을 그림으로 얹으면 화면이
 * 곧바로 튜토리얼처럼 보인다 — 원작에는 그런 것이 없고, 우리 화면에서도
 * 그것만 겉돌았다. 대신 **그 사람이 살짝 밝아진다**:
 *
 *   · 가슴께의 점광 하나 — 모델이든 판때기든 **진짜로 밝아진다**
 *   · 몸 뒤의 부드러운 무리 — 몸에 가려서 실루엣 둘레만 남는다
 *   · 발밑의 얇은 고리 — 어느 사람인지를 바닥에서 짚어 준다
 *
 * 셋 다 천천히 숨 쉬듯 오르내린다.
 */
export function InteractionPrompt({ grid, layer }: { grid: MapGrid; layer: number }) {
  const root = useRef<Group>(null)
  const art = useRef<Group>(null)
  const halo = useRef<Mesh<never, MeshBasicMaterial>>(null)
  const ring = useRef<Mesh<never, MeshBasicMaterial>>(null)
  const glow = useRef<PointLight>(null)

  /**
   * 무리에 쓸 둥근 그라데이션.
   *
   * ⚠️ **셰이더를 새로 짜지 않는다.** 재질이 하나 늘면 그 프로그램을 굽는
   * 프레임이 통째로 밀리는 자리다(아래 ⚠️ 참고) — 그림 한 장이면 기본 재질로
   * 끝난다. 128px면 흐린 원 하나에 넉넉하다
   */
  const cloud = useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const g = canvas.getContext('2d')
    if (g) {
      const half = size / 2
      const grad = g.createRadialGradient(half, half, 0, half, half, half)
      grad.addColorStop(0, 'rgba(255,244,214,0.95)')
      grad.addColorStop(0.45, 'rgba(255,229,168,0.34)')
      grad.addColorStop(1, 'rgba(255,222,150,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, size, size)
    }
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    return tex
  }, [])

  // 이 컴포넌트는 격자가 갈릴 때마다 다시 설 수 있다 — 놓아 주지 않으면
  // 맵을 옮길 때마다 128×128 하나가 GPU에 쌓인다
  useEffect(() => () => { cloud.dispose() }, [cloud])

  useFrame(({ camera, clock }) => {
    const node = root.current
    if (!node) return
    /**
     * 표시를 켜고 끄는 자리.
     *
     * ⚠️ **빛까지 같이 감추면 안 된다.** 안 보이는 가지는 `_projectObject`가
     * 통째로 건너뛰므로 그 안의 점광이 **렌더 목록에서 빠진다.** 빛의 집합이
     * 바뀌면 `lightsNode`의 해시가 바뀌고, 그 해시는 모든 재질의 노드 캐시
     * 열쇠(`getDynamicCacheKey`)에 들어 있다 — 표시가 한 번 깜빡일 때마다
     * **씬에 있는 모든 셰이더가 다시 지어졌다.** 209번도로 실측으로 노드 상태
     * 224번 중 절반이 그 두 갈래로 갈려 있었다.
     *
     * 그래서 감추는 것은 **그림만**이고, 빛은 자리에 남긴 채 세기를 0으로
     * 내린다 (`MapStreamer`의 인물 키 라이트와 같은 방식이다).
     */
    const show = (on: boolean, breath = 1): void => {
      if (art.current) art.current.visible = on
      if (glow.current) glow.current.intensity = on ? GLOW * breath : 0
    }
    const player = worldState.player
    const moving = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) > 0.04
    if (moving || player.hop.active || player.riding || player.flying) {
      show(false)
      return
    }

    const step = FACING_STEP[quarterOf(player.facing)]!
    const front = {
      x: Math.floor(player.position.x) + step.x,
      z: Math.floor(player.position.z) + step.z,
    }
    const reach = talkTile(grid, front, step)
    const actor = promptNpcAt(npcActors.list, reach.x, reach.z, NO_SCRIPT, (npc) => npc.info.script)
    if (!actor) {
      show(false)
      return
    }

    const ground = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
    // 모델로 서 있으면 그 키를, 판때기면 그림의 키를 쓴다 (`EmoteMarks`와 같다)
    const body = npcBodyHeight(actor) ?? spriteHeight(actor.gfx)
    // 0.75~1. 숨을 쉬되 꺼지지는 않는다 — 0까지 내리면 깜빡임이 된다
    const breath = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * ((2 * Math.PI) / BREATH)))
    show(true, breath)
    node.position.set(actor.x + 0.5, ground, actor.z + 0.5)

    if (halo.current) {
      // ⚠️ **정수리 위로 올린다.** 몸에 겹쳐 두면 북쪽을 보고 말을 걸 때 —
      // 그러니까 제일 흔한 자리에서 — 주인공이 카메라와 그 사람 사이를 막아
      // 통째로 가린다(카메라가 북쪽 붙박이다). 실측으로 가슴에 뒀을 때는
      // 주인공 둘레만 하얘져서 **주인공이 빛나는 것처럼** 읽혔다.
      //
      // 「A」를 뺀 자리에 글자가 아니라 **번진 빛**을 둔다 — 어느 쪽에서
      // 다가와도 보이고, 읽어야 하는 기호가 아니다
      // 정수리에 걸친다 — 아래 절반이 머리와 어깨를 감싸고 위 절반이 밖으로
      // 나온다. 완전히 띄우면 머리 위에 등이 하나 떠 있는 것처럼 보인다
      halo.current.position.y = body * 0.95
      halo.current.scale.setScalar(Math.max(1, body))
      halo.current.quaternion.copy(camera.quaternion)
      halo.current.material.opacity = 0.55 * breath
    }
    if (ring.current) {
      ring.current.scale.setScalar(0.92 + 0.06 * breath)
      ring.current.material.opacity = 0.5 * breath
    }
    if (glow.current) glow.current.position.y = body * 0.78
  })

  return (
    <group ref={root}>
      <group ref={art} visible={false}>
        <mesh ref={halo}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={cloud}
            transparent
            opacity={0.34}
            // 몸 뒤에서 새어 나오게 — 깊이는 보되 쓰지는 않는다
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        {/* 발밑 고리. 바닥과 다투지 않게 살짝 띄운다 */}
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.36, 0.46, 40]} />
          <meshBasicMaterial
            color="#ffe6b0"
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      {/* 그림 밖에 둔다 — 위의 ⚠️ 참고. 세기만 오르내리고 자리는 늘 지킨다 */}
      <pointLight ref={glow} color="#ffe3ae" intensity={0} distance={2.4} />
    </group>
  )
}
