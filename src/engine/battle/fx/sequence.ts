// BDSP 연출 시퀀스 — 30fps 명령 시간표를 읽어 「그 프레임에 무엇이 어디 있는가」를 낸다
// (BATTLE_FX §4).
//
// 구운 모양은 `import/bdsp/fx.ts`의 `FxSequence`다: 묶음(`groups`)마다 명령 목록이 있고
// 명령 하나는 `[start, end]` 프레임과 이름 · 값(문자열 배열 — 벡터면 성분마다 하나)이다.
// 같은 묶음 안의 `ParticleCreate`와 그 뒤 `Particle*` 명령은 **같은 입자 칸**을 다룬다.
//
// ⚠️ **상태를 쌓지 않는다.** 프레임 f의 값은 언제든 처음부터 다시 접어서 낸다
// (`particleAt` · `bodyAt`). 그래서 되감기·건너뛰기·가상 시계가 다 같은 그림을 낸다.
//
// 명령의 뜻 (실측과 짐작):
// - 길이가 있는 명령(`start < end`)은 **start 때의 값에서 end 때의 목표로** 옮겨 간다.
//   `move`가 쉬움 곡선 번호다(0 직선 — 나머지는 이름을 못 찾아 부드러운 곡선으로)
// - 거리는 **센티미터**다 — 트레이너 자리 `pos=50/0/580`이 BDSP 트레이너 자리
//   (±0.5, 0, ±5.8 m)와 같다. 그래서 100으로 나눈다
// - `trg`·`moveTrg`·`posTrg`·`dirPoke`는 0 쓴 쪽 · 1 맞는 쪽이다
// - `node`는 몸의 로케이터 번호다 — 표는 `scene`이 쥔다(`anchor` 콜백). 이름 목록이
//   롬에 없어 쓰임새로 짝지었다(`scene/battle/fx/seqAnchors`)
// - `GroupOption`은 조건부 묶음이다. `(1, 홀수)`는 내 쪽이 쓸 때 · `(1, 짝수)`는 상대가
//   쓸 때로 읽고(같은 효과가 둘로 갈려 있다), 나머지 옵션이 붙은 묶음(트레이너 · 등장 ·
//   더블 전용)은 건너뛴다
//
// - `isRot`이면 오프셋이 그 몸이 보는 쪽 기준이다. `isRot` 없이 `isFlip`이면 **상대 쪽에 선 몸이
//   쓴 것으로 적혀 있다** — 몸통박치기가 `ofs=0/0/50`(+Z)으로 나가는데 BDSP 내 쪽은 카메라 쪽 +Z라
//   그대로면 뒷걸음질이다. 내 쪽 몸이면 반 바퀴 돌린다
//
// 좌표는 **우리 무대 좌표**(STAGE_ORIGIN을 뺀 것)로 낸다. 유니티 쪽 값(오프셋 · 절대 자리)은
// X를 뒤집어 받는다 — 무대 전체가 BDSP의 X 거울이기 때문이다.

interface SeqCommand {
  start: number
  end: number
  name: string
  values: Readonly<Record<string, readonly string[]>>
}

interface SeqGroup {
  name: string
  no: number
  options: readonly (readonly [number, number])[]
  commands: readonly SeqCommand[]
}

export interface SeqData {
  name: string
  groups: readonly SeqGroup[]
}

export type V3 = [number, number, number]
/** 0 쓴 쪽 · 1 맞는 쪽 */
export type Role = 0 | 1

/** 시퀀스가 몸에서 읽는 것. 무대 좌표 · 라디안 */
export interface SeqAnchor {
  pos: V3
  /** 몸이 보는 쪽 (three `rotation.y`) */
  yaw: number
}

export interface SeqContext {
  /**
   * 로케이터 하나의 지금 자리. 몸이 없으면 `null`.
   *
   * @param node 시퀀스의 `node` 번호
   */
  anchor(role: Role, node: number): SeqAnchor | null
  /** 그 몸이 서는 발판 자리 (움직이기 전) */
  home(role: Role): SeqAnchor | null
  /**
   * 로케이터를 **시퀀스가 몸을 옮기기 전 자리로** — 몸을 옮기는 명령의 기준점이다.
   * ⚠️ 지금 자리(`anchor`)를 쓰면 제 몸을 기준으로 옮기는 명령(몸통박치기 `posTrg=0`)이
   * 프레임마다 옮겨 간 자리에서 다시 50cm를 더해 상대 너머까지 날아간다(실측)
   */
  rest(role: Role, node: number): SeqAnchor | null
  /** 그 몸이 내 쪽(카메라 쪽 +Z)에 섰는가 — `isFlip` 오프셋을 뒤집는다 */
  mine(role: Role): boolean
}

/** 시퀀스 30fps 프레임 → 초 */
export const SEQ_FPS = 30

/** 입자 칸 하나 */
interface SeqParticle {
  /** 몇 번째 묶음인가 — 열쇠 */
  key: string
  /** `ee100/ee101_03_line.ptcl` → 프리팹 이름. 볼 전용이면 볼 번호로 갈아 끼운 것 */
  prefab: string
  start: number
  /** 이 프레임부터 뿜기를 멈춘다 (`ParticleCreate`의 끝 · `ParticleStop`) */
  stop: number
  /** 이 프레임에 걷어 낸다 (`ParticleDelete`) — 없으면 다 사그라질 때까지 */
  remove: number | null
  /** 자리 · 크기 · 회전 명령 (프레임 차례) */
  commands: readonly SeqCommand[]
}

/** 몸 하나에 거는 것 (쓴 쪽 · 맞는 쪽) */
interface BodyTrack {
  commands: SeqCommand[]
}

export interface SeqPlan {
  name: string
  particles: SeqParticle[]
  body: [BodyTrack, BodyTrack]
  /** 화면 흔들림 */
  shakes: SeqCommand[]
  /** 카메라 명령 (`CameraMoveRelativePoke` · `CameraMovePosition` · `CameraTwist` · `CameraReset*`) */
  camera: SeqCommand[]
  /** 배경 물들임 (`EffSpBackColSet` · `EffSpBackColFlg`) */
  back: SeqCommand[]
  /** 맞는 쪽 체력이 깎이는 프레임 (`GaugeDamage`). 없으면 `null` */
  hit: number | null
  /** 마지막 명령이 끝나는 프레임 */
  frames: number
  /** 이 계획이 건너뛴 명령 이름 (진단 — 한 번씩 알린다) */
  ignored: Set<string>
}

/** 받기는 하지만 그리지 않는 것 — 소리 · 게이지 · 글 · 트레이너 · 후처리 */
const SILENT = /^(Sound|Gauge|Message|Trainer|Dpr(?!Particle)|Orion|Beluga|EffStencil|PostEffect|DummyLabel|Camera|Special|EffRadial|EffFeedback|EffGlare|EffFog|EffDisp|DispEffect|Model|Pokemon(Visible(Other|All|Shadow)|SetMotionSpeed|MotionState|IntroMotion|ScaleNode))/

const num = (v: readonly string[] | undefined, i = 0, d = 0): number => {
  const x = Number(v?.[i])
  return Number.isFinite(x) ? x : d
}

const vec = (v: readonly string[] | undefined, d = 0): V3 => [num(v, 0, d), num(v, 1, d), num(v, 2, d)]

/** `file=ee100/ee101_03_line.ptcl` → `ee101_03_line` */
export function prefabOfFile(file: string): string | null {
  const m = /([^/]+)\.ptcl$/i.exec(file)
  return m ? m[1]! : null
}

/** 조건부 묶음을 이 판에서 쓰는가 */
function groupApplies(options: SeqGroup['options'], attackerMine: boolean): boolean {
  for (const [opt, value] of options) {
    if (opt === 1) {
      if ((value % 2 === 1) !== attackerMine) return false
      continue
    }
    return false
  }
  return true
}

/**
 * 시퀀스를 계획으로 편다.
 *
 * @param ball 볼 번호 — `isBallEffect`·`isCapture` 입자를 `eb{볼}_ballout`·`_capture`로 갈아 끼운다
 * @param attackerMine 쓴 쪽이 내 쪽인가 (조건부 묶음)
 */
export function planSequence(seq: SeqData, opts: { ball?: number; attackerMine?: boolean } = {}): SeqPlan {
  const mine = opts.attackerMine ?? true
  const ball = String(Math.max(1, Math.min(16, opts.ball ?? 4))).padStart(3, '0')
  const plan: SeqPlan = {
    name: seq.name,
    particles: [],
    body: [{ commands: [] }, { commands: [] }],
    shakes: [],
    camera: [],
    back: [],
    hit: null,
    frames: 0,
    ignored: new Set(),
  }
  seq.groups.forEach((g, gi) => {
    if (!groupApplies(g.options, mine)) return
    const cmds = [...g.commands].sort((a, b) => a.start - b.start)
    let current: { key: string; prefab: string; start: number; stop: number; remove: number | null; commands: SeqCommand[] } | null = null
    let seen = 0
    for (const c of cmds) {
      plan.frames = Math.max(plan.frames, c.end)
      const n = c.name
      if (n === 'ParticleCreate') {
        const file = c.values.file?.[0] ?? ''
        let prefab = prefabOfFile(file)
        if (prefab === null) continue
        if (num(c.values.isBallEffect) === 1 || /eb\d{3}_ballout/.test(prefab)) prefab = `eb${ball}_ballout`
        else if (num(c.values.isCapture) === 1 || /eb\d{3}_capture/.test(prefab)) prefab = `eb${ball}_capture`
        current = { key: `${gi}:${seen++}`, prefab, start: c.start, stop: Math.max(c.start, c.end), remove: null, commands: [] }
        // 카메라에 붙는 판(`ew043_cam` 위아래 띠 · `_cam_line_zoom` 집중선)은 BDSP가 컷마다 카메라 앞에
        // 세운다. 우리 카메라는 한 자리에 서므로 무대 한가운데 덩그러니 선다 — 받되 안 그린다
        if (/(^|_)cam($|_|\d)/.test(prefab.replace(/^ew\d+_/, ''))) { plan.ignored.add('카메라 판'); continue }
        plan.particles.push(current)
        continue
      }
      if (n === 'ParticleStop') {
        if (current) current.stop = Math.min(current.stop, c.start)
        continue
      }
      if (n === 'ParticleDelete') {
        if (current) current.remove = c.start
        continue
      }
      if (n.startsWith('Particle')) {
        if (current && PARTICLE_CMDS.has(n)) current.commands.push(c)
        else plan.ignored.add(n)
        continue
      }
      if (n === 'GaugeDamage') {
        if (num(c.values.trg, 0, 1) === 1 && plan.hit === null) plan.hit = c.start
        continue
      }
      if (n === 'CameraShake') { plan.shakes.push(c); continue }
      if (CAMERA_CMDS.has(n)) { plan.camera.push(c); continue }
      if (n === 'EffSpBackColSet' || n === 'EffSpBackColFlg') { plan.back.push(c); continue }
      // ⚠️ **맞는 쪽 감추기는 안 따른다.** BDSP가 카메라를 쓴 쪽 얼굴 앞으로 당길 때 가리는 몸을
      // 지우는 것이다(째려보기 `ew043`이 0~54프레임 내내 맞는 쪽을 감춘다). 우리 카메라는 안
      // 움직이므로 따르면 내 포켓몬이 통째로 사라진다. 쓴 쪽 감추기(공중날기 · 구멍파기)는 따른다
      if (n === 'PokemonVisible' && num(c.values.trg) === 1) { plan.ignored.add('맞는 쪽 감추기'); continue }
      if (BODY_CMDS.has(n)) {
        const role = num(c.values.moveTrg ?? c.values.trg ?? c.values.trgPoke, 0, 0) === 1 ? 1 : 0
        plan.body[role].commands.push(c)
        continue
      }
      if (n === 'PokemonMoveResetAll') {
        plan.body[0].commands.push(c)
        plan.body[1].commands.push(c)
        continue
      }
      if (!SILENT.test(n)) plan.ignored.add(n)
    }
  })
  for (const t of plan.body) t.commands.sort((a, b) => a.start - b.start)
  plan.camera.sort((a, b) => a.start - b.start)
  plan.back.sort((a, b) => a.start - b.start)
  return plan
}

const CAMERA_CMDS = new Set([
  'CameraMoveRelativePoke', 'CameraMovePosition', 'CameraTwist', 'CameraReset', 'CameraResetFieldAll',
])

const PARTICLE_CMDS = new Set([
  'ParticleMoveRelativePoke', 'ParticleMovePosition', 'ParticleFollowPoke', 'ParticleScale',
  'ParticleRotate', 'ParticleRotatePoke', 'ParticleSpMoveShake',
])

const BODY_CMDS = new Set([
  'PokemonMoveRelativePoke', 'PokemonMovePosition', 'PokemonMoveReset', 'PokemonScale',
  'PokemonVisible', 'PokemonShaderCol', 'PokemonAttackMotion', 'PokemonMotion', 'HitBack',
  'PokemonRotatePoke', 'PokemonRotate', 'PokemonSpMoveShake',
])

/**
 * 쉬움 곡선. `move` 번호의 이름은 롬에 없다 — 0만 직선으로 확인했고(대부분이 0),
 * 나머지는 부드러운 곡선 하나로 둔다
 */
export function ease(move: number, t: number): number {
  const x = Math.min(1, Math.max(0, t))
  if (move === 0) return x
  if (move === 1 || move === 4 || move === 7) return x * x // 들어갈 때 느리게
  if (move === 2 || move === 5 || move === 8) return 1 - (1 - x) * (1 - x) // 나올 때 느리게
  return x * x * (3 - 2 * x)
}

/** 명령의 진행 (0~1). 한 프레임짜리면 시작하는 순간 1 */
function progress(c: SeqCommand, f: number): number {
  if (f < c.start) return 0
  if (c.end <= c.start) return 1
  return ease(num(c.values.move), (f - c.start) / (c.end - c.start))
}

/** 유니티 오프셋(cm)을 우리 좌표로 — X 거울. `yaw`가 있으면 몸 방향으로 돌린다 */
function offsetOf(v: V3, yaw: number | null): V3 {
  const x = -v[0] / 100, y = v[1] / 100, z = v[2] / 100
  if (yaw === null) return [x, y, z]
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return [x * c + z * s, y, -x * s + z * c]
}

/** 오프셋을 돌릴 각 — `isRot`이면 몸 방향, `isFlip`이면 내 쪽일 때 반 바퀴, 아니면 그대로 */
function offsetYaw(values: SeqCommand['values'], rotKey: string, role: Role, yaw: number, ctx: SeqContext): number | null {
  if (num(values[rotKey], 0, num(values.isRot)) === 1) return yaw
  if (num(values.isFlip) === 1) return ctx.mine(role) ? Math.PI : null
  return null
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// ─── 입자 칸 ─────────────────────────────────────────────

interface ParticlePose {
  pos: V3
  /** 우리 좌표의 사원수 (xyzw) */
  quat: [number, number, number, number]
  scale: V3
}

/** 입자 칸의 그 프레임 자세 */
export function particleAt(p: SeqParticle, f: number, ctx: SeqContext): ParticlePose {
  let yaw = 0, pitch = 0
  let extra: V3 = [0, 0, 0]
  let scale: V3 = [1, 1, 1]
  const at = Math.max(f, p.start)
  // 자리: 앞 명령들의 접힌 값에서 이번 목표로
  // 자리 명령이 하나도 없는 칸은 BDSP가 이펙트 모델(`ModelCreate` — 껍질 · 동전)에 붙인 것이다
  // (`DprParticleFollowModel`). 그 모델은 아직 안 옮겼으므로 쓴 쪽 발밑에 세운다 — 무대 한가운데
  // (원점)에 서면 두 몸 사이 허공에 뜬다
  const placed = p.commands.some((c) => PLACE.has(c.name))
  const pos = placed ? foldPlace(p, p.commands.length, at, ctx) : (ctx.home(0)?.pos ?? [0, 0, 0])
  for (const c of p.commands) {
    if (at < c.start) continue
    const t = progress(c, at)
    switch (c.name) {
      case 'ParticleMoveRelativePoke': {
        if (num(c.values.isRot) === 1) {
          const a = ctx.anchor(num(c.values.trg) === 1 ? 1 : 0, num(c.values.node))
          if (a) yaw = a.yaw
        }
        break
      }
      case 'ParticleRotatePoke': {
        const to = ctx.anchor(num(c.values.dirPoke) === 1 ? 1 : 0, num(c.values.node))
        if (to) {
          const dx = to.pos[0] - pos[0], dy = to.pos[1] - pos[1], dz = to.pos[2] - pos[2]
          const ny = Math.atan2(dx, dz)
          const np = num(c.values.vertical) === 1 ? Math.atan2(dy, Math.hypot(dx, dz)) : 0
          yaw += (ny + num(c.values.ofs) * Math.PI / 180 - yaw) * t
          pitch += (np - pitch) * t
        }
        break
      }
      case 'ParticleRotate': {
        const v = vec(c.values.scale)
        const target: V3 = num(c.values.relative) === 1 ? add(extra, v) : v
        extra = lerp3(extra, target, t)
        break
      }
      case 'ParticleScale': {
        const v = vec(c.values.scale, 1)
        scale = lerp3(scale, v, t)
        break
      }
      default:
        break
    }
  }
  return { pos, quat: poseQuat(yaw, pitch, extra), scale }
}

const PLACE = new Set(['ParticleMoveRelativePoke', 'ParticleMovePosition', 'ParticleFollowPoke'])

/** 자리 명령을 `i` 앞까지 접은 `g` 프레임의 값 */
function foldPlace(p: SeqParticle, i: number, g: number, ctx: SeqContext): V3 {
  let value: V3 = [0, 0, 0]
  for (let k = 0; k < i; k++) {
    const c = p.commands[k]!
    if (!PLACE.has(c.name) || g < c.start) continue
    const target = placeTarget(c, ctx, value)
    if (target === null) continue
    value = c.end > c.start && g < c.end ? lerp3(foldPlace(p, k, c.start, ctx), target, progress(c, g)) : target
  }
  return value
}

/** 자리 명령 하나의 목표 */
function placeTarget(c: SeqCommand, ctx: SeqContext, before: V3): V3 | null {
  switch (c.name) {
    case 'ParticleMoveRelativePoke': {
      const role: Role = num(c.values.trg) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(c.values.node))
      if (!a) return null
      const rot = offsetYaw(c.values, 'isRotPos', role, a.yaw, ctx)
      const rate = num(c.values.rate, 0, 100) / 100
      return lerp3(before, add(a.pos, offsetOf(vec(c.values.pos), rot)), rate)
    }
    case 'ParticleFollowPoke': {
      if (num(c.values.isEnable, 0, 1) !== 1) return before
      const role: Role = num(c.values.pos) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(c.values.node))
      if (!a) return null
      return add(a.pos, offsetOf(vec(c.values.posOfs), num(c.values.isRot) === 1 ? a.yaw : null))
    }
    case 'ParticleMovePosition': {
      const v = offsetOf(vec(c.values.pos), null)
      return num(c.values.relative) === 1 ? add(before, v) : v
    }
    default:
      return null
  }
}

/**
 * 몸 방향(yaw · pitch)과 유니티 오일러(도) 덧회전을 우리 좌표 사원수 하나로.
 *
 * 유니티 오일러는 Z → X → Y 차례이고, 우리 좌표로는 (x, −y, −z, w)로 건너온다
 */
function poseQuat(yaw: number, pitch: number, extra: V3): [number, number, number, number] {
  // 몸 쪽: Y로 yaw, 그다음 X로 −pitch (앞이 +Z라 위를 보려면 X를 음으로)
  const base = mulQ(axisQ(0, 1, 0, yaw), axisQ(1, 0, 0, -pitch))
  const d = Math.PI / 180
  // 유니티 R = Ry · Rx · Rz
  const u = mulQ(mulQ(axisQ(0, 1, 0, extra[1] * d), axisQ(1, 0, 0, extra[0] * d)), axisQ(0, 0, 1, extra[2] * d))
  const ours: [number, number, number, number] = [u[0], -u[1], -u[2], u[3]]
  return mulQ(base, ours)
}

function axisQ(x: number, y: number, z: number, a: number): [number, number, number, number] {
  const s = Math.sin(a / 2)
  return [x * s, y * s, z * s, Math.cos(a / 2)]
}

function mulQ(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number]
  const [bx, by, bz, bw] = b as [number, number, number, number]
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

// ─── 몸 ──────────────────────────────────────────────────

interface BodyPose {
  /** 발판에서 옮겨 간 만큼 (무대 좌표, m) */
  offset: V3
  scale: V3
  visible: boolean
  /** 몸 빛 (`PokemonShaderCol`) — 색과 세기. 없으면 `null` */
  glow: { color: V3; power: number } | null
  /** 덧 회전 (라디안, Y) — `PokemonRotate` */
  turn: number
  /** 떨림 (m) */
  shake: V3
  /**
   * 지금 틀 동작과 그것이 시작한 프레임. `attack`·`damage`·`wait`
   */
  motion: { name: SeqMotion; at: number } | null
}

/** 동작 번호 → 우리 동작 (BDSP 모션 표: 16 피격 · 30~42 공격 · 0 대기) */
type SeqMotion = 'attack' | 'damage' | 'wait' | 'cry'

function motionOf(id: number): SeqMotion | null {
  if (id === 16) return 'damage'
  if (id >= 30 && id <= 42) return 'attack'
  if (id === 0) return 'wait'
  if (id === 12 || id === 13) return 'cry'
  if (id === 14) return 'attack'
  return null
}

/** 몸 하나의 그 프레임 값 */
export function bodyAt(plan: SeqPlan, role: Role, f: number, ctx: SeqContext): BodyPose {
  const out: BodyPose = { offset: [0, 0, 0], scale: [1, 1, 1], visible: true, glow: null, turn: 0, shake: [0, 0, 0], motion: null }
  const home = ctx.home(role)
  const cmds = plan.body[role].commands
  // 자리: 접어 가며
  const offsetBefore = (limit: number, g: number): V3 => {
    let value: V3 = [0, 0, 0]
    for (let i = 0; i < limit; i++) {
      const c = cmds[i]!
      if (g < c.start) continue
      let target: V3 | null = null
      switch (c.name) {
        case 'PokemonMoveRelativePoke': {
          const posRole: Role = num(c.values.posTrg) === 1 ? 1 : 0
          const to = ctx.rest(posRole, num(c.values.node))
          if (!to || !home) break
          const rot = offsetYaw(c.values, 'isRot', posRole, to.yaw, ctx)
          const want = add(to.pos, offsetOf(vec(c.values.ofs), rot))
          const rate = num(c.values.rate, 0, 100) / 100
          target = [(want[0] - home.pos[0]) * rate, (want[1] - home.pos[1]) * rate, (want[2] - home.pos[2]) * rate]
          break
        }
        case 'PokemonMovePosition': {
          const v = offsetOf(vec(c.values.pos), home ? offsetYaw(c.values, 'isRotPos', role, home.yaw, ctx) : null)
          if (num(c.values.relative) === 1) target = add(value, v)
          else if (home) target = [v[0] - home.pos[0], v[1] - home.pos[1], v[2] - home.pos[2]]
          // 절대 자리 0,0,0은 「제자리로」로 쓰인다 (`ew???` 열 군데) — 발판으로 둔다
          if (num(c.values.relative) !== 1 && v[0] === 0 && v[1] === 0 && v[2] === 0) target = [0, 0, 0]
          break
        }
        case 'PokemonMoveReset':
        case 'PokemonMoveResetAll':
          target = [0, 0, 0]
          break
        default:
          continue
      }
      if (target === null) continue
      value = c.end > c.start && g < c.end ? lerp3(offsetBefore(i, c.start), target, progress(c, g)) : target
    }
    return value
  }
  out.offset = offsetBefore(cmds.length, f)

  for (const c of cmds) {
    if (f < c.start) continue
    const t = progress(c, f)
    switch (c.name) {
      case 'PokemonScale': {
        const v = vec(c.values.scale, 1)
        const target: V3 = num(c.values.relative) === 1 ? [out.scale[0] * v[0], out.scale[1] * v[1], out.scale[2] * v[2]] : v
        out.scale = lerp3(out.scale, target, t)
        break
      }
      case 'PokemonVisible':
        out.visible = num(c.values.visible, 0, 1) === 1
        break
      case 'PokemonShaderCol': {
        const a = vec(c.values.start_col, 1), b = vec(c.values.end_col, 1)
        const pa = num(c.values.start_pow), pb = num(c.values.end_pow)
        out.glow = { color: lerp3(a, b, t), power: pa + (pb - pa) * t }
        break
      }
      case 'PokemonRotate': {
        const v = vec(c.values.scale)
        const deg = -v[1] * Math.PI / 180
        const target = num(c.values.relative) === 1 ? out.turn + deg : deg
        out.turn += (target - out.turn) * t
        break
      }
      case 'PokemonAttackMotion':
      case 'PokemonMotion': {
        const name = motionOf(num(c.values.motion))
        if (name) out.motion = { name, at: c.start }
        break
      }
      case 'HitBack':
        out.motion = { name: 'damage', at: c.start }
        break
      case 'PokemonSpMoveShake': {
        if (f > c.end) break
        // 세기(srate → erate)를 cm로 읽고, 잦기는 초당 15번으로 둔다 — 정확한 뜻은 못 찾았다
        const k = c.end > c.start ? (f - c.start) / (c.end - c.start) : 1
        const amp = (num(c.values.srate) + (num(c.values.erate) - num(c.values.srate)) * k) / 100 * 0.25
        const w = Math.sin((f / SEQ_FPS) * Math.PI * 2 * 15) * amp
        const axis = num(c.values.axis)
        if (axis === 1) out.shake[1] += w
        else if (axis === 2) out.shake[2] += w
        else out.shake[0] += w
        break
      }
      default:
        break
    }
  }
  return out
}

/** 화면 흔들림 진폭 (m) */
export function shakeAt(plan: SeqPlan, f: number): number {
  let amp = 0
  for (const c of plan.shakes) {
    if (f < c.start || f > c.end) continue
    const k = c.end > c.start ? (f - c.start) / (c.end - c.start) : 0
    // `srate`·`erate`(세기의 처음과 끝)를 cm로 읽는다 — 크게 흔드는 것(지진)이 12다
    const a = (num(c.values.srate) + (num(c.values.erate) - num(c.values.srate)) * k) / 100
    amp = Math.max(amp, a * 0.35)
  }
  return amp
}

/** 배경 물들임 — 색(0~1)과 진하기. 꺼져 있으면 `null` */
export function backAt(plan: SeqPlan, f: number): { color: V3; alpha: number } | null {
  let on = false
  let color: V3 = [0, 0, 0]
  let alpha = 0
  for (const c of plan.back) {
    if (f < c.start) continue
    const col = vec(c.values.col)
    const a = num(c.values.alpha)
    if (c.name === 'EffSpBackColFlg') {
      on = num(c.values.visible) === 1
      color = col
      alpha = a
      continue
    }
    on = true
    const t = progress(c, f)
    color = lerp3(color, col, t)
    alpha += (a - alpha) * t
  }
  return on && alpha > 0.001 ? { color, alpha } : null
}

/** 연출이 다 서는 프레임 (30fps) — 맨 끝 명령의 끝 */
export function planFrames(plan: SeqPlan): number {
  return Math.max(1, plan.frames)
}

// ─── 카메라 ──────────────────────────────────────────────

/** 카메라 한 벌 — 무대 좌표 · 세로 화각(도) · 굴림(라디안) */
export interface SeqCamera {
  pos: V3
  target: V3
  fov: number
  roll: number
}

/**
 * 시퀀스 카메라의 그 프레임 값. 카메라 명령이 하나도 안 선 동안은 `null`이다(우리 기본 카메라가 선다).
 *
 * - `CameraMoveRelativePoke` — 자리 = `poke` 몸의 `node` 로케이터 + `pos`(cm), 보는 곳 = 같은 점 + `trg`.
 *   `isRot`이면 그 몸이 보는 쪽 기준이고 `isFlip`이면 상대 쪽 몸일 때 가로를 뒤집는다(같은 화면 쪽에 서게).
 *   `isScale`이면 오프셋을 몸 크기로 늘린다(`scale(role)`). `rate`%만큼만 간다. `enableElemPos/Trg`로 축을 고른다.
 *   `fov`가 0이면 화각을 그대로 둔다
 * - `CameraMovePosition` — `relative` 1이면 지금 자리 · 보는 곳에 더하고, 0이면 BDSP 월드 자리(cm)다
 * - `CameraTwist` — 굴림(도). `relative`면 더한다
 * - `CameraReset` · `CameraResetFieldAll` — 기본 카메라로 돌아간다
 *
 * @param base 우리 기본 카메라 (돌아갈 자리 · 처음 자리)
 */
export function cameraAt(
  plan: SeqPlan, f: number, ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): SeqCamera | null {
  return foldCamera(plan.camera, plan.camera.length, f, ctx, base)
}

function foldCamera(
  cmds: readonly SeqCommand[], limit: number, g: number,
  ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): SeqCamera | null {
  let cam: SeqCamera | null = null
  for (let i = 0; i < limit; i++) {
    const c = cmds[i]!
    if (g < c.start) continue
    const from = cam ?? base
    const target = cameraTarget(c, from, ctx, base)
    if (target === null) continue
    const reset = c.name === 'CameraReset' || c.name === 'CameraResetFieldAll'
    if (c.end > c.start && g < c.end) {
      const was = foldCamera(cmds, i, c.start, ctx, base) ?? base
      const t = progress(c, g)
      cam = {
        pos: lerp3(was.pos, target.pos, t),
        target: lerp3(was.target, target.target, t),
        fov: was.fov + (target.fov - was.fov) * t,
        roll: was.roll + (target.roll - was.roll) * t,
      }
    } else cam = reset ? null : target
  }
  return cam
}

function cameraTarget(
  c: SeqCommand, from: SeqCamera, ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): SeqCamera | null {
  const v = c.values
  const fovOf = (): number => (num(v.fov) > 0 ? num(v.fov) : from.fov)
  switch (c.name) {
    case 'CameraReset':
    case 'CameraResetFieldAll':
      return base
    case 'CameraTwist': {
      const tw = num(v.twist) * Math.PI / 180 * (num(v.isFlip) === 1 && !ctx.mine(0) ? -1 : 1)
      return { ...from, roll: num(v.relative) === 1 ? from.roll + tw : tw }
    }
    case 'CameraMovePosition': {
      const p = vec(v.pos), t = vec(v.trg)
      if (num(v.relative) === 1) {
        return { pos: add(from.pos, offsetOf(p, null)), target: add(from.target, offsetOf(t, null)), fov: fovOf(), roll: from.roll }
      }
      return { pos: offsetOf(p, null), target: offsetOf(t, null), fov: fovOf(), roll: from.roll }
    }
    case 'CameraMoveRelativePoke': {
      const role: Role = num(v.poke) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(v.node))
      if (!a) return null
      const k = num(v.isScale) === 1 ? ctx.scale(role) : 1
      // `isFlip`은 **상대 쪽 몸일 때** 가로를 뒤집는다. 내 쪽 몸은 −Z를 보고 서므로 몸 기준 오른쪽(+x)이
      // 곧 기본 카메라 쪽이다 — 시퀀스가 그쪽을 기준으로 적혀 있고, 상대 몸(+Z를 본다)에서는 뒤집어야 같은
      // 화면 쪽에 선다(실측: 안 뒤집으니 리프스톰 카메라가 토대부기 반대편 몸 속에 섰다)
      const flip = num(v.isFlip) === 1 && !ctx.mine(role) ? -1 : 1
      const yaw = num(v.isRot) === 1 ? a.yaw : null
      const local = (x: V3): V3 => offsetOf([x[0] * k * flip, x[1] * k, x[2] * k], yaw)
      const rate = num(v.rate, 0, 100) / 100
      const pick = (mask: readonly string[] | undefined, cur: V3, want: V3): V3 => [
        num(mask, 0, 1) === 1 ? cur[0] + (want[0] - cur[0]) * rate : cur[0],
        num(mask, 1, 1) === 1 ? cur[1] + (want[1] - cur[1]) * rate : cur[1],
        num(mask, 2, 1) === 1 ? cur[2] + (want[2] - cur[2]) * rate : cur[2],
      ]
      return {
        pos: pick(v.enableElemPos, from.pos, add(a.pos, local(vec(v.pos)))),
        target: pick(v.enableElemTrg, from.target, add(a.pos, local(vec(v.trg)))),
        fov: fovOf(),
        roll: from.roll,
      }
    }
    default:
      return null
  }
}
