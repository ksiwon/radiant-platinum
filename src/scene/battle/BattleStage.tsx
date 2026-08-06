// 배틀 무대 (PLAN §7.4) — 배틀이 열려 있는 동안만 씬에 선다.
//
// **오버월드와 같은 Canvas를 쓴다.** 영속 Canvas 불변식(PLAN §3.3) 때문에 배틀용
// 캔버스를 따로 띄울 수 없고, 그럴 이유도 없다 — 무대를 신오에서 멀리 떨어뜨려 놓고
// (`STAGE_ORIGIN`) 카메라만 옮긴다. 그래서 배틀에 들어갈 때 컨텍스트 재생성도,
// 셰이더 재컴파일도 없다.
//
// 포켓몬은 **원작 도트 그림**을 세운다(DATA.md §2.17). 4세대 배틀은 3D가 아니다 —
// 무대와 카메라만 3D고 포켓몬은 80×80 한 장이다. 여기서 3D 모델을 지어내면
// 원작이 아니라 다른 게임이 된다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Group, type CanvasTexture, type Texture } from 'three'
import { loadSpecies } from '../../data/gameData'
import { useBattleStore } from '../../state/battleStore'
import type { ViewMon } from '../../engine/battle/view'
import { battleStage, STAGE_ORIGIN } from './stageRefs'
import { bodyColor } from './bodyColor'
import { loadMonSprite, loadSpriteIndex, spriteFit } from './monSprite'
import { MoveVfx } from './MoveVfx'
import { DAY, makeBlobShadow, makeSkyTexture } from '../fx/sky'

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

interface SpeciesLook {
  color: string
}

/**
 * 화면에서 제일 큰 종이 차지할 높이 (월드 단위, `spot.scale` 곱하기 전).
 *
 * 발판 반지름이 2.6이라 꽉 찬 종이 발판 지름의 절반쯤 된다. 종마다 원작 그림이
 * 80×80을 다르게 채우므로 이 값 하나가 크기 차이를 그대로 옮긴다
 */
const MON_TALL = 2.8

/**
 * 한쪽의 발판과 그 위에 선 것.
 *
 * `mine`이면 **뒷모습**이다 — 원작 문법 그대로 내 포켓몬은 등을 보이고 상대는
 * 앞을 본다. 그림이 따로 있으므로 여기서 뒤집지 않는다
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
  const [art, setArt] = useState<{ map: Texture; scale: number; lift: number } | null>(null)

  // 그림은 종이 바뀔 때만 받는다. 같은 종을 여럿 데리고 있어도 한 벌이면 된다
  const species = mon?.species ?? null
  useEffect(() => {
    let alive = true
    if (species === null) { setArt(null); return }
    void Promise.all([loadSpriteIndex(), loadMonSprite(species, mine)])
      .then(([idx, map]) => {
        if (!alive) return
        const box = idx.sprites[String(species)]?.[mine ? 'back' : 'front']
        setArt({ map, ...spriteFit(box, idx.size, MON_TALL) })
      })
      .catch(() => { if (alive) setArt(null) })
    return () => { alive = false }
  }, [species, mine])
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
        {art ? (
          /*
            도트 한 장. 카메라가 고정이라 빌보드로 돌릴 필요가 없다 — 원작
            카메라도 고정이고, 돌리면 오히려 그림이 그려진 각도와 어긋난다.
            `alphaTest`로 오려 내므로 반투명 정렬 문제가 없다
          */
          <mesh position={[0, art.lift, 0]} castShadow>
            <planeGeometry args={[art.scale, art.scale]} />
            <meshBasicMaterial map={art.map} transparent alphaTest={0.5} toneMapped={false} />
          </mesh>
        ) : (
          // 그림을 못 받았을 때만 도형으로 떨어진다. 종족 색은 롬에서 온다
          <mesh castShadow>
            <capsuleGeometry args={[0.42, height, 6, 16]} />
            <meshStandardMaterial
              color={look?.color ?? '#8b9099'} roughness={0.62} metalness={0.02}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}

export function BattleStage() {
  const view = useBattleStore((s) => s.view)
  const roster = useBattleStore((s) => s.roster)
  // 오버월드와 **같은 하늘·같은 조명**을 쓴다. 두 화면의 톤이 어긋나면
  // 배틀에 들어갈 때마다 다른 게임처럼 보인다
  const sky = useMemo(() => makeSkyTexture(DAY), [])
  const shadow = useMemo(() => makeBlobShadow(), [])
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

      <hemisphereLight args={['#d4e9f7', '#8d8468', 0.85]} />
      <directionalLight position={[8, 14, 9]} intensity={1.05} color="#fff4e0" />
      {/* 카메라 쪽 필. 이게 없으면 몸통의 그늘진 쪽이 배경에 묻는다 */}
      <directionalLight position={[-7, 6, 12]} intensity={0.38} color="#cfe0f0" />

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
      {/*
        기술 연출. 박자가 `MOVE_FRAMES`만큼 쉬는 그 자리에 한 번 돈다 —
        틀은 롬의 기술 데이터가, 색은 타입이 정한다 (`engine/battle/vfx`)
      */}
      <MoveVfx mine={[MINE.x, MINE.z]} foe={[FOE.x, FOE.z]} />
    </group>
  )
}
