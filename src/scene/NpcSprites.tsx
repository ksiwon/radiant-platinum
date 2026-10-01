// 오버월드 NPC — 원작 그림을 그대로 세운다 (DATA.md §2.16)
//
// 원작이 판때기에 텍스처를 갈아 끼우는 방식이라 우리도 그렇게 한다. 3D 모델을
// 새로 만들면 그건 우리 그림이지 원작이 아니다.
//
// 인스턴싱을 안 쓰는 이유: 사람마다 **텍스처가 다르고 장도 따로 논다.** 인스턴스
// 하나하나에 다른 텍스처를 물리려면 아틀라스를 통째로 합치고 셰이더를 따로
// 써야 하는데, 한 맵에 서 있는 사람은 많아야 수십이라 그럴 값어치가 없다.
// 대신 판때기와 재질은 **한 번 만들어 돌려 쓴다** — 프레임마다 만들면 GC가 돈다.
//
// ⚠️ **바위 둘만은 판때기로 안 세운다** — 괴력 바위(`STRENGTH_BOULDER` 84)와
// 바위깨기 바위(`ROCK_SMASH` 85). 둘 다 동굴 바닥에 깔리는데(배치표 50 · 591)
// 판때기면 BDSP 동굴 바닥 위에 늘 정면을 보는 도트 종잇장이 서고, 1인칭으로
// 다가가면 계단 픽셀 판이 된다. 맵 바위(`Rocks`)와 같은 덩이 모양(`rockShape`)에
// **그 그림을 그대로** 입힌다(`rockPaint`) — 모양만 우리 것이고 폭·높이·문양은
// 원작 그림에서 온다. 그림이 아직 안 왔으면 판때기로 선다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace,
  type DirectionalLight, type HemisphereLight, type Object3D,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { disguiseOf } from '../engine/actor/ambient'
import {
  artDir, cameraQuadrant, castsFootShadow, darknessTint, footShadow, footShadowOpacity,
  frameOf, hidesFootShadow, npcSprite, plateQuadrant, SHADOW_OFFSET, stepFootShadow,
  TEXELS_PER_TILE, type NpcSprite,
} from '../engine/actor/sprites'
import { firstPersonView } from '../engine/actor/camera'
import { timeOfDayForHour } from '../engine/map/timeOfDay'
import { npcTexture } from './npcTexture'
import { faceCamera, hideRest } from './billboard'
import { FILL_DIR, litBody, makeBlobShadow, TIME_LOOKS, type TimeLook } from './fx/sky'
import { worldState } from '../state/worldState'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { rockUvs, spriteRockCrop } from './rockPaint'
import {
  ROCK_RECIPES, rockAspect, rockPositions, rockSpan, rockSpin, rockVariant,
} from './rockShape'

/** 한 맵에 동시에 세우는 최대 인원. 넘치는 사람은 안 그린다 */
const MAX = 64
/** 그리는 거리(타일) */
const RANGE = 48
/**
 * 걸음 한 칸에 도는 틱.
 *
 * 원작 판때기는 프레임마다 한 틱씩 나아간다(60Hz). 우리는 초 단위로 재므로
 * 같은 속도가 되도록 60을 곱한다
 */
const TICKS_PER_SECOND = 60
/** 서 있는 사람도 조금씩 움직이면 살아 보이지만, 원작은 안 움직인다 */
const IDLE_TICK = 0

/**
 * 발밑 그림자 원판의 한 변(칸). 시간대 배율(`SHADOW_SCALE`)이 여기에 곱해진다.
 *
 * **원작 값이다.** 그림자는 `fldeff.narc` 0x11번 모델이다 — `ov5_021F14FC`가
 * 0x11·0x12·0x13 셋을 읽고 `ov5_021F1670`이 그중 첫째를 그린다. 그 멤버의 모델
 * 이름이 `kage`(그림자)이고, 화면 목록을 풀면 **±8유닛 정사각형 한 장**이다
 * (위치 배율 2.0 · 꼭짓점 12 · 사각형 넷 · 텍스처 16×16). 한 칸이 16유닛이니
 * 딱 한 칸이다. 구운 `distortionProps/28.bin`(같은 17번)도 꼭짓점이 x·z ±0.5칸 ·
 * y +3/16칸이고 재질이 `kage`/`kage_pl` 하나다.
 *
 * ⚠️ 나무열매 밭(`BerryPatchManager_Init3DRendering`)도 같은 17번을 읽지만
 * **그리지 않는다** — 그 모델은 `BerryPatches_IsInView`의 화면 안 검사
 * (`GFXBoxTest_IsModelInView`) 상자로만 쓰인다. 밭의 흙이 아니다
 *
 * ⚠️ **그림만 우리 것이다.** `kage` 텍스처를 굽지 않아서 감쇠 원판
 * (`makeBlobShadow`)을 깐다
 */
const SHADOW_SIZE = 1
/**
 * 땅에서 띄우는 높이. 딱 붙이면 땅과 깊이가 겹쳐 깜빡인다.
 *
 * ⚠️ **우리 값이다.** 원작은 사람 자리에서 y −4유닛에 그리고(`ov5_021F1670`) 판이
 * 모델 안에서 +3유닛에 있어서 사람 자리보다 1유닛 아래다. 우리 땅 높이
 * (`groundYAt`)는 바닥 그 자체라 아래로 내리면 묻힌다
 */
const SHADOW_LIFT = 0.02

/** 판때기 대신 입체 덩이로 세우는 그림 (`OBJ_EVENT_GFX_`를 뗀 이름) */
const ROCK_SPRITES: ReadonlySet<string> = new Set(['STRENGTH_BOULDER', 'ROCK_SMASH'])
/**
 * 밑을 이만큼 땅에 묻는다 (높이 배수). `Rocks`의 `ROCK_SINK`와 같은 값이다 —
 * 딱 얹어 두면 바닥과의 경계가 칼로 자른 듯 떨어진다
 */
const ROCK_SINK = 0.10

/** 바위 그림 하나로 만든 덩이 한 벌. 같은 그림의 바위가 다 같이 쓴다 */
interface RockKit {
  /** 변주마다 모양 (`ROCK_RECIPES` 차례) */
  shapes: BufferGeometry[]
  /** 변주마다 곱할 배율 — 실제 폭(`rockSpan`)이 그림의 불투명한 폭이 되게 한다 */
  scales: number[]
  material: MeshLambertMaterial
}

/**
 * 그림 번호 → 덩이 한 벌. `null`은 **못 만든 것**이다 — 그 바위는 판때기로 선다.
 *
 * 맵을 옮겨도 버리지 않는다. 그림이 둘뿐이고 동굴마다 다시 나온다 (`Rocks`의
 * 모양·재질 표와 같다)
 */
const rockKits = new Map<number, RockKit | null>()

/** 그림의 RGBA를 읽는다. 캔버스가 없거나 막히면 `null` */
function readPixels(image: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const ctx = canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (ctx === null) return null
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }
}

/**
 * 바위 그림의 덩이 한 벌.
 *
 * 폭은 **그림 상자에서 잰다** — 상자가 `sprite.w / 16`칸이고(원작
 * `rock_smash.nsbmd`는 `generic_16x16.nsbmd`와 바이트까지 같은 16×16유닛 판이고
 * 재질 이름만 `breakrock`이다) 그중 불투명한 칸의 비율만큼이 바위다. 두 그림 다
 * 16칸 중 14칸이라 **0.875칸**이다. 높이는 그 실루엣에서 `rockAspect`가 낸다
 * (둘 다 14/16 · 14/16이라 폭의 0.414배, 0.36칸).
 *
 * 그림이 아직 안 왔으면 `undefined`다 — 다음 프레임에 다시 본다
 */
function rockKitOf(gfx: number, sprite: NpcSprite): RockKit | null | undefined {
  const had = rockKits.get(gfx)
  if (had !== undefined) return had
  const image = npcTexture(gfx).image as (CanvasImageSource & { width?: number, height?: number }) | null
  const w = image?.width ?? 0, h = image?.height ?? 0
  if (image === null || w <= 0 || h <= 0) return undefined
  const pixels = readPixels(image, w, h)
  const crop = pixels === null ? null : spriteRockCrop(pixels, w, h, sprite.w, sprite.h)
  if (crop === null) {
    rockKits.set(gfx, null)
    return null
  }
  const aspect = rockAspect(crop.rows, crop.cols)
  const width = (sprite.w / TEXELS_PER_TILE) * crop.cols
  const map = new DataTexture(crop.pixels, crop.width, crop.height)
  // 원작 도트다. 선형 보간을 걸면 4세대 특유의 또렷함이 사라진다
  map.magFilter = NearestFilter
  map.colorSpace = SRGBColorSpace
  map.name = `rock ${sprite.name}`
  map.needsUpdate = true
  const shapes: BufferGeometry[] = []
  const scales: number[] = []
  for (const recipe of ROCK_RECIPES) {
    const span = rockSpan(recipe)
    // 폭 1 덩이가 실제로는 `span`만큼 퍼진다. 높이도 그만큼 늘려 두고 통째로
    // `width / span`배 하면 폭은 `width`, 높이는 `aspect × width`가 된다
    const tall = aspect * span
    const position = rockPositions(recipe, tall, ROCK_SINK)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(position, 3))
    geo.setAttribute('uv', new BufferAttribute(rockUvs(position, tall), 2))
    // 비인덱스라 면마다 제 법선이 나온다 — 능선이 각진다
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    shapes.push(geo)
    scales.push(width / span)
  }
  const kit: RockKit = { shapes, scales, material: new MeshLambertMaterial({ map }) }
  rockKits.set(gfx, kit)
  return kit
}

/** 입체 바위 하나 몫 */
interface Rock {
  mesh: Mesh
  /** `그림/변주`. 자리를 뜨면 이 이름의 통으로 돌아간다 */
  kind: string
  /** 마지막으로 선 프레임 */
  seen: number
}

/** 낮의 몸빛 — 판때기 밝기의 기준 1이다 */
const DAY_BODY = litBody(TIME_LOOKS[1]!)

/** 판때기 밝기를 정하는 빛 다섯. `MapStreamer`가 `lit`으로 켠 그 값들이다 */
type PlateLight = Pick<TimeLook, 'ambient' | 'skyColor' | 'sun' | 'sunColor' | 'fill'>

/**
 * 판때기가 받을 밝기. **낮을 1로 둔 몸빛의 비**다.
 *
 * ⚠️ **판때기는 빛을 안 받는 재질이다** (`MeshBasicMaterial`). 그대로 두면 밤과
 * 동굴에서 입체 사람과 땅은 어두운데 판때기 사람만 낮 밝기로 떠 있다. 램버트로
 * 바꾸면 해의 방향이 판 한 장을 고르지 않게 칠해서 도트 그림이 얼룩지므로, 색에
 * 밝기 하나만 곱한다.
 *
 * 입체 사람과 같은 잣대를 쓴다 — `litBody`는 키 라이트까지 얹은 몸빛이라 밤에도
 * 낮의 `NIGHT_FLOOR`(42%) 아래로 안 내려간다. 낮은 정확히 1이라 낮 화면은
 * 전과 같다
 */
export function plateShade(light: PlateLight): number {
  return litBody({ ...TIME_LOOKS[1]!, ...light }) / DAY_BODY
}

/**
 * 같은 맵의 빛을 읽어 판때기 밝기를 낸다. 빛을 못 찾으면 1이다.
 *
 * ⚠️ **시간대를 따로 셈하지 않는다.** 실내는 시간대를 안 타고(`MapStreamer`의
 * `lit`), 던전은 바깥 배경을 따르는 것이 있어서 여기서 다시 고르면 조용히
 * 어긋난다. 그래서 `MapStreamer`가 **실제로 켠** 반구광 · 태양 · 필을 읽는다 —
 * 셋 다 판때기 무리와 같은 부모 밑에 있다
 */
export function sceneShade(from: Object3D | null): number {
  const siblings = from?.parent?.children
  if (siblings === undefined) return 1
  let hemi: HemisphereLight | null = null
  let sun: DirectionalLight | null = null
  let fill: DirectionalLight | null = null
  for (const o of siblings) {
    if ((o as HemisphereLight).isHemisphereLight === true) hemi = o as HemisphereLight
    else if ((o as DirectionalLight).isDirectionalLight === true) {
      const d = o as DirectionalLight
      // 그림자를 던지는 것은 태양 하나뿐이다. 필은 자리로 가린다 (`FILL_DIR`)
      if (d.castShadow) sun = d
      else if (d.position.x === FILL_DIR[0] && d.position.y === FILL_DIR[1]
        && d.position.z === FILL_DIR[2]) fill = d
    }
  }
  if (hemi === null || sun === null) return 1
  return plateShade({
    ambient: hemi.intensity,
    skyColor: `#${hemi.color.getHexString()}`,
    sun: sun.intensity,
    sunColor: `#${sun.color.getHexString()}`,
    fill: fill?.intensity ?? 0,
  })
}

/** 판때기 하나 몫의 상태 */
interface Slot {
  mesh: Mesh
  material: MeshBasicMaterial
  uv: BufferAttribute
  /** 지금 물려 있는 것. 안 바뀌었으면 UV를 다시 안 쓴다 */
  gfx: number
  frame: number
  /** 발밑 그림자. 판과 같이 서고 같이 숨는다 */
  shadow: Mesh
}

/** 그림자 원판 한 벌. 판때기마다 메시만 따로고 모양·재질은 같이 쓴다 */
interface ShadowKit { geometry: PlaneGeometry; material: MeshBasicMaterial }

function makeShadowKit(): ShadowKit {
  // 바닥에 눕는다. `PlaneGeometry`는 xy 평면이라 x축으로 눕혀야 xz가 된다
  const geometry = new PlaneGeometry(SHADOW_SIZE, SHADOW_SIZE)
  geometry.rotateX(-Math.PI / 2)
  const map = makeBlobShadow()
  const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false })
  // 그림이 없으면 흰 네모가 깔린다 — 아예 안 그린다
  material.visible = map !== null
  return { geometry, material }
}

function makeSlot(kit: ShadowKit): Slot {
  // 바닥에 발이 닿도록 원점을 아래 모서리에 둔다 — 키가 제각각이라 중심을 맞추면
  // 큰 사람이 땅에 파묻힌다
  const geometry = new PlaneGeometry(1, 1)
  geometry.translate(0, 0.5, 0)
  const material = new MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.5,   // 반투명 정렬 대신 잘라낸다. 도트 그림이라 경계가 뚜렷하다
    side: DoubleSide,
    depthWrite: true,
  })
  const mesh = new Mesh(geometry, material)
  mesh.visible = false
  mesh.frustumCulled = false // 자리를 매 프레임 바꾸므로 경계구가 못 따라온다
  const shadow = new Mesh(kit.geometry, kit.material)
  shadow.visible = false
  shadow.frustumCulled = false
  return {
    mesh, material,
    uv: geometry.getAttribute('uv') as BufferAttribute,
    gfx: -1, frame: -1,
    shadow,
  }
}

/** 아틀라스에서 `frame`번째 칸만 보이게 UV를 옮긴다 */
function setFrame(slot: Slot, sprite: NpcSprite, frame: number): void {
  const span = 1 / sprite.frames
  const x0 = frame * span
  const x1 = x0 + span
  const uv = slot.uv
  // PlaneGeometry의 정점 차례는 좌상·우상·좌하·우하다
  uv.setXY(0, x0, 1); uv.setXY(1, x1, 1)
  uv.setXY(2, x0, 0); uv.setXY(3, x1, 0)
  uv.needsUpdate = true
}

interface Props {
  grid: MapGrid
  layer: number
  /**
   * 입체 모델이 이미 세운 사람들. 여기 든 사람은 판때기를 안 세운다.
   *
   * "모델이 있는 그림"이 아니라 **실제로 선 사람**이어야 한다 — 모델 쪽에도
   * 상한이 있어서, 넘친 사람은 판때기로라도 서야 한다
   */
  standing?: ReadonlySet<NpcActor>
}

export function NpcSprites({ grid, layer, standing }: Props) {
  const groupRef = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const kit = useMemo(makeShadowKit, [])
  const slots = useMemo(() => Array.from({ length: MAX }, () => makeSlot(kit)), [kit])
  /** 사람마다 걸어온 시간. 배치표 번호가 아니라 배우로 잡는다 */
  const walked = useRef(new WeakMap<NpcActor, number>())
  /** 그림자 모양. 원작처럼 모두가 하나를 같이 본다 (`ov5_021F134C`) */
  const foot = useRef(footShadow())
  /**
   * 지금 선 입체 바위. 배우마다 하나다 — 밀리는 괴력 바위가 제 덩이를 끌고 간다.
   * 자리를 뜬 덩이는 `spareRocks`에 두었다가 같은 모양의 다음 바위가 쓴다
   */
  const rocks = useMemo(() => new Map<NpcActor, Rock>(), [])
  const spareRocks = useMemo(() => new Map<string, Rock[]>(), [])
  const frameNo = useRef(0)

  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    for (const s of slots) group.add(s.mesh, s.shadow)
    return () => {
      for (const s of slots) {
        group.remove(s.mesh, s.shadow)
        s.mesh.geometry.dispose()
        s.material.dispose()
      }
      kit.geometry.dispose()
      kit.material.map?.dispose()
      kit.material.dispose()
      // 덩이의 모양·재질은 `rockKits`가 들고 있다 — 메시만 뗀다
      for (const r of [...rocks.values(), ...[...spareRocks.values()].flat()]) group.remove(r.mesh)
      rocks.clear()
      spareRocks.clear()
    }
  }, [slots, kit, rocks, spareRocks])

  useFrame((_, delta) => {
    const p = worldState.player.position
    // 카메라가 보는 쪽. 3인칭은 늘 북쪽이라 0이고 1인칭만 돈다
    const quadrant = cameraQuadrant(
      worldState.camera.target.x - camera.position.x,
      worldState.camera.target.z - camera.position.z,
    )
    // 1인칭은 사람마다 고른다 (`plateQuadrant`). 설정이 아니라 지금 렌즈를 본다
    const first = firstPersonView()
    const shade = sceneShade(groupRef.current)
    // 그림자는 실내에서도 시간대를 탄다 — 원작이 맵을 안 가리고 `GetTimeOfDay`만 본다
    stepFootShadow(foot.current, timeOfDayForHour(worldState.time.gameHour), delta * TICKS_PER_SECOND)
    kit.material.opacity = footShadowOpacity(foot.current)
    const group = groupRef.current
    const stamp = ++frameNo.current
    let n = 0
    for (const actor of npcActors.list) {
      if (n >= MAX) break
      if (!actor.visible) continue
      if (standing?.has(actor) === true) continue
      // 변장 중이면 사람이 아니라 더미가 선다 (`DisguisePlates`)
      if (disguiseOf(actor) !== null) continue
      if (Math.abs(actor.x - p.x) > RANGE) continue
      if (Math.abs(actor.z - p.z) > RANGE) continue
      const sprite = npcSprite(actor.gfx)
      if (sprite === null) continue

      const slot = slots[n]
      if (slot === undefined) break
      n++

      const y = groundYAt(grid, world.mapId, actor.x + 0.5, actor.z + 0.5, layer, actor.y, actor)
      const rock = group !== null && ROCK_SPRITES.has(sprite.name)
        ? rockKitOf(actor.gfx, sprite) : null
      if (group !== null && rock !== null && rock !== undefined) {
        // 입체 바위. 판은 감추고 이 칸의 그림자만 쓴다 — 원작도 바위 밑에 그림자를
        // 깐다 (`NO_SHADOW`에 없다). 깨기·밀기·숨김은 위의 `actor.visible`이 다 한다
        slot.mesh.visible = false
        // 변주와 각은 **배치표의 처음 자리**로 고른다. 지금 자리로 고르면 괴력으로
        // 미는 동안 모양이 칸마다 바뀐다
        const variant = rockVariant(actor.info.x, actor.info.z)
        const kind = `${String(actor.gfx)}/${String(variant)}`
        let r = rocks.get(actor)
        if (r === undefined) {
          r = spareRocks.get(kind)?.pop()
          if (r === undefined) {
            const mesh = new Mesh(rock.shapes[variant], rock.material)
            mesh.name = `바위 ${sprite.name}`
            mesh.castShadow = true
            mesh.receiveShadow = true
            group.add(mesh)
            r = { mesh, kind, seen: 0 }
          }
          rocks.set(actor, r)
        }
        r.seen = stamp
        // 연출(깨지기 전 떨림 등)은 판때기와 같이 이 자리를 민다
        r.mesh.position.set(
          actor.x + 0.5 + (actor.offsetX ?? 0),
          y + (actor.offsetY ?? 0),
          actor.z + 0.5 + (actor.offsetZ ?? 0),
        )
        r.mesh.rotation.set(0, rockSpin(actor.info.x, actor.info.z), 0)
        r.mesh.scale.setScalar(rock.scales[variant] ?? 1)
        r.mesh.visible = true
      } else {
        // 걷는 중에만 장이 넘어간다. 서 있으면 그 방향의 첫 장으로 멈춘다
        const moving = !Number.isInteger(actor.x) || !Number.isInteger(actor.z)
        const before = walked.current.get(actor) ?? 0
        const ticks = moving ? before + delta * TICKS_PER_SECOND : IDLE_TICK
        walked.current.set(actor, ticks)

        const facing = plateQuadrant(quadrant, first,
          actor.x + (actor.offsetX ?? 0), actor.z + (actor.offsetZ ?? 0),
          camera.position.x, camera.position.z)
        const anim = sprite.directional ? artDir(actor.dir, facing) : 0
        const frame = frameOf(sprite, anim, ticks)
        if (slot.gfx !== actor.gfx) {
          slot.material.map = npcTexture(actor.gfx)
          slot.material.needsUpdate = true
          slot.gfx = actor.gfx
          slot.frame = -1
        }
        if (slot.frame !== frame) {
          setFrame(slot, sprite, frame)
          slot.frame = frame
        }

        // 연출이 걸려 있으면 그림만 그만큼 어긋난다 (`MapObject_SetSpritePosOffset`)
        slot.mesh.position.set(
          actor.x + 0.5 + (actor.offsetX ?? 0),
          y + (actor.offsetY ?? 0),
          actor.z + 0.5 + (actor.offsetZ ?? 0),
        )
        slot.mesh.scale.set(sprite.w / TEXELS_PER_TILE, sprite.h / TEXELS_PER_TILE, 1)
        // 카메라를 통째로 본다 (`scene/billboard` — 왜 좌우만으로는 안 되는지가
        // 거기 적혀 있다). 판의 원점이 아래 모서리라 발은 안 뜬다. 1인칭은 좌우로만
        // 돈다 — 안 그러면 한 칸 앞 사람이 뒤로 눕는다
        faceCamera(slot.mesh, camera, first)
        // 몸빛 단계는 sRGB 배율이라 그쪽으로 걸고 빛 밝기를 곱한다 — 입체 몬
        // (`NpcMonModels`)과 같은 식이다
        const tint = darknessTint(actor.darkness ?? 0)
        slot.material.color.setRGB(tint, tint, tint, SRGBColorSpace).multiplyScalar(shade)
        slot.mesh.visible = true
      }

      // 그림자는 그림이 아니라 **사람 자리**를 따른다 — 뛰어오를 때 땅에 남는다
      // (`ov5_021F1604`가 `MapObject_GetPosPtr`를 쓴다)
      const shadow = slot.shadow
      shadow.visible = castsFootShadow(sprite)
        && !hidesFootShadow(grid.behaviorAtWorld(actor.x + 0.5, actor.z + 0.5))
      if (shadow.visible) {
        shadow.position.set(
          actor.x + 0.5 + SHADOW_OFFSET.x, y + SHADOW_LIFT, actor.z + 0.5 + SHADOW_OFFSET.z)
        shadow.scale.set(foot.current.sx, 1, foot.current.sz)
      }
    }
    hideRest(slots, n)
    for (let i = n; i < slots.length; i++) {
      const s = slots[i]
      if (s !== undefined) s.shadow.visible = false
    }
    // 이번 프레임에 안 선 바위 — 깨졌거나(`visible`) 멀어졌거나 맵을 떠났다.
    // 씬에는 그대로 두고 안 그리기만 한다
    for (const [actor, r] of rocks) {
      if (r.seen === stamp) continue
      r.mesh.visible = false
      rocks.delete(actor)
      const pool = spareRocks.get(r.kind) ?? []
      pool.push(r)
      spareRocks.set(r.kind, pool)
    }
  })

  return <group ref={groupRef} />
}
