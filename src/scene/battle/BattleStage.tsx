// 배틀 무대 (PLAN §7.4) — 배틀이 열려 있는 동안만 씬에 선다.
//
// **오버월드와 같은 Canvas를 쓴다.** 영속 Canvas 불변식(PLAN §3.3) 때문에 배틀용
// 캔버스를 따로 띄울 수 없고, 그럴 이유도 없다 — 무대를 신오에서 멀리 떨어뜨려 놓고
// (`STAGE_ORIGIN`) 카메라만 옮긴다. 그래서 배틀에 들어갈 때 컨텍스트 재생성도,
// 셰이더 재컴파일도 없다.
//
// 포켓몬 모델은 아직 없다. 지금 세우는 것은 **무대와 카메라**다 — 4세대 배틀이
// 3D답게 느껴지는 이유의 대부분이 거기 있고(§7.4), 모델은 나중에 이 자리에
// 그대로 끼워 넣으면 된다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, CanvasTexture, Group, LinearFilter, SRGBColorSpace } from 'three'
import { loadSpecies } from '../../data/gameData'
import { useBattleStore } from '../../state/battleStore'
import type { ViewMon } from '../../engine/battle/view'
import { battleStage, STAGE_ORIGIN } from './stageRefs'
import { bodyColor } from './bodyColor'

// ── 배치 ─────────────────────────────────────────────────────────────────────
// 원작의 문법 그대로다: **내 포켓몬은 앞쪽 왼쪽에 뒷모습으로, 상대는 뒤쪽 오른쪽에
// 작게.** 그 거리 차이가 곧 깊이감이라, 둘을 같은 깊이에 두면 아무리 조명을 넣어도
// 평면으로 보인다. 카메라까지의 거리가 6.1 대 11.5 — 상대가 화면에서 절반 크기다.
const MINE = { x: -2.4, z: 1.6, radius: 2.6, scale: 1.35 }
const FOE = { x: 2.6, z: -3.2, radius: 2.1, scale: 1.05 }

/**
 * 내 포켓몬 뒤 왼쪽 위에서 상대를 내려다본다.
 *
 * 높이와 거리를 실제 화면으로 맞췄다. 낮게(y 3.3) 가까이(z 7.0) 두면 지면이
 * 화면을 다 먹고 내 포켓몬이 앞을 가린다 — 하늘이 보여야 무대에 깊이가 생긴다
 */
const CAMERA_POS = [-2.6, 5.0, 9.6] as const
const CAMERA_TARGET = [0.9, 1.0, -1.6] as const

/** 등판·기절이 딱 끊기지 않게 하는 시간(초) */
const FADE = 0.35

/**
 * 위에서 아래로 어두워지는 하늘 텍스처.
 *
 * 배경을 단색으로 두면 지면과 하늘의 경계가 사라져서 무대가 종이처럼 보인다.
 * 2×N 캔버스 하나면 충분하다 — 셰이더를 쓸 일이 아니다
 */
function useSkyTexture(): CanvasTexture | null {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#3f6ea8')
    grad.addColorStop(0.45, '#7fb0d8')
    grad.addColorStop(0.72, '#cfe3ef')
    grad.addColorStop(1, '#8fa87c') // 지평선에서 지면 색으로 넘어간다
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 256)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    return tex
  }, [])
}

/** 발밑 그림자. 방향광 그림자를 켜는 것보다 훨씬 싸고, 여기서는 더 안정적이다 */
function useShadowTexture(): CanvasTexture | null {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(0,0,0,0.5)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    return tex
  }, [])
}

interface SpeciesLook {
  color: string
}

/**
 * 한쪽의 발판과 그 위에 선 것.
 *
 * `mine`이면 뒷모습이라는 뜻인데, 지금은 도형이라 앞뒤가 없다 — 대신 크기와
 * 카메라까지의 거리로 구분된다
 */
function Slot(
  { mon, look, spot, mine, shadow }: {
    mon: ViewMon | null
    look: SpeciesLook | null
    spot: typeof MINE
    mine: boolean
    shadow: CanvasTexture | null
  },
) {
  const body = useRef<Group>(null)
  const fainted = mon !== null && mon.hp <= 0
  // 등판·기절을 0/1로 끊으면 포켓몬이 순간이동한다. 눈에 보이는 값만 쓰는
  // 표현이므로 시뮬레이션 스텝이 아니라 렌더 델타로 민다
  const shown = useRef(0)

  useFrame((_, delta) => {
    const g = body.current
    if (!g) return
    const want = mon && !fainted ? 1 : 0
    shown.current += Math.sign(want - shown.current) * Math.min(delta / FADE, Math.abs(want - shown.current))
    const t = shown.current
    g.visible = t > 0.01
    g.scale.setScalar(spot.scale * (0.6 + 0.4 * t))
    // 살짝 위아래로 흔든다. 완전히 굳어 있으면 도형이 아니라 소품으로 보인다
    const bob = Math.sin(performance.now() / 620 + spot.x) * 0.045
    g.position.y = spot.scale * 0.72 * t + bob * t - (1 - t) * 0.5
  })

  const height = mine ? 1.05 : 0.95
  return (
    <group position={[spot.x, 0, spot.z]}>
      {/*
        발판. 원작에서도 양쪽이 각자의 원판 위에 선다.
        옆면을 지면보다 **어둡게**, 윗면을 **밝게** 해서 두께가 보이게 한다 —
        지면과 같은 계열로 칠하면 원판이 아니라 색만 다른 얼룩으로 보인다
      */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <cylinderGeometry args={[spot.radius, spot.radius * 1.05, 0.24, 44]} />
        <meshStandardMaterial color="#4e6538" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.245, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[spot.radius * 0.95, 44]} />
        <meshStandardMaterial color="#9dbd6c" roughness={0.88} />
      </mesh>

      {shadow && (
        <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[spot.radius * 1.05, spot.radius * 1.05]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} />
        </mesh>
      )}

      <group ref={body} position={[0, 0.25, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.42, height, 6, 16]} />
          <meshStandardMaterial
            color={look?.color ?? '#8b9099'} roughness={0.62} metalness={0.02}
          />
        </mesh>
      </group>
    </group>
  )
}

export function BattleStage() {
  const view = useBattleStore((s) => s.view)
  const roster = useBattleStore((s) => s.roster)
  const sky = useSkyTexture()
  const shadow = useShadowTexture()
  const [colors, setColors] = useState<((id: number) => string) | null>(null)

  // 몸 색은 롬의 종족 데이터에 있다. 배틀 스토어가 이미 받아 둔 표라 캐시에 걸린다
  useEffect(() => {
    let alive = true
    void loadSpecies()
      .then((table) => {
        if (alive) setColors(() => (id: number) => bodyColor(table.byId.get(id)?.color ?? -1))
      })
      .catch(() => { /* 못 받으면 아래에서 회색으로 떨어진다 */ })
    return () => { alive = false }
  }, [])

  // 카메라를 가져간다. EngineDriver가 이 깃발을 보고 오버월드 카메라를 양보한다
  useEffect(() => {
    battleStage.active = true
    battleStage.position.set(...CAMERA_POS).add(STAGE_ORIGIN)
    battleStage.target.set(...CAMERA_TARGET).add(STAGE_ORIGIN)
    return () => { battleStage.active = false }
  }, [])

  const look = (mon: ViewMon | null, key: string): SpeciesLook | null => {
    if (!mon) return null
    const id = mon.species ?? roster[key]?.species ?? -1
    return { color: colors?.(id) ?? '#8b9099' }
  }

  return (
    <group position={STAGE_ORIGIN}>
      {/*
        하늘. **안쪽 면을 그린다** — `scale={[-1,1,1]}`로 뒤집으면 감기 방향만
        바뀌고 컬링은 그대로라 통째로 안 보인다(실제로 그렇게 만들었다가 배경이
        검게 나왔다). 안개도 끈다 — 오버월드 기준(45~115)이라 이 구가 다 먹힌다
      */}
      {sky && (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[120, 32, 20]} />
          <meshBasicMaterial map={sky} side={BackSide} fog={false} depthWrite={false} />
        </mesh>
      )}

      <hemisphereLight args={['#cfe3ef', '#4a5a3a', 1.1]} />
      <directionalLight position={[6, 12, 8]} intensity={1.9} />
      {/* 뒤에서 넣는 약한 빛. 이게 없으면 몸통의 그늘진 쪽이 배경에 묻는다 */}
      <directionalLight position={[-8, 5, -10]} intensity={0.5} color="#9fc4e8" />

      {/* 지면. 하늘 구(반지름 120)보다 훨씬 작아서 그 경계가 지평선이 된다 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[34, 64]} />
        <meshStandardMaterial color="#7f9a5e" roughness={1} />
      </mesh>

      <Slot
        mon={view?.active.p2 ?? null} look={look(view?.active.p2 ?? null, 'p2-0')}
        spot={FOE} mine={false} shadow={shadow}
      />
      <Slot
        mon={view?.active.p1 ?? null} look={look(view?.active.p1 ?? null, 'p1-0')}
        spot={MINE} mine shadow={shadow}
      />
    </group>
  )
}
