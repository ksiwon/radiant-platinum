import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
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

function progress(door: DoorVisual, clip: DoorClip): number {
  const span = door.phase === 'closing' ? clip.shutMs : clip.openMs
  const t = Math.min(1, Math.max(0, (performance.now() - door.since) / Math.max(1, span)))
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

/** `LoadDoorAnimation`으로 지정한 타일 위에 실제 회전 문짝을 세운다. */
export function DoorAnimations({ grid }: { grid: MapGrid }) {
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
      {doors.map((door) => (
        <Door
          key={door.tag}
          door={door}
          clip={doorClip(grid.propModelAt(door.x, door.z), anims)}
          y={grid.heightAtWorld(door.x + 0.5, door.z + 0.5, 0) ?? 0}
        />
      ))}
    </group>
  )
}
