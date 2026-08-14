// 흔들리는 풀 무더기 (PARITY §6.5)
//
// 레이더를 켜면 9×9 상자 안 네 자리의 풀이 흔들린다. **그 흔들림이 규칙의
// 절반이다** — 사슬이 이어질 무더기는 사슬과 같은 세기로 흔들리고, 끊을
// 무더기는 동전을 던져 아무 세기로나 흔들린다. 화면에서 빠지면 어느 무더기로
// 걸어갈지를 고를 수가 없다.
//
// ⚠️ **흔드는 모양은 우리 것이다.** 원작은 오버월드 애니 관리자에 갈래 셋을
// 얹는데(`ov5_021F3154`의 0·1·2 — 약하게·강하게·색이 다르게) 우리 파이프라인은
// 그 애니를 안 굽는다. **세기 셋과 그 뜻**은 그대로 옮기고 폭·빠르기만 아래
// `SHAKE`가 정한다.
//
// ⚠️ **풀 포기 위에 겹쳐 그린다.** `Grass`는 청크가 뜰 때 한 번 세우고 끝이라
// 거기에 흔들림을 얹으면 무더기가 생길 때마다 청크를 다시 만들어야 한다
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { PATCH_SHAKE } from '../engine/world/pokeRadar'
import { radarPatches } from './pokeRadar'

/**
 * 세기별 흔들림. **우리 값이다** — 원작 대응물이 오버월드 애니라 못 옮긴다.
 *
 * 갈래 셋의 뜻은 원작 그대로다: 약하게 · 강하게 · **색이 다른 개체**
 */
const SHAKE = {
  soft: { angle: 0.10, speed: 6.0 },
  hard: { angle: 0.22, speed: 9.0 },
  shiny: { angle: 0.30, speed: 12.0 },
} as const

/** 포기 하나의 크기(타일). `Grass`의 포기보다 조금 크게 세운다 */
const BLADE = { width: 0.16, height: 0.62 }
/** 무더기 하나에 세우는 포기 수 */
const BLADES = 5

/** 무더기 하나 */
function Patch({ x, z, y, shake }: {
  x: number, z: number, y: number, shake: keyof typeof SHAKE,
}) {
  const group = useRef<Group>(null)
  const sway = SHAKE[shake]
  useFrame(() => {
    const g = group.current
    if (g === null) return
    const t = performance.now() / 1000
    g.rotation.z = Math.sin(t * sway.speed) * sway.angle
    g.rotation.x = Math.sin(t * sway.speed * 0.7 + 1.1) * sway.angle * 0.5
  })
  const blades = useMemo(
    () => Array.from({ length: BLADES }, (_, i) => {
      const a = (i / BLADES) * Math.PI * 2
      return { dx: Math.cos(a) * 0.22, dz: Math.sin(a) * 0.22, tilt: a }
    }),
    [],
  )
  return (
    <group ref={group} position={[x + 0.5, y, z + 0.5]}>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.dx, BLADE.height / 2, b.dz]} rotation={[0, b.tilt, 0]}>
          <planeGeometry args={[BLADE.width, BLADE.height]} />
          <meshLambertMaterial color="#4f9a3a" side={2} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  )
}

export function RadarPatches({ grid }: { grid: MapGrid }) {
  // ⚠️ **프레임마다 묻는다.** 무더기를 세우는 것은 도구를 쓰는 순간과 배틀이
  // 끝나는 순간이라 React 상태가 아니다 — 렌더 중에 읽으면 한 프레임 늦는다
  const patches = radarPatches()
  if (patches.length === 0) return null
  return (
    <group>
      {patches.map((p) => (
        <Patch
          key={`${String(p.x)},${String(p.z)}`}
          x={p.x}
          z={p.z}
          y={grid.heightAtWorld(p.x, p.z) ?? 0}
          shake={p.shiny ? 'shiny' : p.shake === PATCH_SHAKE.hard ? 'hard' : 'soft'}
        />
      ))}
    </group>
  )
}
