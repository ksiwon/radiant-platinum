// 사천왕 · 챔피언의 조우 컷인 (`EncounterEffect_EliteFourChampion` · EC:3213-3593 · `overlay005/encounter_effect.c` EE:1350-1600)
//
// 원작 표의 20~24번이다. 흐름:
//
//   ① 화면을 한 장 붙잡아 BG3에 얼린다 — 이후 들판은 그 사진이다 (`ov5_021DEFA0` · 여덟 틱 뒤 `ov5_021DF30C`로 갈아 끼운다)
//   ② 흰 번쩍임 한 번 → 주인공 얼굴이 왼쪽에서(−128 → 56) · 상대 얼굴이 오른쪽에서(384 → 200) 리그 띠를 끌고 들어온다
//   ③ 입자 107(세 이미터)이 가운데서 터지고 VS 표 넷이 (128, 96)에 앉는다 · 이름 판이 오른쪽 아래(x 168 · y 104)에 선다
//   ④ 입자가 다 죽으면 흰 번쩍임에 두 얼굴이 제 색이 되고 띠가 한 틱에 한 칸씩 돈다 · 입자 108(넷)이 얼굴 뒤로 흩날린다
//   ⑤ 두 얼굴이 두 틱마다 엇갈려 떨다가(0 → −2 · 사천왕 32틱 · 챔피언 9틱) 대각선으로 빠지며 여덟 단에 희게 닫힌다
//
// ⚠️ **얼린 들판은 4/16 밝기다.** 붙잡기가 `GX_CAPTURE_MODE_AB`(A × 4 + B × 12) ÷ 16이고 B가 `SRCB_VRAM_0x00000`이다 — 들판의
// 화면 방식(`GX_DISPMODE_GRAPHICS`)에서 DISPCNT의 VRAM 블록은 A고 A는 텍스처로 잡혀 있어(LCDC가 아니다) 0으로 읽힌다. 그래서 얼린
// 사진은 원래의 1/4이다. 롬을 실제로 돌려 잰 값이 아니라 레지스터 셈으로 낸 값이다
//
// ⚠️ **주인공 얼굴은 어두울 때 성별을 뒤바꾼 팔레트다** (원작 버그 — `v0->unk_368 ? 0 : 1`) · 밝아질 때 제 것으로 돌아온다.
//
// 층 차례: VS(OBJ 0) > 입자(BG0 · ⑤ 전까지 0) > 이름(BG2 · 0) > 얼굴 · 띠(OBJ 1) > 얼린 들판(BG3 · 3). ④에서 BG0이 1로 내려가
// 얼굴 뒤가 된다(`Bg_SetPriority(BG_LAYER_MAIN_0, 1)`).
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import type { CutInFrame, CutInParticle, CutInSprite } from './encounterCutIn'
import { frameOf, type SpecialCutIn } from './cutInTrainer'
import { BrightnessFade, DsFlash, FX, fx, LinearS32, QuadFX, VsStamp } from './cutInDs'
import type { CutInContext } from './cutInBanner'
import { makeEmitter, type SplEmitter } from './spl/emitter'
import { cosIdx, FX32_ONE, sinIdx } from './spl/fx'
import { FX16_ONE, type SplFile } from './spl/resource'

/** 사천왕 넷 · 챔피언 (`sEliteFourChampionEncounterParams` · EC:2730) — 트레이너 번호 · 얼굴 떠는 틱 */
const ELITES = [[261, 32], [262, 32], [263, 32], [264, 32], [267, 9]] as const
/** 입자 카메라 — 정사영 위아래 ±4가 192줄 (`sParticleSystemDefaultCameraPos` (0, 0, 4) · 반화각 45° → top = tan 45° × 4) */
const PX_PER_UNIT = 192 / 8
/** 얼린 들판의 어둡기 — 1 − 4/16 */
const FROZEN_DARK = 12 / 16

interface Live { file: SplFile, index: number, emitter: SplEmitter }

/** 입자를 DS 픽셀 사각형으로 (`SPLDraw_Billboard` — 107 · 108은 일곱 리소스가 다 빌보드다) */
function quadsOf(live: readonly Live[]): CutInParticle[] {
  const out: CutInParticle[] = []
  const span = (tiles: number, flip: boolean): number => (flip ? -1 : 1) * (1 << tiles)
  // 늦게 선 이미터가 먼저 그려진다 (`SPL_DRAW_ORDER_REVERSE`)
  for (let e = live.length - 1; e >= 0; e--) {
    const { file, index, emitter } = live[e]!
    const res = file.resources[index]!
    const h = res.header
    const put = (p: SplEmitter['particles'][number], child: boolean): void => {
      const alpha = (p.baseAlpha * (p.animAlpha + 1)) >> 5
      if (alpha === 0) return
      let sy = p.baseScale / FX32_ONE
      let sx = sy * (h.aspectRatio / FX16_ONE)
      const anim = p.animScale / FX16_ONE
      if (h.scaleAnimDir === 0) { sx *= anim; sy *= anim } else if (h.scaleAnimDir === 1) sx *= anim
      else sy *= anim
      const tex = file.textures[child ? res.child!.texture : p.texture]
      if (tex === undefined) return
      const s = sinIdx(p.rotation) / FX32_ONE, c = cosIdx(p.rotation) / FX32_ONE
      const k = PX_PER_UNIT
      out.push({
        tex,
        x: 128 + ((p.position.x + p.emitterPos.x) / FX32_ONE) * k,
        y: 96 - ((p.position.y + p.emitterPos.y) / FX32_ONE) * k,
        // 월드 y가 위라 화면으로 뒤집는다
        ax: c * sx * k, ay: -s * sx * k, bx: -s * sy * k, by: -c * sy * k,
        qx: child ? 0 : h.polygonX / FX16_ONE, qy: child ? 0 : h.polygonY / FX16_ONE,
        us: child ? span(res.child!.textureTileCountS, res.child!.flipTextureS) : span(h.textureTileCountS, h.flipTextureS),
        vs: child ? span(res.child!.textureTileCountT, res.child!.flipTextureT) : span(h.textureTileCountT, h.flipTextureT),
        r: (p.color & 31) / 31, g: ((p.color >>> 5) & 31) / 31, b: ((p.color >>> 10) & 31) / 31,
        a: alpha / 31,
      })
    }
    const kids = (): void => { for (const p of emitter.children) put(p, true) }
    if (h.flags.drawChildrenFirst) kids()
    if (!h.flags.hideParent) for (const p of emitter.particles) put(p, false)
    if (!h.flags.drawChildrenFirst) kids()
  }
  return out
}

/** 20~24 사천왕 · 챔피언 */
class EliteFour implements SpecialCutIn {
  private state = 0
  private f: CutInFrame = frameOf()
  private flash: DsFlash | null = null
  private flashTicks = 0
  private switchAsked = false
  private frozen = false
  private ready = false
  private readyNext = false
  private spa: SplFile | null = null
  private live: Live[] = []
  private particlesFront = true
  private xl: QuadFX | null = null
  private xr: QuadFX | null = null
  private left = { x: 0, y: 0 }
  private right = { x: 0, y: 0 }
  /** 이 틱에 선 두 얼굴 — 떨기 · 빠지기는 `left` · `right`(기준)에서 민다 */
  private shown = { l: { x: 0, y: 0 }, r: { x: 0, y: 0 } }
  private readonly vs = new VsStamp(128, 96)
  private vsOn = false
  private countdown = 0
  private bri: LinearS32 | null = null
  private bright = 0
  private lit = false
  private animTicks = -1
  private nameOn = false
  private shA: QuadFX | null = null
  private shB: QuadFX | null = null
  private exitA: QuadFX | null = null
  private exitB: QuadFX | null = null
  private whiteOut: BrightnessFade | null = null
  private finished = false
  private seed = 0x5eed_0e4f
  private readonly name: string
  private readonly pan: number
  private readonly player: string

  constructor(private readonly elite: number, private readonly ctx: CutInContext) {
    const [trainer, pan] = ELITES[elite]!
    this.name = ctx.trainerName(trainer)
    this.pan = pan
    this.player = ctx.playerGender === 1 ? 'playerFemale' : 'playerMale'
  }

  private emit(n: number): void {
    if (!this.spa) return
    for (let i = 0; i < n; i++) {
      const e = makeEmitter(this.spa, i, (this.seed = (this.seed * 1103515245 + 12345) >>> 0))
      if (e) this.live.push({ file: this.spa, index: i, emitter: e })
    }
  }

  tick(): CutInFrame {
    this.f = frameOf()
    if (this.finished) { this.f.flash = 1; this.f.done = true; return this.f }
    if (this.readyNext) this.ready = true
    this.step()
    if (this.finished) { this.f.flash = 1; this.f.done = true; return this.f }
    // 효과 태스크 끝 — 스프라이트 애니 · 입자 (`4 < state`)
    if (this.animTicks >= 0) this.animTicks++
    if (this.state > 4) {
      for (const l of this.live) l.emitter.update()
      this.live = this.live.filter((l) => !l.emitter.done)
    }
    this.flash?.tick()
    // V블랭크 뒤 — 얼린 사진으로 갈아 끼우고(`ov5_021DF258`), 다음 틱의 태스크가 준비를 알린다(`ov5_021DF28C`)
    if (this.switchAsked && !this.frozen) { this.frozen = true; this.readyNext = true }
    if (this.whiteOut) { this.whiteOut.exec(); this.bright = this.whiteOut.value }
    this.compose()
    return this.f
  }

  private step(): void {
    switch (this.state) {
      case 0: this.state = 1; break
      // 스프라이트를 세우고 화면을 붙잡는다 (`ov5_021DEFA0`)
      case 1: this.state = 2; break
      case 2:
        this.flash = new DsFlash(16, 1)
        this.flashTicks = 0
        this.state = 3
        break
      case 3:
        if (++this.flashTicks === 8) this.switchAsked = true
        if (this.flash!.done) this.state = 4
        break
      case 4:
        if (!this.ready) break
        this.spa = this.ctx.particles(1)
        this.state = 5
        break
      case 5:
        this.xl = new QuadFX(fx(-128), fx(56), fx(80), 6)
        this.xr = new QuadFX(fx(384), fx(200), fx(-80), 6)
        this.left = { x: -128, y: 92 }
        this.right = { x: 384, y: 92 }
        this.countdown = 3
        this.state = 6
        break
      case 6: {
        if (this.countdown > 0) {
          if (--this.countdown === 0) { this.emit(3); this.nameOn = true }
        } else { this.vsOn = true; this.vs.step() }
        this.xl!.update()
        this.left = { x: this.xl!.value / FX, y: 92 }
        const done = this.xr!.update()
        this.right = { x: this.xr!.value / FX, y: 92 }
        if (done) this.state = 7
        break
      }
      case 7: {
        const stamped = this.vs.step()
        if (!stamped || this.live.length > 0) break
        this.bri = new LinearS32(0, 16, 3)
        this.spa = null
        this.live = []
        this.state = 8
        break
      }
      case 8: {
        const done = this.bri!.update()
        this.bright = this.bri!.value
        if (done) {
          this.lit = true
          this.animTicks = 0
          this.spa = this.ctx.particles(2)
          this.state = 9
        }
        break
      }
      case 9:
        this.bri = new LinearS32(16, 0, 6)
        this.emit(4)
        this.particlesFront = false
        this.state = 10
        break
      case 10:
        if (this.bri!.update()) { this.state = 11; this.countdown = 8 }
        this.bright = this.bri!.value
        break
      case 11:
        if (this.countdown > 0) { this.countdown--; break }
        this.shA = new QuadFX(0, -fx(2), 0, this.pan)
        this.shB = new QuadFX(0, -fx(2), 0, this.pan)
        this.countdown = 0
        this.state = 12
        break
      case 12: {
        this.countdown++
        const done = this.shA!.update()
        this.shB!.update()
        const a = this.shA!.value / FX, b = this.shB!.value / FX
        const even = Math.trunc(this.countdown / 2) % 2 === 0
        const l = even ? { x: this.left.x + a, y: this.left.y + b } : { x: this.left.x - a, y: this.left.y - b }
        const r = even ? { x: this.right.x - a, y: this.right.y - b } : { x: this.right.x + a, y: this.right.y + b }
        this.shown = { l, r }
        if (done) {
          this.left = l
          this.right = r
          this.nameOn = false
          this.exitA = new QuadFX(0, fx(192), fx(24), 16)
          this.exitB = new QuadFX(0, fx(192), fx(24), 16)
          this.whiteOut = new BrightnessFade(16, 8)
          this.state = 13
        }
        break
      }
      case 13: {
        this.exitA!.update()
        this.exitB!.update()
        const a = this.exitA!.value / FX, b = this.exitB!.value / FX
        this.shown = { l: { x: this.left.x - a, y: this.left.y - b }, r: { x: this.right.x + a, y: this.right.y + b } }
        if (this.whiteOut!.done) this.state = 14
        break
      }
      default: this.finished = true
    }
    if (this.state <= 11) this.shown = { l: this.left, r: this.right }
  }

  private compose(): void {
    const draw = this.f.draw!
    this.f.flash = (this.state >= 8 || this.whiteOut ? this.bright : this.flash?.value ?? 0) / 16
    if (this.frozen) draw.darken = FROZEN_DARK
    const sprites: CutInSprite[] = []
    if (this.vsOn) sprites.push(...this.vs.sprites().map((s) => ({ ...s, front: true })))
    if (this.state >= 6) {
      const { l, r } = this.shown
      const dark = this.lit ? 0 : 14 / 16
      const cell = this.animTicks < 0 ? 0 : this.animTicks
      sprites.push(
        { img: this.lit ? this.player : `${this.player}Swap`, x: l.x, y: l.y, dark },
        { img: `elite${String(this.elite)}`, x: r.x, y: r.y, dark },
        { img: `elite${String(this.elite)}Banner`, x: l.x + 16, y: l.y + 4, frame: cell % 12 },
        { img: `elite${String(this.elite)}Banner`, x: r.x - 16, y: r.y + 4, frame: 12 + (cell % 11) },
      )
    }
    this.f.draw!.sprites = sprites
    if (this.nameOn) draw.name = { text: this.name, x: 168, y: 104, w: 88 }
    if (this.live.length > 0) draw.particles = { front: this.particlesFront, quads: quadsOf(this.live) }
  }
}

/** 원작 번호 → 사천왕 · 챔피언 컷인 (20~24). 없는 번호면 null */
export function eliteCutIn(effect: number, ctx: CutInContext): SpecialCutIn | null {
  return effect >= 20 && effect <= 24 ? new EliteFour(effect - 20, ctx) : null
}
