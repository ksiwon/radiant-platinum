// 엔딩 크레딧의 3D 무대 (`overlay099` · PARITY §8.12) — 장면 일곱 중 3D가 있는 여섯을 공간에 세운다.
//
// 시계는 화면(`ui/menu/CreditsScreen`)이 돌리고(`engine/world/creditsStage`의 `CreditsClock`) 이 무대는 `creditsLive.view`를 프레임마다 읽는다.
// 글(롬 대사)과 밝기 가림은 DOM 쪽이다 — 원작도 글 BG1은 밝기 변화를 안 받는다.
//
//   장면 0 · 2 · 4  노을 · 낮 · 밤 — 원작 카메라(화각 반각 22°)와 빛, 줄지어 흐르는 나무 · 가로등(`ending.narc` 78~84),
//                   자전거 탄 주인공(BDSP 몸 · 자전거), 둥실봉 · 갈모매 · 어두운 한 마리 · 별똥별(입자 풀 하나 · 셰이더 하나)
//   장면 1 · 3 · 5  회상 사진 열 장 · 밤의 떡잎마을 네 장 — 공간에 걸린 액자. 장당 페이드는 시계가 낸다
//
// ⚠️ **하늘 그림은 카메라에 붙은 뒤판이다** — 원작도 3D 뒤에 깔린 BG 한 장이다. 4:3 무대 상자 크기로 맞춘다 (`HallOfFameStage`의 `HallBackdrop`과 같다).
// 창 밖은 DOM이 검정으로 덮는다.
//
// ⚠️ **단위는 칸(타일 = 16유닛)이다.** 원작 fx32 월드 유닛 `v`는 `v / 4096 / 16`칸이다 (`fxTiles`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BoxGeometry, CanvasTexture, Color, DataTexture, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PlaneGeometry,
  Quaternion, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3,
  type BufferGeometry, type Material, type PerspectiveCamera, type Texture,
} from 'three'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { buildMaterials, loadDemoModel, type DemoLighting, type DemoLoaded } from './demoInstance'
import { splitByNode } from './propAnim'
import { retireTexture } from './retireTexture'
import { creditsLive } from './creditsLive'
import { usePersonModel } from './personModel'
import { playerModelPath } from './playerModelPath'
import { spinBike } from './BikeModel'
import {
  beltTrack, blendBgr555, CREDITS_CAMERA, CREDITS_LIGHT, CREDITS_LIGHT3, drifloonTrack, nightFlierTrack, nightSkyAt, shootingStarAt,
  wingullTrack, naturalSchedule, SCENE_3D, type CreditsLight,
} from '../engine/world/creditsStage'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { RUN_SPEED, WALK_SPEED } from '../engine/actor/player'
import { BDSP_TO_WORLD, normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { creditsArtUrl, creditsImage, loadCreditsArt, loadCreditsAtlas } from '../data/gameData'
import { atlasUrl } from '../data/providers/atlas'
import type { CreditsArt, CreditsAtlas } from '../data/schema'
import { useSaveStore } from '../state/saveStore'

// ───────────────────────────── 단위 · 카메라 ─────────────────────────────

const FX_TILE = 4096 * 16
const tiles = (v: number): number => v / FX_TILE
const TAN_HALF = Math.tan((CREDITS_CAMERA.fovHalfDeg * Math.PI) / 180)

/** 원작 카메라 자리 — 칸 */
const CAM_EYE = new Vector3(...CREDITS_CAMERA.position.map(tiles) as [number, number, number])
const CAM_AIM = new Vector3(...CREDITS_CAMERA.target.map(tiles) as [number, number, number])
const WORLD_UP = new Vector3(0, 1, 0)

/** 사진 장면 카메라 — 액자 중심을 정면에서 본다. 거리는 화각 반각 22°가 4:3 상자 높이 한 장을 담게 정한다 */
const PHOTO_DIST = 9
/** 사진 장면의 흔들림 (라디안) — 액자가 공간에 걸려 있음이 보이게 카메라가 천천히 돈다 */
const SWAY_YAW = 0.035
const SWAY_PITCH = 0.016

/** 한 화면 픽셀이 카메라 앞 `depth`에서 몇 칸인가 (256×192 상자 높이 192 = 반각 22° × 2) */
const pxUnit = (depth: number): number => (depth * TAN_HALF) / 96

const BOX_W = 256
const BOX_H = 192

// ───────────────────────────── 받기 ─────────────────────────────

const loader = new TextureLoader()

function loadTexture(url: string, repeat = false): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.colorSpace = SRGBColorSpace
      t.magFilter = NearestFilter
      t.minFilter = NearestFilter
      t.generateMipmaps = false
      if (repeat) { t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping }
      resolve(t)
    }, undefined, reject)
  })
}

/** 모델 일곱의 이름 — `import/platinum/demoModels`의 `ending*` */
const ENDING_MODELS = ['endingTree1a', 'endingTree1b', 'endingLight1', 'endingTree2a', 'endingTree2a2', 'endingTree2b', 'endingLight2'] as const
type EndingModel = typeof ENDING_MODELS[number]

/** 모델이 속한 장면 3D 종류 (빛을 고른다) — 0 노을 · 1 낮 · 2 밤 */
const MODEL_KIND: Record<EndingModel, 0 | 1 | 2> = {
  endingTree1a: 0, endingTree1b: 0, endingLight1: 1, endingTree2a: 2, endingTree2a2: 2, endingTree2b: 2, endingLight2: 2,
}

/** 장면 3D 종류 → 빛 */
const KIND_SCENE = [0, 2, 4] as const

/** `CreditsLight` → 연출 모델의 빛 (`DemoLighting`) — 방향은 `/4096`, 색은 RGB5. 3번 빛은 모든 장면이 같다 */
function demoLighting(l: CreditsLight): DemoLighting {
  return {
    lights: [
      { dir: [l.dir[0] / 4096, l.dir[1] / 4096, l.dir[2] / 4096], color: l.color },
      null, null,
      { dir: [CREDITS_LIGHT3.dir[0] / 4096, CREDITS_LIGHT3.dir[1] / 4096, CREDITS_LIGHT3.dir[2] / 4096], color: CREDITS_LIGHT3.color },
    ],
    global: { diffuse: l.diffuse, ambient: l.ambient, specular: l.specular, emission: l.emission },
  }
}

/** 한 모델의 그릴 거리 — 기하(노드 하나)와 재질 묶음 */
interface Built { geometry: BufferGeometry, materials: Material[], owned: Texture[] }

function build(data: DemoLoaded, kind: 0 | 1 | 2): Built | null {
  const made = buildMaterials(data, demoLighting(CREDITS_LIGHT[KIND_SCENE[kind]]))
  const parts = splitByNode(data.mesh, data.anims.info.submeshNodes)
  const geometry = [...parts.values()][0]
  if (!geometry) return null
  return { geometry, materials: made.materials, owned: made.owned }
}

// ───────────────────────────── 줄 배치 ─────────────────────────────

/** 장면 3D 종류별로 띠마다 쓰는 모양 번호 → 모델 이름 */
const BELT_MODELS: readonly (readonly (readonly EndingModel[])[])[] = [
  [['endingTree1a'], ['endingTree1b']],
  [['endingLight1'], []],
  [['endingTree2a', 'endingTree2a2', 'endingTree2b', 'endingLight2'], ['endingTree2b']],
]

const SLOTS = 16

// ───────────────────────────── 날아다니는 것 ─────────────────────────────

/**
 * 스프라이트 입자 풀 — 한 장의 아틀라스 · 한 벌의 재질을 모든 입자가 나눠 쓴다. 입자는 미리 만들어 두고 장면마다 모양과 자리만 갈아 끼운다
 * (장면 0 셋 · 장면 2 둘 · 장면 4 둘 — 최대 넷). 별똥별만 알파가 갈려 재질을 한 벌 복제한다 (같은 셰이더).
 */
interface PoolItem { mesh: Mesh, kind: number }

const POOL_SIZE = 4

function buildAtlas(art: CreditsArt, images: readonly HTMLImageElement[]): { texture: CanvasTexture, uv: [number, number, number, number][], pad: number } {
  const pad = 1
  const widths = art.sprites.map((s) => s.w + pad * 2)
  const W = widths.reduce((a, b) => a + b, 0)
  const H = Math.max(...art.sprites.map((s) => s.h)) + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const uv: [number, number, number, number][] = []
  let x = 0
  art.sprites.forEach((s, i) => {
    ctx?.drawImage(images[i]!, x + pad, pad)
    uv.push([(x + pad) / W, 1 - (pad + s.h) / H, (x + pad + s.w) / W, 1 - pad / H])
    x += widths[i]!
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  return { texture, uv, pad }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { resolve(img) }
    img.onerror = () => { reject(new Error('크레딧 그림을 못 읽었다')) }
    img.src = url
  })
}

/** 스프라이트 모양 하나의 기하 — 중심에서 `(ox, oy)`~`(ox+w, oy+h)`(화면 픽셀 · y 아래) 칸을 `unit`칸 단위로 */
function spriteGeometry(s: { ox: number, oy: number, w: number, h: number }, uv: [number, number, number, number]): PlaneGeometry {
  const g = new PlaneGeometry(s.w, s.h)
  // 중심을 스프라이트 중심으로 옮긴다 — `PlaneGeometry`는 가운데가 원점이다
  g.translate(s.ox + s.w / 2, -(s.oy + s.h / 2), 0)
  const a = g.getAttribute('uv')
  const [u0, v0, u1, v1] = uv
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) < 0.5 ? u0 : u1, a.getY(i) < 0.5 ? v0 : v1)
  return g
}

// ───────────────────────────── 사진 액자 ─────────────────────────────

/** 액자 가장자리 · 두께 (원작 픽셀) */
const FRAME_BORDER = 7
const FRAME_DEPTH = 6
/** 사진 둘레에서 상자 끝까지 두는 여백 (픽셀) */
const FRAME_MARGIN = 4

interface PhotoLook { rect: [number, number, number, number], scale: number }

/** 사진의 액자 자리 — 원작 화면 상자 안에 액자 겉이 들어가게 조인다 (밤 사진은 화면 한 장 크기라 줄인다) */
function photoLook(p: { x: number, y: number, w: number, h: number }): PhotoLook {
  const outerW = p.w + FRAME_BORDER * 2, outerH = p.h + FRAME_BORDER * 2
  const room = Math.min((BOX_W - FRAME_MARGIN * 2) / outerW, (BOX_H - FRAME_MARGIN * 2) / outerH, 1)
  const w = p.w * room, h = p.h * room
  const border = FRAME_BORDER * room
  let cx = p.x + p.w / 2, cy = p.y + p.h / 2
  const halfW = w / 2 + border + FRAME_MARGIN, halfH = h / 2 + border + FRAME_MARGIN
  cx = Math.min(BOX_W - halfW, Math.max(halfW, cx))
  cy = Math.min(BOX_H - halfH, Math.max(halfH, cy))
  return { rect: [cx - BOX_W / 2, BOX_H / 2 - cy, w, h], scale: room }
}

interface Frame {
  group: Group
  picture: MeshBasicMaterial
}

/** 액자 한 장 — 사진 면(빛을 안 받는다 · 원작 색 그대로) · 틀 네 개 · 속지. 단위는 칸, 크기는 `unit`칸/픽셀 */
function makeFrame(photo: Texture, look: PhotoLook, unit: number, tilt: number, wood: Material, mat: Material): Frame {
  const group = new Group()
  const [cx, cy, w, h] = look.rect
  const border = FRAME_BORDER * look.scale
  const depth = FRAME_DEPTH * look.scale
  group.position.set(cx * unit, cy * unit, 0)
  group.rotation.z = tilt
  const picture = new MeshBasicMaterial({ map: photo, toneMapped: false, fog: false, transparent: true })
  const pic = new Mesh(new PlaneGeometry(w * unit, h * unit), picture)
  pic.position.z = depth * unit * 0.5 + 0.0005
  group.add(pic)
  // 속지 — 사진 뒤의 흰 종이
  const inner = new Mesh(new PlaneGeometry(w * unit, h * unit), mat)
  inner.position.z = depth * unit * 0.45
  group.add(inner)
  const bars: [number, number, number, number][] = [
    [0, (h / 2 + border / 2), w + border * 2, border],
    [0, -(h / 2 + border / 2), w + border * 2, border],
    [-(w / 2 + border / 2), 0, border, h],
    [w / 2 + border / 2, 0, border, h],
  ]
  for (const [bx, by, bw, bh] of bars) {
    const bar = new Mesh(new BoxGeometry(bw * unit, bh * unit, depth * unit), wood)
    bar.position.set(bx * unit, by * unit, (depth * unit) / 2)
    group.add(bar)
  }
  // 뒤판 — 액자 뒤가 비어 보이지 않게
  const back = new Mesh(new PlaneGeometry((w + border * 2) * unit, (h + border * 2) * unit), mat)
  back.position.z = 0.001
  back.rotation.y = Math.PI
  group.add(back)
  return { group, picture }
}

// ───────────────────────────── 밤 하늘 (팔레트 섞기) ─────────────────────────────

/** 밤 하늘 한 장 — 번호 판(R 번호 · G 벌 · A 0번 색)과 칠한 결과 */
interface NightSky {
  texture: DataTexture
  indices: Uint8ClampedArray
  data: Uint8Array
  w: number
  h: number
  /** 마지막으로 칠한 섞기 상태 — 같으면 다시 안 칠한다 */
  key: string
}

/** 번호 판을 읽어 텍스처를 만든다. 칠하기는 `paintNightSky`가 틱마다 한다 */
async function makeNightSky(art: CreditsArt): Promise<NightSky> {
  const img = await loadImage(creditsArtUrl(art.nightSky.file))
  const { w, h } = art.nightSky
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('밤 하늘을 읽을 수 없다')
  ctx.drawImage(img, 0, 0)
  // ⚠️ 알파가 0인 픽셀의 색은 브라우저가 0으로 지울 수 있다 — 번호는 알파가 있는 픽셀만 쓴다(0번 색은 뚫린 자리다)
  const indices = ctx.getImageData(0, 0, w, h).data
  const data = new Uint8Array(w * h * 4)
  const texture = new DataTexture(data, w, h)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return { texture, indices, data, w, h, key: '' }
}

const expand5 = (v: number): number => (v << 3) | (v >> 2)

/**
 * 그 틱의 1번 벌을 섞어 칠한다 (`ov99_021D3930` — `BlendPalette`). 0번 벌은 안 섞인다.
 * ⚠️ **DataTexture는 첫 줄이 아래다** — 그림의 줄을 거꾸로 써서 이미지 텍스처와 같은 방향으로 맞춘다
 */
function paintNightSky(sky: NightSky, art: CreditsArt, tick: number): void {
  const blend = nightSkyAt(tick)
  const key = `${String(blend.from)}/${String(blend.to)}/${String(blend.level)}`
  if (key === sky.key) return
  sky.key = key
  const { palettes, fixed } = art.nightSky
  const mixed = palettes[blend.from]!.map((c, i) => blendBgr555(c, palettes[blend.to]![i]!, blend.level))
  const rgb = (c: number): [number, number, number] => [expand5(c & 31), expand5((c >> 5) & 31), expand5((c >> 10) & 31)]
  const pal1 = mixed.map(rgb), pal0 = fixed.map(rgb)
  const { w, h, indices, data } = sky
  for (let y = 0; y < h; y++) {
    const dst = (h - 1 - y) * w * 4
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4
      const o = dst + x * 4
      if (indices[at + 3] === 0) { data[o + 3] = 0; continue }
      const c = (indices[at + 1] === 1 ? pal1 : pal0)[indices[at]!]!
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255
    }
  }
  sky.texture.needsUpdate = true
}

// ───────────────────────────── 무대 ─────────────────────────────

/** 장면 3D 종류의 빛 색을 three 색으로 (원작 5비트) */
const rgb5 = (c: readonly [number, number, number], into = new Color()): Color =>
  into.setRGB(((c[0] << 3) | (c[0] >> 2)) / 255, ((c[1] << 3) | (c[1] >> 2)) / 255, ((c[2] << 3) | (c[2] >> 2)) / 255, SRGBColorSpace)

export function CreditsStage() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const gender = useSaveStore((s) => s.trainer.gender)

  // ── 받는 것 ──
  const [atlas, setAtlas] = useState<CreditsAtlas | null>(null)
  const [art, setArt] = useState<CreditsArt | null>(null)
  const [models, setModels] = useState<Map<EndingModel, DemoLoaded>>(new Map())
  /** 받기가 끝났는가 (성공이든 실패든) — 옛 설치본은 그림 · 모델이 없어 영영 안 온다. 화면이 이것을 기다렸다 시계를 시작한다 */
  const [settled, setSettled] = useState({ atlas: false, art: false, models: false })
  useEffect(() => {
    let alive = true
    const done = (k: 'atlas' | 'art' | 'models') => () => { if (alive) setSettled((s) => ({ ...s, [k]: true })) }
    void loadCreditsAtlas().then((a) => { if (alive) setAtlas(a) }).catch(() => undefined).finally(done('atlas'))
    void loadCreditsArt().then((a) => { if (alive) setArt(a) }).catch(() => undefined).finally(done('art'))
    void Promise.all(ENDING_MODELS.map((name) => loadDemoModel(name).then((m) => [name, m] as const)))
      .then((list) => {
        if (!alive) return
        setModels(new Map(list.filter((e): e is readonly [EndingModel, DemoLoaded] => e[1] !== null)))
      }).catch(() => undefined).finally(done('models'))
    return () => { alive = false }
  }, [])

  // 배경 하늘 셋
  const [skies, setSkies] = useState<Texture[] | null>(null)
  useEffect(() => {
    if (!atlas) return
    let alive = true
    const made: Texture[] = []
    void Promise.all(Array.from({ length: atlas.count }, (_, i) => loadTexture(atlasUrl(creditsImage(i)), true)))
      .then((list) => { made.push(...list); if (alive) setSkies(list); else for (const t of list) t.dispose() })
      .catch(() => undefined)
    return () => { alive = false; for (const t of made) t.dispose() }
  }, [atlas])

  // 사진 열넷 (성별) · 입자 아틀라스
  const girl = gender === 'girl'
  const [photos, setPhotos] = useState<{ memory: Texture[], night: Texture[] } | null>(null)
  const [pool, setPool] = useState<ReturnType<typeof buildAtlas> | null>(null)
  useEffect(() => {
    if (!art) return
    let alive = true
    const made: Texture[] = []
    const set = girl ? { memory: art.memory.female, night: art.night.female } : { memory: art.memory.male, night: art.night.male }
    void Promise.all([
      Promise.all(set.memory.map((p) => loadTexture(creditsArtUrl(p.file)))),
      Promise.all(set.night.map((p) => loadTexture(creditsArtUrl(p.file)))),
      Promise.all(art.sprites.map((s) => loadImage(creditsArtUrl(s.file)))),
    ]).then(([memory, night, sprites]) => {
      made.push(...memory, ...night)
      if (!alive) { for (const t of made) t.dispose(); return }
      setPhotos({ memory, night })
      setPool(buildAtlas(art, sprites))
    }).catch(() => undefined)
    return () => { alive = false; for (const t of made) t.dispose() }
  }, [art, girl])

  // 모델 재질 — 장면 빛을 입혀 한 번씩만 짓는다
  const built = useMemo(() => {
    const out = new Map<EndingModel, Built>()
    for (const [name, data] of models) {
      const b = build(data, MODEL_KIND[name])
      if (b) out.set(name, b)
    }
    return out
  }, [models])
  useEffect(() => () => {
    for (const b of built.values()) {
      for (const m of b.materials) m.dispose()
      for (const t of b.owned) retireTexture(t)
    }
  }, [built])

  // 시계를 시작해도 되는가 — 하늘 · 사진 · 모델이 다 오거나 못 올 것이 확정됐고 사람 몸이 섰다
  const person = usePersonModel(playerModelPath(gender))
  const bikeModel = usePersonModel('models/bike.glb')
  const photosSettled = settled.art && (photos !== null || art === null)
  const skiesSettled = settled.atlas && (skies !== null || atlas === null)
  useEffect(() => {
    creditsLive.ready = photosSettled && skiesSettled && settled.models && person !== null && bikeModel !== null
  }, [photosSettled, skiesSettled, settled.models, person, bikeModel])

  // ── 장면 바탕 · 카메라 ──
  useEffect(() => {
    const lens = camera as PerspectiveCamera
    const near = lens.near, far = lens.far
    const prev = scene.background
    scene.background = new Color(0x000000)
    return () => {
      cinematicStage.active = false
      lens.near = near
      lens.far = far
      lens.updateProjectionMatrix()
      scene.background = prev
    }
  }, [camera, scene])

  const anchor = useRef<Group>(null)
  const sky = useRef<Group>(null)
  const photosGroup = useRef<Group>(null)
  const beltGroups = useRef<Group[][][]>([[[], []], [[], []], [[], []]])
  const rigRef = useRef<{ rig: Rig | null, bike: Group | null }>({ rig: null, bike: null })
  const cyclist = useRef<Group>(null)
  const poolMeshes = useRef<PoolItem[]>([])
  const starMesh = useRef<Mesh>(null)
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), t: new Vector3() }), [])

  // 하늘 뒤판 — 색 판 한 장 · 그림 판 한 장 (카메라에 붙는다)
  const skyParts = useMemo(() => {
    if (!atlas || !skies) return null
    return atlas.scenes.map((meta, i) => {
      const tex = skies[i]!
      const back = new MeshBasicMaterial({ color: new Color(meta.backdrop ?? '#000000'), depthTest: false, depthWrite: false, toneMapped: false, fog: false })
      const front = new MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })
      return { back, front, w: meta.w, h: meta.h }
    })
  }, [atlas, skies])
  useEffect(() => () => { for (const p of skyParts ?? []) { p.back.dispose(); p.front.dispose() } }, [skyParts])

  // 액자
  const frames = useMemo(() => {
    if (!art || !photos) return null
    const D = PHOTO_DIST
    const unit = pxUnit(D)
    const wood = new MeshStandardMaterial({ color: '#7a5a2e', roughness: 0.42, metalness: 0.55, fog: false })
    const mat = new MeshStandardMaterial({ color: '#e8e1cc', roughness: 0.9, metalness: 0, fog: false })
    const set = girl ? { memory: art.memory.female, night: art.night.female } : { memory: art.memory.male, night: art.night.male }
    const make = (list: typeof set.memory, tex: Texture[], seed: number): Frame[] => list.map((p, i) =>
      makeFrame(tex[i]!, photoLook(p), unit, Math.sin((i + seed) * 2.4) * 0.018, wood, mat))
    return { memory: make(set.memory, photos.memory, 0), night: make(set.night, photos.night, 5), wood, mat }
  }, [art, photos, girl])
  useEffect(() => () => {
    if (!frames) return
    for (const f of [...frames.memory, ...frames.night]) {
      f.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose() })
      f.picture.dispose()
    }
    frames.wood.dispose()
    frames.mat.dispose()
  }, [frames])

  // 밤 하늘 — 번호 판을 읽어 틱마다 섞어 칠한다 (옛 설치본은 `nightSky`가 없어 구운 한 장으로 남는다)
  const night = useRef<NightSky | null>(null)
  useEffect(() => {
    if (!art || !skyParts) return
    let alive = true
    let made: NightSky | null = null
    void makeNightSky(art).then((sky) => {
      if (!alive) { sky.texture.dispose(); return }
      made = sky
      night.current = sky
      const front = skyParts[2]?.front
      if (front) { front.map = sky.texture; front.needsUpdate = true }
    }).catch(() => undefined)
    return () => { alive = false; night.current = null; made?.texture.dispose() }
  }, [art, skyParts])

  // 입자 풀 — 모양 기하 넷 · 재질 한 벌(+ 별똥별용 복제)
  const sprites = useMemo(() => {
    if (!art || !pool) return null
    const geos = art.sprites.map((s, i) => spriteGeometry(s, pool.uv[i]!))
    const material = new MeshBasicMaterial({
      map: pool.texture, alphaTest: 0.5, transparent: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide,
    })
    const streak = material.clone()
    streak.alphaTest = 0.01
    streak.transparent = true
    return { geos, material, streak }
  }, [art, pool])
  useEffect(() => () => {
    if (!sprites) return
    for (const g of sprites.geos) g.dispose()
    sprites.material.dispose()
    sprites.streak.dispose()
    pool?.texture.dispose()
  }, [sprites, pool])

  // 주인공 · 자전거
  const wrapper = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!person || !wrapper.current) return
    normalizeModel(wrapper.current, person, PLAYER_HEIGHT)
    const state = rigRef.current
    state.rig = createRig(person, wrapper.current, playerModelPath(gender))
    return () => { state.rig = null }
  }, [person, gender])
  useEffect(() => {
    if (!bikeModel) return
    bikeModel.traverse((o) => {
      if (['FTire', 'BTire', 'Gear', 'LPedal', 'RPedal'].includes(o.name)) o.userData.rest = o.quaternion.clone()
    })
    const state = rigRef.current
    state.bike = bikeModel as Group
    return () => { state.bike = null }
  }, [bikeModel])

  // 입자 메시 — 풀을 한 번 만든다
  useLayoutEffect(() => {
    const g = anchor.current
    if (!g || !sprites) return
    const items: PoolItem[] = []
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new Mesh(sprites.geos[0], sprites.material)
      mesh.frustumCulled = false
      mesh.renderOrder = -900
      mesh.visible = false
      g.add(mesh)
      items.push({ mesh, kind: 0 })
    }
    poolMeshes.current = items
    const star = starMesh.current
    if (star) { star.geometry = sprites.geos[3]!; star.material = sprites.streak }
    return () => { for (const it of items) g.remove(it.mesh); poolMeshes.current = [] }
  }, [sprites])

  const keyLight = useRef<import('three').DirectionalLight>(null)
  const fill = useRef<import('three').HemisphereLight>(null)

  useFrame((_, delta) => {
    const v = creditsLive.view
    const g = anchor.current
    if (!g) return
    const kind = v && v.running ? SCENE_3D[v.scene] : undefined
    const photoScene = v !== null && v.running && (v.scene === 1 || v.scene === 3 || v.scene === 5)
    cinematicStage.active = true

    // 카메라 — 4:3 상자 높이가 반각 22°가 되게 창 비율로 화각을 늘린다
    const aspect = size.width / Math.max(1, size.height)
    const frac = Math.min(1, (aspect * BOX_H) / BOX_W)
    const half = Math.atan(TAN_HALF / frac)
    cinematicStage.fov = (2 * half * 180) / Math.PI
    const lens = camera as PerspectiveCamera
    let eye = CAM_EYE, aim = CAM_AIM
    let near = CREDITS_CAMERA.near / 16, far = CREDITS_CAMERA.far / 16
    if (kind === undefined) {
      const t = (v?.tick ?? 0) / 60
      const yaw = Math.sin(t * 0.55) * SWAY_YAW, pitch = Math.sin(t * 0.37 + 1) * SWAY_PITCH
      tmp.p.set(
        PHOTO_DIST * Math.sin(yaw) * Math.cos(pitch), PHOTO_DIST * Math.sin(pitch), PHOTO_DIST * Math.cos(yaw) * Math.cos(pitch),
      )
      eye = tmp.p
      aim = tmp.t.set(0, 0, 0)
      near = 0.5; far = 80
    }
    cinematicStage.position.set(CINEMATIC_ORIGIN.x + eye.x, CINEMATIC_ORIGIN.y + eye.y, CINEMATIC_ORIGIN.z + eye.z)
    cinematicStage.target.set(CINEMATIC_ORIGIN.x + aim.x, CINEMATIC_ORIGIN.y + aim.y, CINEMATIC_ORIGIN.z + aim.z)
    if (lens.near !== near || lens.far !== far) { lens.near = near; lens.far = far; lens.updateProjectionMatrix() }

    // 카메라에 붙은 틀
    tmp.m.lookAt(eye, aim, WORLD_UP)
    g.quaternion.setFromRotationMatrix(tmp.m)
    g.position.copy(eye)

    const showWorld = kind !== undefined
    // 하늘
    const sg = sky.current
    if (sg) {
      sg.visible = showWorld && skyParts !== null
      if (sg.visible && v) {
        const k = v.scene === 0 ? 0 : v.scene === 2 ? 1 : 2
        sg.children.forEach((c, i) => { c.visible = Math.floor(i / 2) === k })
        const p = skyParts?.[k]
        if (v.scene === 4 && night.current && art) paintNightSky(night.current, art, v.tick)
        if (p) {
          const offX = v.scene === 0 ? (-v.steps * 0x40) / 4096 : 0
          const offY = v.scene === 2 ? (v.steps * 0x60) / 4096 : 0
          const t = p.front.map
          if (t) {
            t.repeat.set(BOX_W / p.w, BOX_H / p.h)
            t.offset.set(offX / p.w, 1 - (offY + BOX_H) / p.h)
          }
        }
      }
    }

    // 빛 — 장면의 빛 0번 색을 평행광으로, 환경색을 반구광으로 (사람 · 자전거 몸이 받는다)
    if (kind !== undefined && keyLight.current && fill.current) {
      const l = CREDITS_LIGHT[KIND_SCENE[kind]]
      keyLight.current.color = rgb5(l.color, keyLight.current.color)
      keyLight.current.position.set(-l.dir[0], -l.dir[1], -l.dir[2]).normalize().multiplyScalar(10)
      keyLight.current.intensity = 2.2
      fill.current.color = rgb5(l.ambient, fill.current.color)
      fill.current.groundColor = rgb5(l.emission, fill.current.groundColor)
      fill.current.intensity = 1.4
    }

    // 줄 배치
    for (let k = 0; k < 3; k++) {
      const groups = beltGroups.current[k]!
      const on = kind === k && v !== null
      for (let gi = 0; gi < 2; gi++) {
        for (const slot of groups[gi] ?? []) if (slot) slot.visible = false
      }
      if (!on || !v) continue
      const track = beltTrack(k as 0 | 1 | 2)
      const step = Math.min(track.steps - 1, v.steps)
      for (let gi = 0; gi < 2; gi++) {
        const count = track.counts[gi]!
        const slotRefs = beltGroups.current[k]![gi]!
        for (let i = 0; i < count; i++) {
          const base = ((step * 2 + gi) * SLOTS + i)
          const shape = track.shape[base]!
          const slot = slotRefs[i * 4 + shape]
          if (!slot) continue
          slot.position.set(track.pos[base * 3]!, track.pos[base * 3 + 1]!, track.pos[base * 3 + 2]!)
          slot.visible = true
        }
      }
    }

    // 주인공
    const cy = cyclist.current
    if (cy) {
      cy.visible = showWorld && rigRef.current.rig !== null
      if (cy.visible) {
        updateLocomotion(rigRef.current.rig!, delta, 1.6, WALK_SPEED, RUN_SPEED, null, true)
        if (rigRef.current.bike) spinBike(rigRef.current.bike, rigRef.current.rig!.phase)
      }
    }

    // 입자 — 장면마다 모양 · 자리
    const items = poolMeshes.current
    const U = pxUnit(SPRITE_DEPTH)
    let used = 0
    const place = (item: PoolItem, kindIdx: number, x: number, y: number, rot: number, scale: number): void => {
      item.mesh.geometry = sprites!.geos[kindIdx]!
      item.mesh.position.set((x - BOX_W / 2) * U, (BOX_H / 2 - y) * U, -SPRITE_DEPTH)
      item.mesh.rotation.z = rot
      item.mesh.scale.setScalar(scale * U)
      item.mesh.visible = true
    }
    for (const it of items) it.mesh.visible = false
    if (sprites && v && v.running) {
      const step = v.steps
      if (v.scene === 0) {
        for (const i of [0, 1, 2] as const) {
          const t = drifloonTrack(i)
          const n = Math.min(t.steps - 1, step)
          place(items[used++]!, 0, t.x[n]!, t.y[n]!, 0, t.scale[n]!)
        }
      } else if (v.scene === 2) {
        const t0 = naturalSchedule().start[2]!
        for (const i of [0, 1] as const) {
          const t = wingullTrack(i, t0)
          const n = Math.min(t.steps - 1, step)
          place(items[used++]!, 1, t.x[n]!, t.y[n]!, t.rot[n]!, t.scale[n]!)
        }
      } else if (v.scene === 4) {
        const t0 = naturalSchedule().start[4]!
        const t = nightFlierTrack(t0)
        const n = Math.min(t.steps - 1, step)
        place(items[used]!, 2, t.x[n]!, t.y[n]!, t.rot[n]!, t.scale[n]!)
      }
    }
    const star = starMesh.current
    if (star) {
      const s = sprites && v && v.running && v.scene === 4 ? shootingStarAt(v.tick) : null
      star.visible = s !== null
      if (s) {
        star.position.set((s.x - BOX_W / 2) * U, (BOX_H / 2 - s.y) * U, -SPRITE_DEPTH)
        star.scale.setScalar(U)
        ;(star.material as MeshBasicMaterial).opacity = s.alpha
      }
    }

    // 사진 액자
    const pg = photosGroup.current
    if (pg && frames) {
      pg.visible = photoScene
      if (photoScene && v) {
        const all = [...frames.memory, ...frames.night]
        for (const f of all) { f.group.visible = false; f.picture.opacity = 1 }
        if (v.scene === 5) {
          const front = frames.night[v.night.front]
          const back = frames.night[v.night.back]
          if (v.night.mix < 1 && back) {
            back.group.visible = true
            back.picture.opacity = 1
            back.group.position.z = -0.002
          }
          if (front) {
            front.group.visible = true
            front.picture.opacity = v.night.mix
            front.group.position.z = 0
          }
        } else {
          const f = frames.memory[v.photo]
          if (f) f.group.visible = true
        }
      }
    }
  })

  return (
    <group position={CINEMATIC_ORIGIN} name="엔딩 크레딧">
      <directionalLight ref={keyLight} />
      <hemisphereLight ref={fill} args={['#ffffff', '#202020', 1]} />
      <directionalLight position={[3, 6, 8]} intensity={1.1} color="#ffffff" />
      <ambientLight intensity={0.35} />

      {/* 카메라에 붙은 것 — 하늘 · 날아다니는 입자 · 별똥별 · 주인공 */}
      <group ref={anchor}>
        <group ref={sky}>
          {skyParts?.flatMap((p, i) => [
            <mesh key={`b${String(i)}`} position={[0, 0, -SKY_DEPTH]} material={p.back} renderOrder={-1000} frustumCulled={false}>
              <planeGeometry args={[BOX_W * pxUnit(SKY_DEPTH), BOX_H * pxUnit(SKY_DEPTH)]} />
            </mesh>,
            <mesh key={`f${String(i)}`} position={[0, 0, -SKY_DEPTH]} material={p.front} renderOrder={-999} frustumCulled={false}>
              <planeGeometry args={[BOX_W * pxUnit(SKY_DEPTH), BOX_H * pxUnit(SKY_DEPTH)]} />
            </mesh>,
          ])}
        </group>
        <mesh ref={starMesh} renderOrder={-890} visible={false} frustumCulled={false} />
        <group ref={cyclist} visible={false} position={CYCLIST_AT} rotation={[0, CYCLIST_YAW, 0]}>
          <group ref={wrapper}>{person && <primitive object={person} />}</group>
          <group scale={BDSP_TO_WORLD}>{bikeModel && <primitive object={bikeModel} />}</group>
        </group>
      </group>

      {/* 줄지어 흐르는 것 — 장면 0 · 2 · 4 */}
      {BELT_MODELS.map((groups, k) => groups.map((names, gi) => {
        const refs = beltGroups.current[k]![gi]!
        const meshes = names.map((n) => built.get(n)).filter((b): b is Built => b !== undefined)
        if (meshes.length !== names.length) return null
        // 모양이 넷까지 갈릴 수 있어 칸마다 네 후보를 단다 (모자란 자리는 비운다)
        return Array.from({ length: SLOTS }, (_, i) => (
          <group key={`${String(k)}-${String(gi)}-${String(i)}`}>
            {Array.from({ length: 4 }, (_, shape) => {
              const b = meshes[shape]
              return (
                <group key={shape} ref={(g) => { if (g) refs[i * 4 + shape] = g; else delete refs[i * 4 + shape] }} visible={false}>
                  {b && <mesh geometry={b.geometry} material={b.materials} frustumCulled={false} />}
                </group>
              )
            })}
          </group>
        ))
      }))}

      {/* 사진 액자 — 장면 1 · 3 · 5 */}
      <group ref={photosGroup} visible={false}>
        {frames && [...frames.memory, ...frames.night].map((f, i) => <primitive key={i} object={f.group} />)}
      </group>
    </group>
  )
}

/** 하늘 뒤판 · 입자가 서는 카메라 앞 거리 (칸). 자르는 면 안이고 줄지어 선 것보다 뒤다 */
const SKY_DEPTH = 50
const SPRITE_DEPTH = 49

/** 주인공은 카메라 앞 2칸 · 화면 오른쪽 아래에 서서 왼쪽을 본다 (원작 OBJ는 화면 `(192, 160)` 중심) — 눈으로 맞춘 값이다 */
const CYCLIST_AT: [number, number, number] = [0.54, -1.42, -2]
const CYCLIST_YAW = -Math.PI / 2 + 0.12
