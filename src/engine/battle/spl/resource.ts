// `.spa` 입자 자료를 읽는다 (`lib/spl`의 `SPLManager_LoadResources`).
//
// ⚠️ **원작 라이브러리가 디컴프에 통째로 있다** (`raw/decomp/lib/spl`, 3,286줄).
// 형식을 짐작할 자리가 하나도 없다 — 구조체는 `spl_resource.h`, 읽는 차례는
// `spl_manager.c`, 곡선은 `spl_anim.c`, 그리기는 `spl_draw.c`다. 여기 적힌
// 바이트 자리는 전부 그 헤더에서 세어 온 것이다.
//
// ⚠️ **읽는 차례가 곧 구조다.** 리소스마다 고정 머리(88B) 뒤에 **플래그가 켜진
// 것만** 차례대로 붙는다 — scale · color · alpha · tex · child, 그리고 행동 여섯이
// gravity → random → magnet → spin → collision → convergence 순이다. 하나라도
// 크기를 틀리면 그 뒤가 전부 밀리는데, **틀린 것을 바로 안다**: 리소스를 다 읽은
// 자리가 머리의 `texOffset`과 정확히 같아야 한다 (`spa.test.ts`가 롬의 485개
// 전부에서 그것을 잰다).
//
// ⚠️ **고정소수를 그대로 둔다.** fx32는 1.19.12, fx16은 1.3.12다. 여기서 실수로
// 바꾸면 원작과 비트로 못 맞댄다 — 화면에 올릴 때 한 번만 나눈다 (`emitter.ts`).

/** fx32 한 칸 (1.19.12) */
export const FX32_ONE = 1 << 12
/** fx16 한 칸 (1.3.12) — fx32와 같은 소수 자릿수다 */
export const FX16_ONE = 1 << 12

/** 그리는 방법 (`SPLDrawType`) */
export const DRAW = {
  billboard: 0,
  directionalBillboard: 1,
  polygon: 2,
  directionalPolygon: 3,
  directionalPolygonCenter: 4,
} as const

/** 어디서 뿜는가 (`SPLEmissionType`) */
export const EMIT = {
  point: 0,
  sphereSurface: 1,
  circleBorder: 2,
  circleBorderUniform: 3,
  sphere: 4,
  circle: 5,
  cylinderSurface: 6,
  cylinder: 7,
  hemisphereSurface: 8,
  hemisphere: 9,
} as const

/** 원을 어느 축으로 도는가 (`SPLCircleAxis`) */
export const CIRCLE_AXIS = { z: 0, y: 1, x: 2, emitter: 3 } as const

/** 크기 애니가 어느 축에 걸리는가 (`SPLScaleAnimDir`) */
export const SCALE_DIR = { xy: 0, x: 1, y: 2 } as const

/** 자식 입자가 부모 각을 어떻게 물려받는가 (`SPLChildRotationType`) */
export const CHILD_ROT = { none: 0, angle: 1, angleAndVelocity: 2 } as const

/** `SPLResourceFlags` — u32 하나에 든 비트들 */
interface SplFlags {
  emissionType: number
  drawType: number
  circleAxis: number
  hasScaleAnim: boolean
  hasColorAnim: boolean
  hasAlphaAnim: boolean
  hasTexAnim: boolean
  hasRotation: boolean
  randomInitAngle: boolean
  selfMaintaining: boolean
  followEmitter: boolean
  hasChildResource: boolean
  polygonRotAxis: number
  polygonReferencePlane: number
  randomizeLoopedAnim: boolean
  drawChildrenFirst: boolean
  hideParent: boolean
  useViewSpace: boolean
  hasGravityBehavior: boolean
  hasRandomBehavior: boolean
  hasMagnetBehavior: boolean
  hasSpinBehavior: boolean
  hasCollisionPlaneBehavior: boolean
  hasConvergenceBehavior: boolean
  hasFixedPolygonID: boolean
  childHasFixedPolygonID: boolean
}

/** `SPLResourceHeader` — 88바이트 고정 머리 */
interface SplHeader {
  flags: SplFlags
  emitterBasePos: readonly [number, number, number]
  /** 한 번에 몇 개 뿜는가 (fx32) */
  emissionCount: number
  /** 원·구·기둥의 반지름 (fx32) */
  radius: number
  /** 기둥의 길이 (fx32) */
  length: number
  axis: readonly [number, number, number]
  /** GXRgb — 5비트씩 */
  color: number
  initVelPosAmplifier: number
  initVelAxisAmplifier: number
  baseScale: number
  /** fx16 */
  aspectRatio: number
  startDelay: number
  minRotation: number
  maxRotation: number
  initAngle: number
  emitterLifeTime: number
  particleLifeTime: number
  /** 처음 값을 얼마나 흔드는가. 셋 다 0~255 */
  random: { baseScale: number, lifeTime: number, initVel: number }
  emissionInterval: number
  baseAlpha: number
  airResistance: number
  textureIndex: number
  loopFrames: number
  dbbScale: number
  textureTileCountS: number
  textureTileCountT: number
  scaleAnimDir: number
  dpolFaceEmitter: boolean
  flipTextureS: boolean
  flipTextureT: boolean
  /** fx16 */
  polygonX: number
  /** fx16 */
  polygonY: number
  userData: number
}

interface SplScaleAnim {
  start: number
  mid: number
  end: number
  /** 0~255 구간에서 꺾이는 자리 */
  in: number
  out: number
  loop: boolean
}

interface SplColorAnim {
  start: number
  end: number
  in: number
  peak: number
  out: number
  randomStartColor: boolean
  loop: boolean
  interpolate: boolean
}

interface SplAlphaAnim {
  /** 5비트씩 (0~31) */
  start: number
  mid: number
  end: number
  randomRange: number
  loop: boolean
  in: number
  out: number
}

interface SplTexAnim {
  textures: readonly number[]
  frameCount: number
  step: number
  randomizeInit: boolean
  loop: boolean
}

interface SplChild {
  usesBehaviors: boolean
  hasScaleAnim: boolean
  hasAlphaAnim: boolean
  rotationType: number
  followEmitter: boolean
  useChildColor: boolean
  drawType: number
  polygonRotAxis: number
  polygonReferencePlane: number
  randomInitVelMag: number
  endScale: number
  lifeTime: number
  /** 부모 속도를 얼마나 물려받는가 (255 = 100%) */
  velocityRatio: number
  scaleRatio: number
  color: number
  emissionCount: number
  emissionDelay: number
  emissionInterval: number
  texture: number
  textureTileCountS: number
  textureTileCountT: number
  flipTextureS: boolean
  flipTextureT: boolean
  dpolFaceEmitter: boolean
}

type SplBehavior =
  | { kind: 'gravity', magnitude: readonly [number, number, number] }
  | { kind: 'random', magnitude: readonly [number, number, number], applyInterval: number }
  | { kind: 'magnet', target: readonly [number, number, number], force: number }
  | { kind: 'spin', angle: number, axis: number }
  | { kind: 'collisionPlane', y: number, elasticity: number, collisionType: number }
  | { kind: 'convergence', target: readonly [number, number, number], force: number }

export interface SplResource {
  header: SplHeader
  scaleAnim: SplScaleAnim | null
  colorAnim: SplColorAnim | null
  alphaAnim: SplAlphaAnim | null
  texAnim: SplTexAnim | null
  child: SplChild | null
  behaviors: readonly SplBehavior[]
}

/** `SPLTextureResource` + 그 뒤에 붙은 픽셀·팔레트 */
export interface SplTexture {
  id: number
  /** GX 텍스처 형식 1~7 (`import/platinum/nitrotex`가 이 번호로 푼다) */
  format: number
  width: number
  height: number
  repeatS: boolean
  repeatT: boolean
  flipS: boolean
  flipT: boolean
  /** 팔레트 0번을 투명으로 보는가 */
  palColor0: boolean
  /** 픽셀 바이트 */
  data: Uint8Array
  /** 팔레트 바이트 (BGR555). 없으면 빈 배열 */
  palette: Uint8Array
}

export interface SplFile {
  resources: readonly SplResource[]
  textures: readonly SplTexture[]
}

/** 구조체 크기 — 전부 `spl_resource.h`에서 세어 온 것이다 */
const HEADER_BYTES = 32
const RESOURCE_BYTES = 88
const SCALE_ANIM_BYTES = 12
const COLOR_ANIM_BYTES = 12
const ALPHA_ANIM_BYTES = 8
const TEX_ANIM_BYTES = 12
const CHILD_BYTES = 20
const TEXTURE_HEADER_BYTES = 32

/** 행동마다 몇 바이트인가. 붙는 차례도 이 순서다 (`SPLManager_LoadResources`) */
const BEHAVIOR_BYTES = {
  gravity: 8,
  random: 8,
  magnet: 16,
  spin: 4,
  collisionPlane: 8,
  convergence: 16,
} as const

/** `s16`으로 읽는다 — 각은 부호가 있다 */
const s16 = (v: DataView, at: number): number => v.getInt16(at, true)
const u16 = (v: DataView, at: number): number => v.getUint16(at, true)
const u32 = (v: DataView, at: number): number => v.getUint32(at, true)
const s32 = (v: DataView, at: number): number => v.getInt32(at, true)

/** 비트 꺼내기 — 폭이 32면 `>>>`가 되도록 나눈다 */
const bits = (word: number, at: number, width: number): number =>
  (word >>> at) & (width >= 32 ? 0xffffffff : (1 << width) - 1)

/** DS 텍스처 크기는 3비트 지수다 (`8 << n`) */
const sizeOf = (n: number): number => 8 << n

function readFlags(word: number): SplFlags {
  return {
    emissionType: bits(word, 0, 4),
    drawType: bits(word, 4, 2),
    circleAxis: bits(word, 6, 2),
    hasScaleAnim: bits(word, 8, 1) !== 0,
    hasColorAnim: bits(word, 9, 1) !== 0,
    hasAlphaAnim: bits(word, 10, 1) !== 0,
    hasTexAnim: bits(word, 11, 1) !== 0,
    hasRotation: bits(word, 12, 1) !== 0,
    randomInitAngle: bits(word, 13, 1) !== 0,
    selfMaintaining: bits(word, 14, 1) !== 0,
    followEmitter: bits(word, 15, 1) !== 0,
    hasChildResource: bits(word, 16, 1) !== 0,
    polygonRotAxis: bits(word, 17, 2),
    polygonReferencePlane: bits(word, 19, 1),
    randomizeLoopedAnim: bits(word, 20, 1) !== 0,
    drawChildrenFirst: bits(word, 21, 1) !== 0,
    hideParent: bits(word, 22, 1) !== 0,
    useViewSpace: bits(word, 23, 1) !== 0,
    hasGravityBehavior: bits(word, 24, 1) !== 0,
    hasRandomBehavior: bits(word, 25, 1) !== 0,
    hasMagnetBehavior: bits(word, 26, 1) !== 0,
    hasSpinBehavior: bits(word, 27, 1) !== 0,
    hasCollisionPlaneBehavior: bits(word, 28, 1) !== 0,
    hasConvergenceBehavior: bits(word, 29, 1) !== 0,
    hasFixedPolygonID: bits(word, 30, 1) !== 0,
    childHasFixedPolygonID: bits(word, 31, 1) !== 0,
  }
}

function readHeader(v: DataView, at: number): SplHeader {
  const flags = readFlags(u32(v, at))
  const rand = u32(v, at + 64)
  const misc0 = u32(v, at + 68)
  const misc1 = u32(v, at + 72)
  const misc2 = u32(v, at + 76)
  return {
    flags,
    emitterBasePos: [s32(v, at + 4), s32(v, at + 8), s32(v, at + 12)],
    emissionCount: s32(v, at + 16),
    radius: s32(v, at + 20),
    length: s32(v, at + 24),
    axis: [s16(v, at + 28), s16(v, at + 30), s16(v, at + 32)],
    color: u16(v, at + 34),
    initVelPosAmplifier: s32(v, at + 36),
    initVelAxisAmplifier: s32(v, at + 40),
    baseScale: s32(v, at + 44),
    aspectRatio: s16(v, at + 48),
    startDelay: u16(v, at + 50),
    minRotation: s16(v, at + 52),
    maxRotation: s16(v, at + 54),
    initAngle: u16(v, at + 56),
    // 58: reserved
    emitterLifeTime: u16(v, at + 60),
    particleLifeTime: u16(v, at + 62),
    random: {
      baseScale: bits(rand, 0, 8),
      lifeTime: bits(rand, 8, 8),
      initVel: bits(rand, 16, 8),
    },
    emissionInterval: bits(misc0, 0, 8),
    baseAlpha: bits(misc0, 8, 8),
    airResistance: bits(misc0, 16, 8),
    textureIndex: bits(misc0, 24, 8),
    loopFrames: bits(misc1, 0, 8),
    dbbScale: bits(misc1, 8, 16),
    textureTileCountS: bits(misc1, 24, 2),
    textureTileCountT: bits(misc1, 26, 2),
    scaleAnimDir: bits(misc1, 28, 3),
    dpolFaceEmitter: bits(misc1, 31, 1) !== 0,
    flipTextureS: bits(misc2, 0, 1) !== 0,
    flipTextureT: bits(misc2, 1, 1) !== 0,
    polygonX: s16(v, at + 80),
    polygonY: s16(v, at + 82),
    userData: bits(u32(v, at + 84), 0, 8),
  }
}

function readBehaviors(v: DataView, at: number, f: SplFlags): [SplBehavior[], number] {
  const out: SplBehavior[] = []
  let o = at
  if (f.hasGravityBehavior) {
    out.push({ kind: 'gravity', magnitude: [s16(v, o), s16(v, o + 2), s16(v, o + 4)] })
    o += BEHAVIOR_BYTES.gravity
  }
  if (f.hasRandomBehavior) {
    out.push({
      kind: 'random',
      magnitude: [s16(v, o), s16(v, o + 2), s16(v, o + 4)],
      applyInterval: u16(v, o + 6),
    })
    o += BEHAVIOR_BYTES.random
  }
  if (f.hasMagnetBehavior) {
    out.push({
      kind: 'magnet',
      target: [s32(v, o), s32(v, o + 4), s32(v, o + 8)],
      force: s16(v, o + 12),
    })
    o += BEHAVIOR_BYTES.magnet
  }
  if (f.hasSpinBehavior) {
    out.push({ kind: 'spin', angle: u16(v, o), axis: u16(v, o + 2) })
    o += BEHAVIOR_BYTES.spin
  }
  if (f.hasCollisionPlaneBehavior) {
    out.push({
      kind: 'collisionPlane',
      y: s32(v, o),
      elasticity: s16(v, o + 4),
      collisionType: bits(u16(v, o + 6), 0, 2),
    })
    o += BEHAVIOR_BYTES.collisionPlane
  }
  if (f.hasConvergenceBehavior) {
    out.push({
      kind: 'convergence',
      target: [s32(v, o), s32(v, o + 4), s32(v, o + 8)],
      force: s16(v, o + 12),
    })
    o += BEHAVIOR_BYTES.convergence
  }
  return [out, o]
}

function readChild(v: DataView, at: number): SplChild {
  const f = u16(v, at)
  const misc0 = u32(v, at + 12)
  const misc1 = u32(v, at + 16)
  return {
    usesBehaviors: bits(f, 0, 1) !== 0,
    hasScaleAnim: bits(f, 1, 1) !== 0,
    hasAlphaAnim: bits(f, 2, 1) !== 0,
    rotationType: bits(f, 3, 2),
    followEmitter: bits(f, 5, 1) !== 0,
    useChildColor: bits(f, 6, 1) !== 0,
    drawType: bits(f, 7, 2),
    polygonRotAxis: bits(f, 9, 2),
    polygonReferencePlane: bits(f, 11, 1),
    randomInitVelMag: s16(v, at + 2),
    endScale: s16(v, at + 4),
    lifeTime: u16(v, at + 6),
    velocityRatio: v.getUint8(at + 8),
    scaleRatio: v.getUint8(at + 9),
    color: u16(v, at + 10),
    emissionCount: bits(misc0, 0, 8),
    emissionDelay: bits(misc0, 8, 8),
    emissionInterval: bits(misc0, 16, 8),
    texture: bits(misc0, 24, 8),
    textureTileCountS: bits(misc1, 0, 2),
    textureTileCountT: bits(misc1, 2, 2),
    flipTextureS: bits(misc1, 4, 1) !== 0,
    flipTextureT: bits(misc1, 5, 1) !== 0,
    dpolFaceEmitter: bits(misc1, 6, 1) !== 0,
  }
}

/**
 * `.spa` 한 벌을 읽는다.
 *
 * ⚠️ **다 읽은 자리가 `texOffset`과 같아야 한다.** 같지 않으면 구조체 크기를
 * 틀린 것이고, 그 뒤의 리소스가 전부 밀려서 **엉뚱한 값이 그럴듯하게** 나온다 —
 * 그래서 조용히 넘기지 않고 던진다
 *
 * @param bytes NARC 멤버 그대로
 */
export function readSpa(bytes: Uint8Array): SplFile {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = u32(v, 0)
  // 바이트로 ` `·A·P·S — 리틀엔디언 u32로 읽으면 이 값이다
  if (magic !== 0x53504120) {
    throw new Error(`.spa가 아니다 — 머리 0x${magic.toString(16)}`)
  }
  const resCount = u16(v, 8)
  const texCount = u16(v, 10)
  const texOffset = u32(v, 24)

  const resources: SplResource[] = []
  let at = HEADER_BYTES
  for (let i = 0; i < resCount; i++) {
    const header = readHeader(v, at)
    at += RESOURCE_BYTES
    const f = header.flags
    let scaleAnim: SplScaleAnim | null = null
    if (f.hasScaleAnim) {
      const curve = u16(v, at + 6)
      scaleAnim = {
        start: s16(v, at),
        mid: s16(v, at + 2),
        end: s16(v, at + 4),
        in: bits(curve, 0, 8),
        out: bits(curve, 8, 8),
        loop: bits(u16(v, at + 8), 0, 1) !== 0,
      }
      at += SCALE_ANIM_BYTES
    }
    let colorAnim: SplColorAnim | null = null
    if (f.hasColorAnim) {
      const curve = u32(v, at + 4)
      const fl = u16(v, at + 8)
      colorAnim = {
        start: u16(v, at),
        end: u16(v, at + 2),
        in: bits(curve, 0, 8),
        peak: bits(curve, 8, 8),
        out: bits(curve, 16, 8),
        randomStartColor: bits(fl, 0, 1) !== 0,
        loop: bits(fl, 1, 1) !== 0,
        interpolate: bits(fl, 2, 1) !== 0,
      }
      at += COLOR_ANIM_BYTES
    }
    let alphaAnim: SplAlphaAnim | null = null
    if (f.hasAlphaAnim) {
      const a = u16(v, at)
      const fl = u16(v, at + 2)
      const curve = u16(v, at + 4)
      alphaAnim = {
        start: bits(a, 0, 5),
        mid: bits(a, 5, 5),
        end: bits(a, 10, 5),
        randomRange: bits(fl, 0, 8),
        loop: bits(fl, 8, 1) !== 0,
        in: bits(curve, 0, 8),
        out: bits(curve, 8, 8),
      }
      at += ALPHA_ANIM_BYTES
    }
    let texAnim: SplTexAnim | null = null
    if (f.hasTexAnim) {
      const param = u32(v, at + 8)
      texAnim = {
        textures: Array.from(bytes.subarray(at, at + 8)),
        frameCount: bits(param, 0, 8),
        step: bits(param, 8, 8),
        randomizeInit: bits(param, 16, 1) !== 0,
        loop: bits(param, 17, 1) !== 0,
      }
      at += TEX_ANIM_BYTES
    }
    let child: SplChild | null = null
    if (f.hasChildResource) {
      child = readChild(v, at)
      at += CHILD_BYTES
    }
    const [behaviors, after] = readBehaviors(v, at, f)
    at = after
    resources.push({ header, scaleAnim, colorAnim, alphaAnim, texAnim, child, behaviors })
  }

  if (at !== texOffset) {
    throw new Error(`리소스 ${String(resCount)}개를 읽고 ${String(at)}에 섰는데`
      + ` 머리는 텍스처가 ${String(texOffset)}에 있다고 한다 — 구조체 크기가 틀렸다`)
  }

  const textures: SplTexture[] = []
  for (let i = 0; i < texCount; i++) {
    const id = u32(v, at)
    const param = u32(v, at + 4)
    const dataSize = u32(v, at + 8)
    const palOffset = u32(v, at + 12)
    const palSize = u32(v, at + 16)
    const total = u32(v, at + 28)
    const format = bits(param, 0, 4)
    textures.push({
      id,
      format,
      width: sizeOf(bits(param, 4, 4)),
      height: sizeOf(bits(param, 8, 4)),
      repeatS: bits(param, 12, 1) !== 0,
      repeatT: bits(param, 13, 1) !== 0,
      flipS: bits(param, 14, 1) !== 0,
      flipT: bits(param, 15, 1) !== 0,
      palColor0: bits(param, 16, 1) !== 0,
      data: bytes.subarray(at + TEXTURE_HEADER_BYTES, at + TEXTURE_HEADER_BYTES + dataSize),
      palette: palSize === 0
        ? new Uint8Array(0)
        : bytes.subarray(at + palOffset, at + palOffset + palSize),
    })
    at += total
  }

  if (at !== bytes.length) {
    throw new Error(`텍스처 ${String(texCount)}개를 읽고 ${String(at)}에 섰는데`
      + ` 파일은 ${String(bytes.length)}바이트다`)
  }

  return { resources, textures }
}
