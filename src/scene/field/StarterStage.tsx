// 파트너 고르는 장면의 3D 무대 (`choose_starter/choose_starter_app.c`)
//
// **오버월드와 같은 Canvas를 쓴다.** 영속 Canvas 불변식(PLAN §3.3)이라 캔버스를
// 따로 띄울 수 없고, 배틀 무대(`battle/BattleStage`)가 이미 같은 방식이다 —
// 무대를 신오에서 멀리 떨어뜨려 놓고(`STARTER_ORIGIN`) 카메라만 옮긴다.
//
// 모델 여섯과 관절 애니 넷은 롬에서 구운 것이다(`import/platinum/starterScene`). 자리·각도·
// 카메라는 `ui/field/starterScene`이 원작 소스에서 그대로 옮겨 온 값이다.
//
// **애니는 원작이 붙인 그대로 늘 붙어 있다** (`Load3DGraphics` → `NNS_G3dRenderObjAddAnmObj`).
// 그래서 덮인 가방도 볼도 쉴 때조차 **애니 0프레임**의 자세로 선다 — 모델의 기본 자세가
// 아니다. 실측으로 둘이 다르다: 덮인 가방의 그림자·볼 노드 셋(1·6·8)과 오른쪽 볼의
// `psel_mb_c_`가 기본 자세와 0프레임의 돌림이 어긋난다.
//
//     덮인 가방   `psel_all`을 `bagClock.since`부터 한 틱에 한 프레임 (41프레임) — 볼 셋과
//                 그림자가 튀어나와 제자리에 앉고 아래짝이 눕는다. 마지막 프레임에서 열린
//                 가방 + 볼 셋으로 갈아 끼운다 (`opened` · 원작도 `Set3DGraphicsIsVisible`로 바꾼다)
//     볼 셋       고른 것만 `psel_mb_*`(73프레임)를 고리로 돌리고 나머지는 0프레임
//                 (`UpdateSelectedPokeballAnimation`). 커서를 띄운 동안
//                 (`CHOOSE_STARTER_STEP_CHANGE_POKEBALL`)만 넘긴다 — 확인을 묻는 동안은 멎는다
//
// ⚠️ **빛을 안 건다.** 원작이 `NNS_G3dGlbLightColor(0, GX_RGB(31,31,31))`에
// 재질 확산·환경도 다 흰색이라 사실상 무광이다. 여기서 조명을 넣으면 그건
// 우리가 만든 명암이고, three의 광원은 씬 전체에 걸려서 신오까지 밝아진다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import {
  loadStarterMesh,
  loadStarterSheet,
  type ChunkMesh,
} from '../chunkMesh'
import { STARTER_ORIGIN, starterStage } from '../battle/stageRefs'
import {
  BALL_POSITION,
  CAMERA_CHOOSE,
  CAMERA_OPEN,
  CAMERA_FRAMES,
  FRAME_MS,
  GROUND_PLACE,
  STARTER_MODEL,
  bagClock,
  cameraPosition,
  cursorShot,
  depthOf,
  pixelAt,
  screenToWorld,
  type CameraShot,
} from '../../ui/field/starterScene'
import { starterScene } from './starterRefs'
import { STARTERS } from '../../ui/field/starterChoice'
import { StarterMon } from './StarterMon'
import { propMaterials } from '../propMeshes'
import { nodeMatricesAt, splitByNode, type NodeBase } from '../propAnim'
import { readNsbca, type JntAnim } from '../../import/platinum/nsbca'
import { assets, readJson } from '../../data/providers/assetProvider'
import { POINTER_HAND_ATLAS } from '../../data/gameData'
import { retireTexture } from '../retireTexture'

/**
 * DS 단위 → 우리 타일.
 *
 * 원작 값이 볼 간격 82 · 카메라 거리 200쯤이라 그대로 두면 카메라가 far(200)에
 * 걸려 아무것도 안 보인다. 카메라와 무대에 **같은 배수**를 곱하므로 화면은
 * 한 픽셀도 안 달라진다
 */
const UNIT = 1 / 50

/**
 * ⚠️ **구운 모델은 타일이고 배치 상수는 DS 유닛이다.**
 *
 * 소품·청크와 같은 굽는 길을 쓰는데(`chunks.js`), 그쪽이 마지막에
 * `pos / UNITS_PER_TILE`로 **타일**로 바꿔 놓는다(`chunks/index.json`의
 * `unitsPerTile: 16`). 그런데 `ui/field/starterScene`의 자리·카메라는 원작
 * 소스에서 그대로 옮긴 **DS 유닛**이다. 그대로 두면 무대가 16분의 1이라
 * 화면에서 사라진다 — 실제로 그랬다.
 *
 * 잰 값으로 확인된다: 열린 가방이 x ±4.8 · z −1.6~7.3타일인데, 여기에 16을
 * 곱해야(x ±76.8 · z −25.6~116.8) 볼 셋(−44·0·38, z 26~62)이 가방 **안**에
 * 들어간다. 안 곱하면 볼이 가방 바깥 수십 배 거리에 흩어진다
 */
const TILE_TO_DS = 16

/** 뒤를 덮는 판까지의 거리(DS 단위). 볼 중 제일 먼 것보다 뒤면 된다 */
const BACKDROP = 260

interface Loaded {
  id: number
  mesh: ChunkMesh
  geometry: BufferGeometry
  materials: Material[]
}

/** 관절 애니를 되돌리는 데 드는 모델 속살 (`propModelInfo` + 늘 싣는 노드 사슬) */
interface ModelInfo {
  submeshNodes: readonly number[]
  nodes: readonly NodeBase[]
  parents: readonly number[]
}

/** 애니가 붙은 모델 하나 — 속살과 푼 클립 */
interface Rig {
  info: ModelInfo
  anim: JntAnim
}

/** `starter/index.json`에서 이 무대가 읽는 칸 */
interface StarterIndex {
  /** `anims.bin` 안의 `[자리, 길이]`. 열쇠가 모델 번호다 */
  anims: Record<string, [number, number]>
  info: Record<string, ModelInfo>
}

/** 애니 넷을 푼다. 하나를 못 읽으면 그 모델만 기본 자세로 선다 — 고르기는 그대로 된다 */
async function loadRigs(): Promise<Map<number, Rig>> {
  const [index, buffer] = await Promise.all([
    readJson(assets(), 'data/starter/index.json') as Promise<StarterIndex>,
    assets().bytes('data/starter/anims.bin'),
  ])
  const bytes = new Uint8Array(buffer)
  const out = new Map<number, Rig>()
  for (const [id, [at, size]] of Object.entries(index.anims)) {
    const info = index.info[id]
    const anim = readNsbca(bytes.subarray(at, at + size))[0]
    if (info && anim) out.set(Number(id), { info, anim })
  }
  return out
}

/** 원작 프레임 수만큼 0→1로 가는 값 */
function ramp(elapsedMs: number, frames: number): number {
  return Math.min(1, elapsedMs / (frames * FRAME_MS))
}

function lerpShot(a: CameraShot, b: CameraShot, t: number): CameraShot {
  return {
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    target: [
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t,
    ],
  }
}

/** 덮인 가방의 프레임 — 열기 시작한 틱부터 한 틱에 하나 (`Advance3DGraphicsAnimationIfNotLastFrame`) */
function bagFrame(): number {
  const since = bagClock.since
  if (since === null) return 0
  return Math.max(0, Math.floor((performance.now() - since) / FRAME_MS))
}

export function StarterStage() {
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [rigs, setRigs] = useState<ReadonlyMap<number, Rig>>(new Map())
  const caseClosed = useRef<Group>(null)
  const caseOpen = useRef<Group>(null)
  const balls = useRef<Group>(null)
  /** 고른 볼이 돈 시간(ms) — 커서를 띄운 동안만 쌓고, 고른 볼이 바뀌면 0부터 */
  const ballTime = useRef({ ms: 0, pick: -1 })

  useEffect(() => {
    let alive = true
    void loadRigs()
      .then((got) => {
        if (alive) setRigs(got)
      })
      .catch(() => { /* 애니가 없으면 기본 자세로 선다 */ })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const wanted = [
      STARTER_MODEL.caseClosed,
      STARTER_MODEL.caseOpen,
      ...STARTER_MODEL.balls,
      STARTER_MODEL.ground,
    ]
    void Promise.all(
      wanted.map((id) =>
        Promise.all([loadStarterMesh(id), loadStarterSheet(id)])
          .then(([mesh, sheet]): Loaded => ({
            id,
            mesh,
            geometry: mesh.geometry,
            materials: propMaterials(mesh, sheet),
          }))
          .catch(() => null),
      ),
    )
      .then((got) => {
        if (alive) setLoaded(got.filter((v) => v !== null))
      })
      .catch(() => {
        if (alive) setLoaded([])
      })
    return () => {
      alive = false
    }
  }, [])

  // 카메라를 가져간다. 화면에 있는 동안만이다 — 나가면 필드가 도로 갖는다
  useEffect(() => {
    starterStage.active = true
    return () => {
      starterStage.active = false
    }
  }, [])

  useFrame((_, delta) => {
    const scene = starterScene
    // 고른 볼의 시계. 원작은 고른 것만 한 틱씩 넘기고 나머지는 매 틱 0으로 되돌린다 —
    // 그래서 새로 고른 볼은 늘 0프레임에서 시작한다
    const clock = ballTime.current
    if (clock.pick !== scene.pick) {
      clock.pick = scene.pick
      clock.ms = 0
    }
    if (scene.opened && scene.cursorShown) clock.ms += delta * 1000
    // 가방이 열리기 전에는 처음 자리, 고르기 시작하면 6프레임에 걸쳐 옮겨 간다.
    // 원작 `AdvanceStarterMovement`가 선형이다
    const shot =
      scene.camera === 'open'
        ? CAMERA_OPEN
        : lerpShot(CAMERA_OPEN, CAMERA_CHOOSE, ramp(scene.cameraSince, CAMERA_FRAMES))
    const [ex, ey, ez] = cameraPosition(shot)
    starterStage.position.set(
      STARTER_ORIGIN.x + ex * UNIT,
      STARTER_ORIGIN.y + ey * UNIT,
      STARTER_ORIGIN.z + ez * UNIT,
    )
    starterStage.target.set(
      STARTER_ORIGIN.x + shot.target[0] * UNIT,
      STARTER_ORIGIN.y + shot.target[1] * UNIT,
      STARTER_ORIGIN.z + shot.target[2] * UNIT,
    )
    if (caseClosed.current) caseClosed.current.visible = !scene.opened
    if (caseOpen.current) caseOpen.current.visible = scene.opened
    if (balls.current) balls.current.visible = scene.opened
  })

  const by = useMemo(() => new Map(loaded.map((l) => [l.id, l])), [loaded])
  const piece = (id: number): Loaded | undefined => by.get(id)

  const ground = piece(STARTER_MODEL.ground)
  const closed = piece(STARTER_MODEL.caseClosed)
  const open = piece(STARTER_MODEL.caseOpen)

  /** 볼 `at`의 프레임 — 고른 볼만 돌고 고리로 되돈다 (`Advance3DGraphicsAnimationOnLoop`) */
  const ballFrame = (at: number, frames: number): number => {
    if (starterScene.pick !== at) return 0
    return Math.floor(ballTime.current.ms / FRAME_MS) % frames
  }

  return (
    <>
    <group position={STARTER_ORIGIN} scale={UNIT}>
      {/*
        뒤를 덮는다. 이 무대가 신오 위에 떠 있어서 안 덮으면 하늘 돔과 먼 지형이
        비친다. 원작은 필드 화면을 알파로 섞어 두지만, 우리는 이 장면에 들어오기
        전에 `FadeScreenOut`으로 이미 화면을 껐다
      */}
      <mesh position={[0, 0, -BACKDROP]} scale={[1200, 900, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#0a0d16" fog={false} side={BackSide} />
      </mesh>
      {ground && (
        <group
          position={GROUND_PLACE.position as unknown as [number, number, number]}
          scale={GROUND_PLACE.scale as unknown as [number, number, number]}
          rotation={[0, GROUND_PLACE.rotationY, 0]}
        >
          <mesh geometry={ground.geometry} material={ground.materials} scale={TILE_TO_DS} />
        </group>
      )}
      <group ref={caseClosed}>
        {closed && (
          <Rigged model={closed} rig={rigs.get(STARTER_MODEL.caseClosed) ?? null} frame={bagFrame} />
        )}
      </group>
      <group ref={caseOpen} visible={false}>
        {open && <mesh geometry={open.geometry} material={open.materials} scale={TILE_TO_DS} />}
      </group>
      <group ref={balls} visible={false}>
        {STARTER_MODEL.balls.map((id, at) => {
          const ball = piece(id)
          if (!ball) return null
          return (
            <group key={id} position={BALL_POSITION[at] as unknown as [number, number, number]}>
              <Rigged
                model={ball}
                rig={rigs.get(id) ?? null}
                frame={(frames) => ballFrame(at, frames)}
              />
            </group>
          )
        })}
      </group>
      <BallCursor />
    </group>
    {/*
      ⚠️ **미리보기는 이 무대 밖이다.** 위 묶음은 DS 유닛이라 50분의 1로 줄여
      두었는데(`UNIT`), 미리보기는 세상이 아니라 **카메라 앞**에 서므로 그 배수를
      먹으면 안 된다 — 자리도 크기도 매 프레임 화각에서 되돌려 잰다
    */}
    {STARTERS.map((species, at) => (
      <StarterMon key={species} species={species} at={at} />
    ))}
    </>
  )
}

/**
 * 애니가 붙은 모델 하나 — 노드마다 쪼개어 그룹 행렬로 움직인다 (`AnimatedProp`과 같은 길).
 *
 * 굽는 쪽이 노드 기본 자세를 정점에 발라 두었으므로 그룹 행렬은 `애니 × 기본⁻¹`이다
 * (`nodeMatricesAt`). 노드 사슬을 늘 따른다 — 볼은 맨 위 노드(`mb_null_*`)가 x로
 * 흔들리고 볼·그림자가 그 자식이다
 *
 * @param frame 클립 길이를 받아 이 틱의 프레임을 돌려준다. 끝을 넘으면 마지막에서 멎는다
 */
function Rigged({ model, rig, frame }: {
  model: Loaded
  rig: Rig | null
  frame: (frames: number) => number
}) {
  const parts = useMemo(
    () => (rig ? splitByNode(model.mesh, rig.info.submeshNodes) : null),
    [rig, model.mesh],
  )
  const groups = useRef(new Map<number, Group>())

  useFrame(() => {
    if (!rig) return
    const at = Math.min(rig.anim.frames - 1, frame(rig.anim.frames))
    const mats = nodeMatricesAt(rig.info, rig.anim, groups.current.keys(), at)
    for (const [node, group] of groups.current) {
      const mat = mats.get(node)
      if (!mat) continue
      // `decompose`로 넘기지 않는다 — 행렬을 그대로 얹는다 (`AnimatedProp`의 미닫이 주석)
      group.matrixAutoUpdate = false
      group.matrix.copy(mat)
      group.matrixWorldNeedsUpdate = true
    }
  })

  if (!parts) {
    return <mesh geometry={model.geometry} material={model.materials} scale={TILE_TO_DS} />
  }
  return (
    <group scale={TILE_TO_DS}>
      {[...parts].map(([node, geometry]) => (
        <group key={node} ref={(g) => { if (g) groups.current.set(node, g) }}>
          <mesh geometry={geometry} material={model.materials} />
        </group>
      ))}
    </group>
  )
}

/**
 * 커서 — 원작 스프라이트(`ev_pokeselect` 10~13번)를 판 한 장에 붙인다.
 *
 * 그 넷은 포획 강좌의 가리키는 손(`battle/indicator.c`의 `Indicator_LoadResources`)과
 * **같은 칸 · 같은 팔레트 한 줄**이라 따로 굽지 않고 `pointerHand.png`(32×32 한 장 ·
 * 가운데가 원점)를 그대로 쓴다.
 *
 * 원작은 화면에 바로 찍는 2D라 **화면 좌표**(`otherSelectionMatrix`)에 놓고 32프레임마다
 * 8픽셀 오르내린다(`cursorShot`). 여기서는 그 화면 점을 고른 볼의 깊이로 되돌려
 * (`screenToWorld`) 시선에 수직인 판을 세운다 — 깊이가 같은 판이라 원작 화면의 그 픽셀
 * 자리·크기에 그대로 찍힌다. 커서는 고르는 동안만 뜨고(카메라는 이미 `CAMERA_CHOOSE`에
 * 멎었다), 원작처럼 3D 위에 그린다(깊이를 안 본다)
 */
function BallCursor() {
  const ref = useRef<Mesh>(null)
  /** 떠다니는 박자는 화면을 연 순간부터 센다 (`StartCursorMovement`가 `Init`에서 선다) */
  const born = useRef(performance.now())
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    let alive = true
    let made: Texture | null = null
    const provider = assets()
    void provider.objectUrl(POINTER_HAND_ATLAS)
      .then((url) => new TextureLoader().loadAsync(url)
        .finally(() => { provider.releaseObjectUrl(POINTER_HAND_ATLAS) }))
      .then((tex) => {
        // 이름은 GPU 라벨로 그대로 간다 (REPAIR §48)
        tex.name = 'starter-cursor'
        tex.magFilter = NearestFilter
        tex.minFilter = NearestFilter
        tex.generateMipmaps = false
        tex.colorSpace = SRGBColorSpace
        made = tex
        if (alive) setTexture(tex)
        else retireTexture(tex)
      })
      .catch(() => { /* 그림이 없으면 커서 없이 고른다 — 고른 볼은 흔들림과 글로 보인다 */ })
    return () => {
      alive = false
      if (made) retireTexture(made)
    }
  }, [])

  const material = useMemo(() => new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.5,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  }), [texture])
  useEffect(() => () => { material.dispose() }, [material])
  const plane = useMemo(() => new PlaneGeometry(1, 1), [])
  useEffect(() => () => { plane.dispose() }, [plane])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const at = starterScene.pick
    const on = starterScene.opened && starterScene.cursorShown && texture !== null
    mesh.visible = on
    if (!on) return
    const image = texture.image as { width?: number } | null
    const size = image?.width ?? 0
    const ball = BALL_POSITION[at] ?? BALL_POSITION[0]!
    const depth = depthOf(ball, CAMERA_CHOOSE)
    const frames = (performance.now() - born.current) / FRAME_MS
    const [x, y, z] = screenToWorld(cursorShot(at, frames), depth, CAMERA_CHOOSE)
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(size * pixelAt(depth))
  })

  return (
    <mesh
      ref={ref}
      geometry={plane}
      material={material}
      // 시선에 수직으로 — 판의 위가 카메라의 위 `(0, cos, −sin)`가 되게 x축으로 −pitch
      rotation={[(-CAMERA_CHOOSE.pitch * Math.PI) / 180, 0, 0]}
      renderOrder={10}
      visible={false}
    />
  )
}
