import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Sprite,
  type SpriteMaterial,
} from 'three'
import type { BattleView } from '../../engine/battle/view'
import type { SlotId } from '../../engine/battle/events'
import { vars } from '../../ui/theme/contract.css'
import { retireTexture } from '../retireTexture'

type SpotAt = (slot: SlotId) => readonly [number, number]
type Hit = NonNullable<BattleView['lastHit']>

/**
 * 효과마다 글자 색.
 *
 * ⚠️ **'반감'은 밝게 둔다.** `#b8d5ef`(상대 휘도 0.64)였을 때 어두운 동굴 벽 위에서
 * 잘 안 읽혔다 (리뷰 I-p04-13). 테두리가 이미 짙어서 글자 쪽을 올린다 — 흰색(보통)과는
 * 푸른 기로만 갈린다
 */
export const DAMAGE_COLOR: Record<Hit['level'], string> = {
  super: '#ffe04d',
  resisted: '#dfeaff',
  immune: '#d8d8e0',
  normal: '#ffffff',
}

/** 띄울 글 — 막혀서 0이면 숫자 대신 `BLOCK` */
export function damageText(amount: number): string {
  return amount > 0 ? `-${String(amount)}` : 'BLOCK'
}

/**
 * UI 글꼴 (`vars.font.ui` = Pretendard). `vars.font.ui`는 `var(--…)`라 캔버스가
 * 못 읽는다 — 테마 클래스 아래 있는 요소(R3F 캔버스)에서 풀어서 쓴다
 * (`ui/field/cutInCanvas`의 `pixelFont`와 같은 길). 못 풀면 그 요소가 물려받은 글꼴
 */
export function uiFontStack(style: Pick<CSSStyleDeclaration, 'getPropertyValue' | 'fontFamily'>): string {
  const name = /var\((--[^),]+)/.exec(vars.font.ui)?.[1]
  const got = name ? style.getPropertyValue(name).trim() : ''
  return got || style.fontFamily || 'sans-serif'
}

/** 캔버스 `font` — Pretendard는 400·700 두 벌만 싣는다 (`ui/theme/fonts.css`). 900을 달라 해도 700이 온다 */
export function damageFont(crit: boolean, family: string): string {
  return `700 ${crit ? '72' : '64'}px ${family}`
}

function drawDamage(canvas: HTMLCanvasElement, hit: Pick<Hit, 'amount' | 'level' | 'crit'>, family: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is unavailable')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const amount = damageText(hit.amount)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.font = damageFont(hit.crit, family)
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(30,10,15,.9)'
  ctx.strokeText(amount, 128, 64)
  ctx.fillStyle = DAMAGE_COLOR[hit.level]
  ctx.fillText(amount, 128, 64)
}

function damageTexture(hit: Pick<Hit, 'amount' | 'level' | 'crit'>, family: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  drawDamage(canvas, hit, family)

  const texture = new CanvasTexture(canvas)
  // 이름은 **GPU 라벨로 그대로 간다** — three가 `texture.name`을 쓴다
  // (`WebGPUTextureUtils`). 안 붙이면 드라이버 오류가 `unlabeled`라고만 말해서
  // 임자를 못 짚는다 (REPAIR §48)
  texture.name = 'damage-popup'
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/** 떠오르는 높이 (마리 자리 기준 월드 y) — 1.05초에 걸쳐 솟았다 조금 더 올라간다 */
export function popupHeight(progress: number): number {
  return 1.4 + Math.sin(progress * Math.PI) * 0.42 + progress * 0.5
}

/** 글자 윗변이 넘지 않을 NDC y — 화면 위 끝에서 3% 띄운다 */
export const POPUP_TOP_NDC = 0.94

const ndcCenter = new Vector3()
const ndcTop = new Vector3()
const cameraUp = new Vector3()

/**
 * 화면 위로 나가면 끌어내린다 (`world`를 고친다).
 *
 * ⚠️ **높이가 월드에 고정이라 카메라가 가까우면 화면 밖이다.** 고정 높이는 정점에서
 * ≈2.3인데, 체육관·동굴의 낮고 가까운 카메라에서는 상대 마리 위 그 높이가 화면 위
 * 끝을 넘어 숫자 아랫도리만 걸렸다 (리뷰 I-p04-13 · I-p10-13). 그래서 글자의
 * **윗변**(가운데 + 카메라 위쪽 × 반높이)을 투영해 `top`을 넘은 만큼 가운데를 NDC에서
 * 내리고, 같은 깊이로 되돌려 놓는다 — 화면에서 곧장 아래로만 움직인다.
 * 카메라 뒤(NDC z가 [-1, 1] 밖)면 건드리지 않는다
 */
export function keepOnScreen(world: Vector3, halfHeight: number, camera: Camera, top = POPUP_TOP_NDC): Vector3 {
  ndcCenter.copy(world).project(camera)
  if (ndcCenter.z < -1 || ndcCenter.z > 1) return world
  cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
  ndcTop.copy(world).addScaledVector(cameraUp, halfHeight).project(camera)
  const over = ndcTop.y - top
  if (over <= 0) return world
  ndcCenter.y -= over
  return world.copy(ndcCenter).unproject(camera)
}

/** 글꼴이 안 오면 이만큼 기다리고 폴백 글꼴로 띄운다 (온 뒤에 다시 그린다) */
const FONT_WAIT = 0.25

const placed = new Vector3()

function DamagePopup({ hit, at }: { hit: Hit; at: readonly [number, number] }) {
  const sprite = useRef<Sprite>(null)
  const material = useRef<SpriteMaterial>(null)
  const elapsed = useRef(0)
  const waited = useRef(0)
  const fontReady = useRef(false)
  const host = useThree((s) => s.gl.domElement)
  const family = useMemo(() => uiFontStack(getComputedStyle(host)), [host])
  // ⚠️ **타격 하나에 한 번만 굽는다.** 예전엔 `[view]`에 묶여서 대사가 넘어갈 때마다
  // (= 사건마다 새 view) 텍스처를 다시 만들고 아래 effect가 `elapsed`를 0으로 돌려,
  // 지난 숫자가 대사마다 다시 튀어 올랐다 — 쓰러진 빈 자리에도 떴다 (리뷰 I-p17-7).
  // `lastHit`은 지워지지 않고 `seq`만 오른다(`engine/battle/view`) — 새 타격은 `key={seq}`로
  // 새로 붙고, 같은 타격 안에서는 값이 그대로라 다시 안 굽는다
  const { amount, level, crit } = hit
  const texture = useMemo(
    () => damageTexture({ amount, level, crit }, family),
    [amount, level, crit, family],
  )
  useEffect(() => {
    elapsed.current = 0
    waited.current = 0
    let alive = true
    const font = damageFont(crit, family)
    const text = damageText(amount)
    // 캔버스는 글꼴이 올 때까지 기다려 주지 않는다 — 안 온 채 그리면 폴백으로 굳는다.
    // 와 있으면 바로 띄우고, 아니면 받아서 다시 그린 뒤 띄운다
    fontReady.current = document.fonts.check(font, text)
    void document.fonts.load(font, text).catch(() => []).then(() => {
      if (!alive || fontReady.current) return
      drawDamage(texture.image as HTMLCanvasElement, { amount, level, crit }, family)
      texture.needsUpdate = true
      fontReady.current = true
    })
    return () => {
      alive = false
      // 미뤄서 버린다 — 그 자리에서 버리면 제출 중인 프레임이 문다 (REPAIR §48)
      retireTexture(texture)
    }
  }, [texture, amount, level, crit, family])
  useFrame(({ camera }, dt) => {
    const s = sprite.current
    if (!s || !material.current) return
    if (!fontReady.current && waited.current < FONT_WAIT) {
      waited.current += dt
      s.visible = false
      return
    }
    elapsed.current += dt
    const progress = Math.min(1, elapsed.current / 1.05)
    const scale = 0.7 + Math.sin((Math.min(1, progress * 2) * Math.PI) / 2) * 0.35
    s.scale.set(1.35 * scale, 0.68 * scale, 1)
    placed.set(at[0], popupHeight(progress), at[1])
    if (s.parent) {
      s.parent.localToWorld(placed)
      keepOnScreen(placed, s.scale.y / 2, camera)
      s.parent.worldToLocal(placed)
    }
    s.position.copy(placed)
    material.current.opacity = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28
    s.visible = progress < 1
  })
  return (
    <sprite ref={sprite} position={[at[0], popupHeight(0), at[1]]} renderOrder={21} visible={false}>
      <spriteMaterial
        ref={material}
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  )
}

/**
 * 무대 위에 뜨는 글자 — **입은 피해뿐이다.**
 *
 * 원작(DS)에는 떠오르는 피해 숫자가 없다 — 우리가 더한 연출이라 읽히는 것만 맞춘다.
 *
 * 이름과 레벨을 띄우는 판이 여기 같이 있었다. 무대 위 두 자리에 늘 떠 있으니
 * 몬스터가 가려지고, 카메라가 도는 동안 판 둘이 화면 위쪽을 계속 덮었다.
 * 그 값은 이미 화면 위아래의 체력 상자(`BattleScreen`)가 이름·레벨·성별까지
 * 다 적고 있어서, 무대에 한 벌 더 띄울 이유가 없다
 */
export function BattleWorldLabels(
  { view, spotAt }: { view: BattleView; spotAt: SpotAt },
) {
  const hit = view.lastHit
  if (!hit) return null
  return <DamagePopup key={hit.seq} hit={hit} at={spotAt(hit.slot)} />
}
