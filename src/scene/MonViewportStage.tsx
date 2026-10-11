// 메뉴 창 구멍 안의 3D 포켓몬 무대 (SYSTEM §2.4). `Stage.tsx`의 `SceneBoundary` 안에 선다.
//
// 이 컴포넌트는 **월드 씬에 아무것도 안 넣는다.** 자기 `Scene` · `PerspectiveCamera`(fov 30) · 고정 낮 조명을 갖고,
// 메인 프레임이 나간 뒤 `monViewportPass`가 그 장면을 구멍 사각형에 그린다. 안개는 없다. 월드의 시간대 · 안개 ·
// 1인칭 화각이 몸에 안 묻는다.
//
// 구멍이 없으면(`hole === null`) 몸을 안 받고 아무것도 안 한다 — 메뉴가 닫힌 동안의 비용은 0이다.
//
// 구성
//   몸         `useMonBody`(같은 캐시). 키를 누르고 있는 동안은 **120ms 머문 종만** 받는다
//   조명       배틀 낮 값 고정 — 반구광 · 해 [8,14,9] · 카메라 쪽 채움 (`BattleStage`의 `TIME_LOOKS[1]`)
//   뒷배경     판 메시 하나. 세로 그러데이션이고 색은 **창 얼굴에서 따온다** — 구멍의 자리에 해당하는 얼굴 색을
//              구멍 요소의 CSS 변수에서 읽고(3D 쪽에 hex가 없다), 렌더러가 마지막에 거는 톤 매핑을 미리 거슬러
//              둔다(`precompensate`). 그래서 구멍 가장자리에 이음매가 안 선다
//   구도       대기 0프레임에서 `Box3`를 잰다. 울음 동작이 넓히는 만큼 1.3배까지 더한다(`framedSize`).
//              키가 구멍 높이의 78% · 발이 아래 12% (`fitCamera`)
//   움직임     `wait` 되풀이. 종이 바뀌면 `cry` 한 번. y축 ±20°를 8s에 흔든다 (움직임을 줄이는 설정이면 안 흔든다)
//   그림자     발밑에 원판 하나 (그림자 맵은 안 쓴다)
//
// 예산: 그리기 호출은 몸 하나와 판 둘(뒷배경 · 발밑). 구멍은 CSS 320×320 이하.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Box3, Color, DirectionalLight, Float32BufferAttribute, HemisphereLight, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Group, Vector3, type AnimationAction, type Texture,
} from 'three'
import { loadMonModel, motionClip, motionClipSeconds, play, type MonBody } from './battle/monModel'
import { useMonBody } from './monBody'
import { makeBlobShadow, TIME_LOOKS } from './fx/sky'
import { setViewportFrame, type ViewportFrame } from './monViewportPass'
import {
  FIT, faceColorAt, fitCamera, framedSize, precompensate, swayAngle, type Rgb, type Rect,
} from './monViewportMath'
import { specKey, useMonViewportStore, type MonViewportSpec } from '../state/monViewportStore'

/** 이만큼 머문 종만 몸을 받는다 (ms) — ↑↓를 누르고 있는 동안 몸을 계속 받지 않는다 */
export const SETTLE_MS = 120

/** 뒷배경 판의 가로 줄 수. 창 얼굴 그러데이션(멈춤점 셋)을 줄마다 샘플해 잇는다 */
const STRIPS = 8

/** 해 · 채움 · 반구 — 배틀 낮 값이다 (`BattleStage`가 `TIME_LOOKS`의 이 줄을 쓴다) */
const DAY = TIME_LOOKS[1]!

interface Measure {
  /** 발 = 0 기준 키 · 가로 폭 */
  height: number
  width: number
}

/** 몸을 재서 발이 y=0 · 가운데가 x=z=0에 오게 옮긴다. 못 재면 `tall`로 떨어진다 */
function standBody(body: MonBody): Measure {
  body.mixer.update(0)
  body.root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(body.root, true)
  const size = box.getSize(new Vector3())
  if (box.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) {
    return { height: body.tall, width: body.tall * 0.6 }
  }
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  body.root.position.set(-cx, -box.min.y, -cz)
  return framedSize({ height: size.y, width: Math.max(size.x, size.z) }, cryReach(body))
}

/** 울음 동작을 이 간격(초)으로 짚어 잰다 */
const CRY_SAMPLE_S = 0.1

/**
 * 울음 동작 동안 몸이 닿는 키와 폭 — 발과 가운데는 대기 자세에 맞춰 옮겨 둔 뒤다(`standBody`). 잰 뒤에는 대기 0프레임으로
 * 되돌린다. 울음 동작이 없거나 움직임을 줄이는 설정이면(`cryOnce`가 안 운다) `null`
 */
function cryReach(body: MonBody): { height: number, width: number } | null {
  const clip = motionClip(body, 'cry')
  if (clip === null || prefersReducedMotion()) return null
  const rest = body.action
  const cry = body.mixer.clipAction(clip)
  rest?.setEffectiveWeight(0)
  cry.reset().play()
  let height = 0
  let half = 0
  const box = new Box3()
  for (let t = 0; t <= clip.duration; t += CRY_SAMPLE_S) {
    cry.time = t
    body.mixer.update(0)
    body.root.updateMatrixWorld(true)
    box.setFromObject(body.root, true)
    if (box.isEmpty()) continue
    height = Math.max(height, box.max.y)
    half = Math.max(half, -box.min.x, box.max.x, -box.min.z, box.max.z)
  }
  cry.stop()
  rest?.setEffectiveWeight(1)
  body.mixer.update(0)
  body.root.updateMatrixWorld(true)
  return height > 0 ? { height, width: half * 2 } : null
}

function toGender(g: MonViewportSpec['gender']): 'male' | 'female' | 'genderless' {
  return g === 'none' ? 'genderless' : g
}

/** 종이 120ms 머무를 때까지 기다린다. 처음 서는 종과 비는 것은 바로 받는다 */
function useSettled(spec: MonViewportSpec | null): MonViewportSpec | null {
  const [settled, setSettled] = useState(spec)
  const key = spec === null ? null : specKey(spec)
  const settledKey = settled === null ? null : specKey(settled)
  useEffect(() => {
    if (key === settledKey) return
    if (spec === null || settled === null) {
      setSettled(spec)
      return
    }
    const timer = setTimeout(() => { setSettled(spec) }, SETTLE_MS)
    return () => { clearTimeout(timer) }
    // `spec`은 `key`가 정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settledKey])
  return settled
}

/** 움직임을 줄이는 설정인가 (브라우저 · 운영체제 값) */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * `cry` 한 번 뒤 `wait`로 돌아간다. 이 종에 울음 동작이 없으면 안 한다 — 없는 동작은 대신 `wait`가 트는데,
 * 그것은 한 번만 돌고 멎는다(`play`의 `LoopOnce`)
 */
function cryOnce(b: MonBody): void {
  if (prefersReducedMotion() || motionClipSeconds(b, 'cry') === null) return
  play(b, 'cry')
  const mine = b.action
  const done = (e: { action: AnimationAction }): void => {
    if (e.action !== mine) return
    b.mixer.removeEventListener('finished', done as never)
    play(b, 'wait')
  }
  b.mixer.addEventListener('finished', done as never)
}

interface Rig {
  scene: Scene
  camera: PerspectiveCamera
  /** 몸이 서는 축. 흔들림은 이것을 돌린다 */
  pivot: Group
  backdrop: Mesh
  shadow: Mesh | null
  shadowTexture: Texture | null
  dispose: () => void
}

function makeRig(): Rig {
  const scene = new Scene()
  const camera = new PerspectiveCamera(FIT.fov, 1, 0.05, 600)
  scene.add(camera)

  const sky = new Color(DAY.skyColor)
  const hemi = new HemisphereLight(sky, new Color(DAY.groundColor), DAY.ambient)
  const sun = new DirectionalLight(new Color(DAY.sunColor), DAY.sun)
  sun.position.set(8, 14, 9)
  const fill = new DirectionalLight(sky, DAY.fill)
  fill.position.set(-7, 6, 12)
  scene.add(hemi, sun, fill)

  const pivot = new Group()
  scene.add(pivot)

  // 뒷배경 — 카메라의 자식. 크기와 거리는 구도가 바뀔 때 `fit`이 맞춘다
  const geometry = new PlaneGeometry(1, 1, 1, STRIPS)
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array((STRIPS + 1) * 2 * 3).fill(1), 3))
  const backdropMaterial = new MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, fog: false })
  const backdrop = new Mesh(geometry, backdropMaterial)
  backdrop.renderOrder = -10
  backdrop.frustumCulled = false
  camera.add(backdrop)

  // 발밑 그림자 — 원판 하나
  const shadowTexture = makeBlobShadow()
  let shadow: Mesh | null = null
  let shadowMaterial: MeshBasicMaterial | null = null
  if (shadowTexture) {
    shadowTexture.colorSpace = SRGBColorSpace
    shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, fog: false })
    shadow = new Mesh(new PlaneGeometry(1, 1), shadowMaterial)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.004
    shadow.renderOrder = -5
    scene.add(shadow)
  }

  return {
    scene, camera, pivot, backdrop, shadow, shadowTexture,
    dispose: () => {
      geometry.dispose()
      backdropMaterial.dispose()
      shadow?.geometry.dispose()
      shadowMaterial?.dispose()
      shadowTexture?.dispose()
    },
  }
}

/** CSS 변수 `--mv-face-*`(구멍 요소가 내보낸다)를 sRGB 값으로 읽는다. 못 읽으면 null */
function readFace(el: HTMLElement): { top: Rgb, mid: Rgb, bottom: Rgb } | null {
  const css = getComputedStyle(el)
  const read = (name: string): Rgb | null => {
    const raw = css.getPropertyValue(name).trim()
    if (raw === '') return null
    const c = new Color()
    c.setStyle(raw, SRGBColorSpace)
    const out = { r: 0, g: 0, b: 0 }
    c.getRGB(out, SRGBColorSpace)
    return [out.r, out.g, out.b]
  }
  const top = read('--mv-face-top')
  const mid = read('--mv-face-mid')
  const bottom = read('--mv-face-bottom')
  return top && mid && bottom ? { top, mid, bottom } : null
}

export function MonViewportStage() {
  const hole = useMonViewportStore((s) => s.hole)
  const spec = hole?.spec ?? null
  const settled = useSettled(spec)
  const key = settled === null ? null : specKey(settled)
  const rig = useMemo(makeRig, [])
  const gl = useThree((s) => s.gl)
  useEffect(() => () => { rig.dispose() }, [rig])
  // 무대가 통째로 내려갈 때(장치 손실로 `<Canvas key>`가 다시 설 때) 보고를 거둔다 — 아래 몸 효과의 cleanup과 같은 까닭
  useEffect(() => () => { useMonViewportStore.getState().report(null) }, [])

  const body = useMonBody(settled?.species ?? null, {
    ...(settled ? { form: settled.form, gender: toGender(settled.gender), shiny: settled.shiny } : {}),
  })

  // 이 종의 모델이 아예 없다 — 2D가 대신 서므로 기다리지 않는다
  useEffect(() => {
    if (settled === null || key === null) return
    let alive = true
    void loadMonModel(settled.species, settled.form, { gender: toGender(settled.gender), shiny: settled.shiny })
      .then((loaded) => { if (alive && loaded === null) useMonViewportStore.getState().report(key, 'none') })
      .catch(() => { if (alive) useMonViewportStore.getState().report(key, 'none') })
    return () => { alive = false }
  }, [settled, key])

  const measure = useRef<Measure | null>(null)

  // 몸이 서면 축에 꽂고 잰다
  useEffect(() => {
    if (body === null || key === null) return
    const m = standBody(body)
    measure.current = m
    rig.pivot.add(body.root)
    rig.pivot.rotation.y = 0
    if (rig.shadow) rig.shadow.scale.setScalar(Math.max(0.3, m.width * 1.5))
    cryOnce(body)
    useMonViewportStore.getState().report(key, 'ready')
    return () => {
      rig.pivot.remove(body.root)
      measure.current = null
      // ⚠️ **몸이 내려가면 보고도 거둔다.** 안 거두면 스토어가 `model`로 남은 채 프레임만 사라져
      // (`setViewportFrame(null)`) 창에는 구멍만 뚫리고 3D는 안 그려진다 — 월드가 비친다.
      // 거두면 `viewportMode`가 2D 앞모습으로 내려간다. 다른 몸의 보고는 건드리지 않는다
      if (useMonViewportStore.getState().shown?.key === key) useMonViewportStore.getState().report(null)
    }
  }, [body, key, rig])

  // Z로 울 때 — 소리는 부른 쪽이 낸다. 몸은 울음 동작을 한 번 한다
  const cryNonce = useMonViewportStore((s) => s.cryNonce)
  const seenNonce = useRef(cryNonce)
  useEffect(() => {
    if (cryNonce === seenNonce.current) return
    seenNonce.current = cryNonce
    if (body !== null) cryOnce(body)
  }, [cryNonce, body])

  // 그리기 직전 — 구멍 크기가 바뀌었으면 구도 · 뒷배경을 다시 맞춘다
  const last = useRef({ aspect: 0, tTop: -1, tBottom: -1, height: 0, width: 0, token: 0, tick: 0 })
  useEffect(() => {
    if (body === null || key === null) {
      setViewportFrame(null)
      return
    }
    const prepare = (view: Rect, el: HTMLElement): void => {
      const m = measure.current
      const holeNow = useMonViewportStore.getState().hole
      if (m === null || holeNow === null) return
      const aspect = view.w / view.h
      const win = holeNow.win
      // 창 얼굴 위의 어디인가 — 구멍의 위아래 가장자리가 창 높이의 몇 할인가
      let tTop = 0
      let tBottom = 1
      if (win !== null) {
        const w = win.getBoundingClientRect()
        const inner = win.clientHeight || w.height
        const edge = win.clientTop
        const r = el.getBoundingClientRect()
        tTop = (r.top - w.top - edge) / inner
        tBottom = (r.bottom - w.top - edge) / inner
      }
      const was = last.current
      was.tick += 1
      const colorsStale = was.token !== holeNow.token || was.tick % 60 === 0
      if (
        was.aspect === aspect && was.height === m.height && was.width === m.width
        && was.tTop === tTop && was.tBottom === tBottom && !colorsStale
      ) return
      last.current = { aspect, tTop, tBottom, height: m.height, width: m.width, token: holeNow.token, tick: was.tick }

      // 구도
      const fit = fitCamera({ height: m.height, width: m.width, aspect })
      const cam = rig.camera
      cam.aspect = aspect
      cam.position.set(0, fit.targetY, fit.distance)
      cam.lookAt(0, fit.targetY, 0)
      cam.updateProjectionMatrix()

      // 뒷배경 — 몸 뒤 한참(몸 깊이보다 멀리)에 두고 시야를 꽉 채운다
      const away = fit.distance + Math.max(m.height, m.width) + 1
      const h = 2 * Math.tan((FIT.fov * Math.PI) / 360) * away * 1.04
      rig.backdrop.position.set(0, 0, -away)
      rig.backdrop.scale.set(h * aspect, h, 1)
      const face = readFace(el)
      if (face) paintBackdrop(rig.backdrop, face, tTop, tBottom, exposureOf(gl))
    }
    const frame: ViewportFrame = { scene: rig.scene, camera: rig.camera, key, prepare }
    setViewportFrame(frame)
    return () => { setViewportFrame(null) }
  }, [body, key, rig, gl])

  useFrame(({ clock }) => {
    if (body === null) return
    rig.pivot.rotation.y = swayAngle(clock.elapsedTime, prefersReducedMotion())
  })

  // 구멍이 닫히면 아무것도 안 남는다
  useEffect(() => {
    if (hole === null) useMonViewportStore.getState().report(null)
  }, [hole])

  return null
}

/** 렌더러의 노출 — `Stage.makeRenderer`가 정한 값을 읽는다 */
function exposureOf(gl: unknown): number {
  const e = (gl as { toneMappingExposure?: number }).toneMappingExposure
  return typeof e === 'number' && e > 0 ? e : 1
}

/** 렌더러가 마지막에 거는 톤 매핑을 거슬러 둔 색을 줄마다 칠한다 (선형 색, 1을 넘을 수 있다) */
function paintBackdrop(
  backdrop: Mesh, face: { top: Rgb, mid: Rgb, bottom: Rgb }, tTop: number, tBottom: number, exposure: number,
): void {
  const attr = backdrop.geometry.getAttribute('color')
  const tmp = new Color()
  for (let i = 0; i <= STRIPS; i++) {
    const t = tTop + (tBottom - tTop) * (i / STRIPS)
    const [r, g, b] = faceColorAt(t, face.top, face.mid, face.bottom)
    tmp.setRGB(r, g, b, SRGBColorSpace)
    const [lr, lg, lb] = precompensate([tmp.r, tmp.g, tmp.b], exposure)
    // PlaneGeometry는 줄마다 정점 둘(왼 · 오른)이고 위 줄이 먼저다
    attr.setXYZ(i * 2, lr, lg, lb)
    attr.setXYZ(i * 2 + 1, lr, lg, lb)
  }
  attr.needsUpdate = true
}
