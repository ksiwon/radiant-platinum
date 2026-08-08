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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  BackSide, Color, Group, Mesh, MeshStandardMaterial,
  type CanvasTexture, type Texture,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { worldState } from '../../state/worldState'
import { timeBlend } from '../../engine/map/timeOfDay'
import { mapById, world } from '../../engine/map/world'
import { arenaFor, cameraFit, hasSky } from '../../engine/battle/arena'
import { loadSpecies } from '../../data/gameData'
import { useBattleStore } from '../../state/battleStore'
import type { ViewMon } from '../../engine/battle/view'
import { battleStage, STAGE_ORIGIN } from './stageRefs'
import { bodyColor } from './bodyColor'
import { loadMonSprite, loadSpriteIndex, spriteFit } from './monSprite'
import { MoveVfx } from './MoveVfx'
import { MOVE_FRAMES } from '../../engine/battle/vfx'
import {
  ShotDirector, SLOT, sampleShot, shotFor, type ShotName, type Side,
} from '../../engine/battle/shots'
import { useOptionsStore } from '../../state/optionsStore'
import {
  TIME_LOOKS, blendLooks, makeBlobShadow, makeSkyTexture, type TimeLook,
} from '../fx/sky'
import { modelUrl } from '../../data/assetBase'

/**
 * 무대 바닥의 높이 (실측).
 *
 * 우리가 정한 값이 아니라 그 모델의 지면이다. **무대 열여덟 벌 전부** 두 포켓몬
 * 자리 밑의 면이 y=0.000이고 `g001`만 0.001이다 (`arena.test`가 glb를 열어
 * 잰다) — 그래서 무대마다 높이를 따로 들고 다닐 이유가 없다.
 * 대체 지면(`Flat`)도 같은 높이에 둔다
 */
const GROUND = 0.001

// ── 배치 ─────────────────────────────────────────────────────────────────────
// 원작의 문법 그대로다: **내 포켓몬은 앞쪽 왼쪽에 뒷모습으로, 상대는 뒤쪽 오른쪽에
// 작게.** 그 거리 차이가 곧 깊이감이라, 둘을 같은 깊이에 두면 아무리 조명을 넣어도
// 평면으로 보인다. 카메라까지의 거리가 6.1 대 11.5 — 상대가 화면에서 절반 크기다.
// ⚠️ **자리는 엔진이 갖고 있다**(`battle/shots`의 `SLOT`). 카메라 샷이 같은
// 값을 봐야 하는데, 여기와 저기에 따로 적으면 샷이 빈 발판을 겨눈다
const MINE = { ...SLOT.p1, radius: 2.6, scale: 1.35 }
const FOE = { ...SLOT.p2, radius: 2.1, scale: 1.05 }

/** 등판·기절이 딱 끊기지 않게 하는 시간(초) */
const FADE = 0.35

/**
 * 때리러 나갔다 돌아오는 시간(초).
 *
 * 박자가 기술에 내주는 쉼과 같은 상수를 쓴다(`MOVE_FRAMES`) — 다르게 잡으면
 * 연출이 끝나기도 전에 다음 글이 뜨거나, 다 끝나고도 화면이 멈춰 있다
 */
const LUNGE = MOVE_FRAMES / 60
/** 맞고 움찔하는 시간(초). 원작은 스프라이트가 흔들리며 깜빡인다 */
const FLINCH = 0.34
/** 깜빡이는 횟수. 이보다 잦으면 화면이 지저분해지고 뜸하면 안 보인다 */
const FLINCH_BLINKS = 5

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
  { mon, look, spot, other, mine, shadow }: {
    mon: ViewMon | null
    look: SpeciesLook | null
    spot: typeof MINE
    /** 상대가 선 자리. 때리러 나가는 방향을 여기서 뽑는다 */
    other: typeof MINE
    mine: boolean
    shadow: CanvasTexture | null
  },
) {
  const body = useRef<Group>(null)
  const shade = useRef<Mesh>(null)
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

  /**
   * 때리는 쪽과 맞는 쪽의 움직임.
   *
   * **도형만 날아다니고 포켓몬은 가만히 있으면 누가 때렸는지가 안 보인다.**
   * 원작도 스프라이트가 앞으로 나갔다 오고, 맞은 쪽은 흔들리며 깜빡인다.
   *
   * 값은 프레임마다 줄어드는 타이머 둘이다. `useState`로 두면 배틀 내내 React가
   * 다시 그린다 — 뷰가 바뀌는 순간에만 1로 채우고 나머지는 `useFrame`이 민다
   */
  const lunge = useRef(0)
  const flinch = useRef(0)
  const side = mine ? 'p1' : 'p2'
  const cast = useBattleStore((s) => s.view?.lastMove ?? null)
  const struck = useBattleStore((s) => s.view?.lastHit ?? null)
  useEffect(() => { if (cast?.by === side) lunge.current = 1 }, [cast, side])
  useEffect(() => { if (struck?.side === side) flinch.current = 1 }, [struck, side])

  useFrame((_, delta) => {
    const g = body.current
    if (!g) return
    const want = mon && !fainted ? 1 : 0
    shown.current += Math.sign(want - shown.current) * Math.min(delta / FADE, Math.abs(want - shown.current))
    const t = shown.current
    g.scale.setScalar(spot.scale * (0.6 + 0.4 * t))
    // 살짝 흔든다. 완전히 굳어 있으면 도형이 아니라 소품으로 보인다.
    // **위로만 뜬다** — 아래로 내려가면 발이 땅에 파묻힌다
    const bob = (Math.sin(performance.now() / 620 + spot.x) * 0.5 + 0.5) * 0.05

    // 때리러 나간다. 앞의 반은 가고 뒤의 반은 온다 — 갔다가 순간이동으로
    // 돌아오면 뒷걸음질이 아니라 깜빡임으로 보인다
    lunge.current = Math.max(0, lunge.current - delta / LUNGE)
    const k = 1 - lunge.current
    const reach = lunge.current > 0 ? Math.sin(k * Math.PI) * 0.42 : 0

    // 맞으면 흔들리며 깜빡인다
    flinch.current = Math.max(0, flinch.current - delta / FLINCH)
    const hurt = flinch.current
    const shake = hurt > 0 ? Math.sin(hurt * Math.PI * 8) * 0.22 * hurt : 0
    const blink = hurt > 0 && Math.floor((1 - hurt) * FLINCH_BLINKS * 2) % 2 === 1
    g.visible = t > 0.01 && !blink

    g.position.x = (other.x - spot.x) * reach + shake
    // ⚠️ **발이 땅에 닿아야 한다.** 예전엔 여기에 `spot.scale * 0.72`를 더해
    // 놓아서 포켓몬이 제 발판에서 1m 가까이 떠 있었다. `spriteFit`이 이미
    // 판을 맞춰 놓는다 — 칠해진 그림의 아래끝이 이 그룹의 원점이다
    g.position.z = (other.z - spot.z) * reach
    g.position.y = GROUND + bob * t - (1 - t) * 0.5

    // ⚠️ **카메라가 움직이면 그림판을 돌려야 한다.** 도트 한 장이라 고정
    // 카메라일 때는 돌릴 이유가 없었는데(그때 주석도 그렇게 적혀 있었다),
    // 샷이 붙은 뒤로는 안 돌리면 옆에서 종잇장이 보인다. Y축으로만 돈다 —
    // 위아래로도 돌리면 발이 지면에서 뜬다
    g.rotation.y = Math.atan2(
      battleStage.position.x - STAGE_ORIGIN.x - spot.x,
      battleStage.position.z - STAGE_ORIGIN.z - spot.z,
    )

    // ⚠️ **그림자는 몸을 따라간다.** 안 그러면 아무도 안 선 자리에 회색 얼룩이
    // 깔린다 — 배틀이 열리고 "가라! 모부기!"가 뜨는 동안 상대 자리에 그림자만
    // 먼저 놓여 있었고, 쓰러진 뒤에도 그대로 남았다.
    //
    // 깜빡임(`blink`)은 안 따라간다. 맞아서 몸이 깜빡이는 것은 연출이고
    // 그림자까지 같이 깜빡이면 땅이 번쩍인다
    const s = shade.current
    if (s) {
      s.visible = t > 0.01
      s.scale.setScalar(t)
    }
  })

  const height = mine ? 1.05 : 0.95
  return (
    <group position={[spot.x, 0, spot.z]}>
      {/*
        발밑 그림자. **발판이 아니다** — 원작(BDSP)은 둘이 같은 땅에 서고
        그림자만 진다. 원판을 깔면 무대가 아니라 좌대 위의 인형이 된다
      */}
      {shadow && (
        <mesh ref={shade} visible={false} position={[0, GROUND + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[spot.radius * 1.05, spot.radius * 1.05]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} />
        </mesh>
      )}

      <group ref={body} position={[0, GROUND, 0]}>
        {art ? (
          /*
            도트 한 장. 위 `useFrame`이 Y축으로 카메라를 향해 돌린다(빌보드).
            그림이 그려진 각도와 크게 어긋나지 않게, 카메라 쪽에서도 기준
            각도에서 40°까지만 돈다(`shots`의 `MAX_SWING`).
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
function Arena({ look, file }: { look: TimeLook; file: string }) {
  const gltf = useLoader(GLTFLoader, modelUrl(`arena/${file}`))
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.receiveShadow = true
        o.castShadow = false
      }
    })
    return root
  }, [gltf])
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
      }
    })
  }, [scene, look])
  return <primitive object={scene} />
}

/** 무대를 아직 못 받았을 때 서는 땅. 하늘 구보다 훨씬 작아 그 경계가 지평선이 된다 */
function Flat({ look }: { look: TimeLook }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND, 0]} receiveShadow>
      <circleGeometry args={[34, 64]} />
      <meshStandardMaterial color={look.groundColor} roughness={1} />
    </mesh>
  )
}

export function BattleStage() {
  const view = useBattleStore((s) => s.view)
  const roster = useBattleStore((s) => s.roster)
  // 오버월드와 **같은 하늘·같은 조명**을 쓴다. 두 화면의 톤이 어긋나면
  // 배틀에 들어갈 때마다 다른 게임처럼 보인다 — 해질녘에 걸어 들어왔는데
  // 배틀만 대낮이면 그 순간 다른 게임이 된다
  const timeLook = useMemo(() => {
    const { from, to, k } = timeBlend(worldState.time.gameHour)
    const at = (i: number) => TIME_LOOKS[i] ?? TIME_LOOKS[1]!
    return blendLooks(at(from), at(to), k)
  }, [])
  const sky = useMemo(() => makeSkyTexture(timeLook), [timeLook])
  const shadow = useMemo(() => makeBlobShadow(), [])
  // 무대는 **배틀이 열릴 때 한 번** 정한다. 싸우는 동안 걸어 나가지 않으므로
  // 맵을 다시 볼 이유가 없고, 매 프레임 보면 `useLoader`가 계속 다시 매달린다
  const arena = useMemo(
    () => arenaFor(mapById(world.mapId), worldState.player.surfing), [],
  )
  const [colors, setColors] = useState<((id: number) => string) | null>(null)
  const scene = useOptionsStore((s) => s.battleScene)

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
    return () => { battleStage.active = false }
  }, [])

  useBattleCamera(cameraFit(arena))

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
      {sky && hasSky(arena) && (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[120, 32, 20]} />
          <meshBasicMaterial map={sky} side={BackSide} fog={false} depthWrite={false} />
        </mesh>
      )}

      <hemisphereLight args={[timeLook.skyColor, timeLook.groundColor, timeLook.ambient]} />
      <directionalLight position={[8, 14, 9]} intensity={timeLook.sun} color={timeLook.sunColor} />
      {/* 카메라 쪽 필. 이게 없으면 몸통의 그늘진 쪽이 배경에 묻는다 */}
      <directionalLight position={[-7, 6, 12]} intensity={timeLook.fill} color={timeLook.skyColor} />

      {/*
        무대. 받는 동안은 평평한 땅이 대신 선다 — 배틀은 곧바로 열려야 한다
      */}
      <Suspense fallback={<Flat look={timeLook} />}>
        <Arena look={timeLook} file={arena.file} />
      </Suspense>

      <Slot
        mon={view?.active.p2 ?? null} look={look(view?.active.p2 ?? null, 'p2-0')}
        spot={FOE} other={MINE} mine={false} shadow={shadow}
      />
      <Slot
        mon={view?.active.p1 ?? null} look={look(view?.active.p1 ?? null, 'p1-0')}
        spot={MINE} other={FOE} mine shadow={shadow}
      />
      {/*
        기술 연출. 박자가 `MOVE_FRAMES`만큼 쉬는 그 자리에 한 번 돈다 —
        틀은 롬의 기술 데이터가, 색은 타입이 정한다 (`engine/battle/vfx`)
      */}
      {/*
        기술 연출. ⚠️ 설정에서 "배틀 애니메이션"을 끄면 통째로 안 그린다 —
        원작의 그 항목이 하는 일이 바로 이것이고, 그래서 배틀이 빨라진다
      */}
      {scene === SHOW_SCENE && <MoveVfx mine={[MINE.x, MINE.z]} foe={[FOE.x, FOE.z]} />}
    </group>
  )
}

/**
 * 카메라 연출 (PLAN §7.4).
 *
 * 배틀에서 일어나는 일을 보고 샷을 컷한다 — 기술을 쓰면 어깨 너머, 맞으면
 * 클로즈업, 쓰러지면 로우앵글. 샷이 끝나면 기본 샷으로 돌아온다.
 *
 * ⚠️ **설정의 "배틀 애니메이션"을 여기서 본다.** 원작의 그 항목은 연출을 통째로
 * 건너뛰어 배틀을 빠르게 만드는 것이라, 끄면 카메라도 기본 샷에 붙박이가 된다.
 * 그동안 값만 저장되고 아무 데도 안 걸려 있던 항목이다
 */
function useBattleCamera(fit: number): void {
  const director = useRef(new ShotDirector())
  const scene = useOptionsStore((s) => s.battleScene)
  const cast = useBattleStore((s) => s.view?.lastMove ?? null)
  const struck = useBattleStore((s) => s.view?.lastHit ?? null)
  const active = useBattleStore((s) => s.view?.active ?? null)

  /** 두 번 같은 일로 컷하지 않게, 방금 본 것을 기억한다 */
  const seen = useRef({ move: -1, hit: -1, out: '', down: '00' })

  const cut = (name: ShotName, side: Side): void => {
    if (scene === SHOW_SCENE) director.current.cut(name, side)
  }

  useEffect(() => {
    if (!cast || cast.seq === seen.current.move) return
    seen.current.move = cast.seq
    cut('oncoming', cast.by)
  })

  useEffect(() => {
    if (!struck || struck.seq === seen.current.hit) return
    seen.current.hit = struck.seq
    cut('impact', struck.side)
  })

  // 등판과 기절. 어느 쪽이 바뀌었는지는 종족 번호와 체력으로 안다
  useEffect(() => {
    if (!active) return
    const out = SIDES.map((side) => String(active[side]?.species ?? '')).join('/')
    const was = seen.current.out.split('/')
    if (out !== seen.current.out) {
      const changed = SIDES.filter((side, i) => String(active[side]?.species ?? '') !== was[i])
      const first = seen.current.out === ''
      seen.current.out = out
      // ⚠️ 첫 등판에는 컷하지 않는다. 배틀이 열리는 순간이라 두 자리가 한꺼번에
      // 차는데, 그때 등판 샷을 걸면 무대가 서기도 전에 카메라가 한쪽으로 붙는다
      if (!first && changed[0]) cut('switchIn', changed[0])
    }
    const down = SIDES.map((side) => ((active[side]?.hp ?? 1) <= 0 ? '1' : '0')).join('')
    if (down !== seen.current.down) {
      const fell = SIDES.filter((_, i) => down[i] === '1' && seen.current.down[i] !== '1')
      seen.current.down = down
      if (fell[0]) cut('faint', fell[0])
    }
  })

  useFrame((_, delta) => {
    const frame = scene === SHOW_SCENE
      ? director.current.advance(delta)
      : sampleShot(shotFor('establish', 'p1'), 0)
    // 흔들림은 방향을 여기서 정한다 — 엔진이 난수를 들고 있을 이유가 없다
    const jitter = frame.shake === 0 ? 0 : Math.sin(performance.now() / 17) * frame.shake
    // ⚠️ **좁은 무대에서는 카메라를 당긴다.** 샷은 풀밭(반지름 12m) 기준으로
    // 적혀 있는데 실내 무대는 12×18m짜리 방이라, 그대로 두면 카메라가 벽 밖
    // 천장 위에 선다. 바라보는 자리는 그대로 두고 거리만 줄인다
    const [lx, ly, lz] = frame.look
    battleStage.position
      .set(
        lx + (frame.position[0] - lx) * fit + jitter,
        ly + (frame.position[1] - ly) * fit + jitter * 0.6,
        lz + (frame.position[2] - lz) * fit,
      )
      .add(STAGE_ORIGIN)
    battleStage.target.set(lx, ly, lz).add(STAGE_ORIGIN)
  })
}

/** 설정의 "배틀 애니메이션"에서 **보는** 쪽 값 (`options_menu` 뱅크 13번) */
const SHOW_SCENE = 0

const SIDES: readonly Side[] = ['p1', 'p2']
