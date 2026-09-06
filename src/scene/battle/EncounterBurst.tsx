// 배틀이 열리는 순간 발밑에서 터지는 **원작 입자** (PARITY §7.13)
//
// 마디는 `engine/battle/encounterBurst`가 롬에서 읽어 둔 것이고, 여기는 그
// 마디대로 `waza` 묶음의 자원 두 벌을 세우는 일만 한다 — 기술 연출과 같은
// 묶음이라 받을 것이 따로 없다.
//
// ⚠️ **파일에 든 자원을 다 세운다.** 원작에 이미터 수 표가 따로 있는데
// (`ov12_02238088`) 스물둘이 스물둘 다 그 `.spa`의 자원 수와 같다 —
// `encounterBurst.test`가 그것을 지킨다.
//
// ⚠️ **원작 카메라가 정사영이고 원점에서 터진다.** 우리 무대는 원근 3D라
// 자리와 자를 다시 잡는다 — 축은 항등(카메라가 +Z에서 본다)이고, 자는 화면
// 세로가 담는 DS 단위로 맞춘다 (진화 무대의 `EVO_METRE`와 같은 셈이다)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Camera, PerspectiveCamera } from 'three'
import { BURST, burstMembers } from '../../engine/battle/encounterBurst'
import { battleTerrainNow } from '../../state/battleStore'
import { useBattleStore } from '../../state/battleStore'
import { SplParticles } from './SplParticles'
import { preloadSplPack, splFileFor, SPL_WAZA } from './splPack'
import { encounterBurst, STAGE_ORIGIN } from './stageRefs'
import { DS_VIEW_TALL } from '../CinematicStage'
import type { SplCue } from './splDraw'
import type { SplBasis, Vec3 } from './splPlace'

/** 카메라가 +Z에서 원점을 본다 — 원작 입자 공간과 같다 */
const BASIS: SplBasis = { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] }

/** 땅 이펙트는 발밑 한가운데서 터진다 (원작은 원점이다) */
const ORIGIN: Vec3 = [0, 0, 0]

/**
 * DS 한 단위가 우리 무대의 몇 미터인가.
 *
 * ⚠️ **몸 키로 재지 않는다.** 기술 입자는 `splMetre`로 몸에 맞추지만(연출이
 * 포켓몬에 걸리므로) 이건 **화면 전체를 덮는 이펙트**라 그렇게 재면 큰 판때기의
 * 네 변이 화면 안에 들어와 네모난 자국으로 보인다 — 진화 무대에서 실제로
 * 그랬다. 원작 화면이 담던 만큼을 우리 화면도 담게 한다.
 *
 * ⚠️ **카메라가 움직이므로 그때그때 잰다** — 배틀 카메라는 샷마다 옮겨 다닌다
 * (`ShotDirector`). 무대 한가운데까지의 거리와 화각으로 세로 폭을 내고 원작
 * 세로 폭(`DS_VIEW_TALL` = 8)으로 나눈다
 */
function metreOf(camera: Camera): number {
  const far = camera.position.distanceTo(STAGE_ORIGIN)
  const fov = (camera as PerspectiveCamera).fov ?? 45
  return (2 * far * Math.tan((fov / 2) * (Math.PI / 180))) / DS_VIEW_TALL
}

/**
 * @param withParticles 설정의 「배틀 애니메이션」이 켜져 있나.
 *   ⚠️ **꺼져 있어도 이 컴포넌트는 선다** — 화면을 덮은 막이 여기서 켜는 시계로
 *   걷히므로(`ui/battle/BattleOpenVeil`) 안 서면 배틀이 **검은 채로** 남는다.
 *   원작도 그 설정은 기술 연출을 건너뛰는 것이지 화면을 안 여는 것이 아니다
 */
export function EncounterBurst({ withParticles }: { withParticles: boolean }) {
  const phase = useBattleStore((s) => s.phase)
  const [cues, setCues] = useState<readonly SplCue[] | null>(null)
  const metre = useRef(1)

  // 준비하는 동안 묶음을 미리 받아 둔다 — 열리는 그 프레임에 답이 나와야 한다
  useEffect(() => {
    if (phase === 'loading') void preloadSplPack(SPL_WAZA)
  }, [phase])

  /** 열렸다는 것은 알았고 아직 안 텄다 */
  const armed = useRef(false)
  useEffect(() => {
    if (phase !== 'running') setCues(null)
    armed.current = phase === 'running'
  }, [phase])

  /**
   * ⚠️ **효과 안에서 시계를 켜면 안 된다.** 배틀이 열리는 그 순간 주인공·상대
   * 몸과 규칙기를 받느라 본줄기가 **3.5초쯤 막힌다**(실측). 그때 시계를 켜면
   * 다시 그리기 시작할 때 마디가 **207프레임**째라 연출이 통째로 지나가 있다.
   * 그래서 **다시 그려지는 첫 프레임**에 켠다 — 원작이 배틀 화면을 다 세워
   * 놓고 트는 그 자리와 같은 뜻이다
   */
  useFrame(({ camera }) => {
    if (!armed.current) return
    armed.current = false
    // ⚠️ **시계는 무슨 일이 있어도 켠다.** 화면을 덮은 막이 이 시계로 걷히므로
    // (`ui/battle/BattleOpenVeil`) 여기서 그냥 돌아가면 배틀이 **검은 채로**
    // 남는다 — 입자 묶음을 못 받은 판이 정확히 그 자리다
    encounterBurst.at = performance.now()
    if (!withParticles) return
    const [a, b] = burstMembers(battleTerrainNow())
    const fileA = splFileFor(SPL_WAZA, a)
    const fileB = splFileFor(SPL_WAZA, b)
    if (!fileA || !fileB) return // 묶음이 아직 안 왔다 — 이 한 번은 흰 막만 돈다
    metre.current = metreOf(camera)
    const made: SplCue[] = []
    for (const [i] of fileA.resources.entries()) {
      made.push({ file: fileA, res: i, at: 'center', frame: 0 })
    }
    for (const [i] of fileB.resources.entries()) {
      made.push({ file: fileB, res: i, at: 'center', frame: BURST.second })
    }
    setCues(made)
  })

  const key = useMemo(() => (cues === null ? 0 : encounterBurst.at), [cues])
  if (cues === null) return null
  return (
    <SplParticles
      key={key}
      cues={cues}
      by={ORIGIN}
      foe={ORIGIN}
      basis={BASIS}
      metre={metre.current}
      onDone={() => {
        setCues(null)
      }}
    />
  )
}
