// 주인공이 **들고 타는 것들** — BDSP의 `Characters/persons/field/pc_parts`.
//
// 한 번들에 여섯이 같이 들어 있다 (`.audit/fieldClipCensus.mjs`가 필드 번들
// 161벌의 메시 이름을 전수로 훑어 찾았다):
//
//     naminori_00_00_BodySkin      파도타기 몸   정점 1,422
//     sora_00_00_BodyASkin         공중날기 몸   정점 1,243
//     fo1013_00_wateringcanSkin    물뿌리개      정점   296
//     fo1005/1006/1007_00_roadSkin 낚싯대 셋     정점 92 · 71 · 492
//
// ⚠️ **파도타기에는 클립이 없다.** 원작도 안 쓴다 — 이 몸 위에 앉은 자세를
// 얹는 방식이라 돌릴 것이 애초에 없다. 그래서 굽는 쪽도 `--no-clips`다.
import { Group, type Object3D } from 'three'

/** 번들 안의 이름. 이 이름으로 골라 쓴다 */
export const PC_PART = {
  surf: 'naminori_00_00_BodySkin',
  fly: 'sora_00_00_BodyASkin',
  wateringCan: 'fo1013_00_wateringcanSkin',
  rodOld: 'fo1005_00_roadSkin',
  rodGood: 'fo1006_00_roadSkin',
  rodSuper: 'fo1007_00_roadSkin',
} as const

/**
 * 파도타기 몸의 자리들 — **번들 좌표 그대로**다 (`.audit/surfMount.mjs`).
 *
 * 번들 원점은 몸보다 위에 있고, 몸의 발판은 `Origin_mcl`이 y −1.0에 놓여 있다.
 * 그래서 **그 자리를 물 높이로 올려** 놓는다 — 씬에 넣을 때 `lift`만큼 든다.
 *
 * ⚠️ **자리를 눈으로 맞춘 값이 하나도 없다.** 스킨을 실제로 먹여 잰 몸 상자가
 * y −1.0580 ~ −0.1239 · z −1.0126 ~ +0.5592다. 여기 값은 다 그 상자와 번들의
 * 뼈 자리에서 온다
 */
export const SURF_MOUNT = {
  /** 씬에 넣을 때 드는 높이. `Origin_mcl`이 물 높이에 오게 한다 */
  lift: 1.0,
  /**
   * 사람이 서는 높이 (든 뒤 기준). **몸 등판 꼭대기다.**
   *
   * ⚠️ **`scaffold_Attach`가 아니다.** 오래 그 자리(0.5959)를 앉는 높이로 쓰고
   * 있었는데, 그건 몸 **속** 0.28 깊이라 다리가 몸에 파묻힌다 — 화면에서
   * 그렇게 나와 있었다. 이름의 scaffold(발판)는 몸이 제 발판을 다는 자리다.
   *
   * 후보가 셋이었고 셋 다 잰 값이다:
   *
   *   0.5959  `scaffold_Attach`      몸 속 0.28
   *   0.8761  스킨 먹인 몸 상자의 위  **등판에 발이 닿는다**
   *   1.0     번들이 사람과 몸을 놓은 사이 (`Origin` 0 · `Beadaru/mcl_00` −1.0)
   *
   * 번들이 적어 둔 사이는 1.0인데 그러면 등판 위 0.124에 뜬다. 발이 닿는 쪽을
   * 골랐다 — 원작 값이 무엇이었는지는 여기 남는다
   */
  stand: 0.8761,
  /** 물에 잠기는 깊이. −1.0580 + 1.0 — 몸 밑이 물 높이보다 조금 아래다 */
  draft: 0.058,
  /** 몸 높이 (−0.1239 − (−1.0580)) */
  height: 0.9341,
} as const

/**
 * 이 번들에서 한 갈래만 남기고 나머지 메시를 끈다.
 *
 * 뼈는 그대로 둔다 — 스킨이 그 뼈를 보고 있고, 안 쓰는 뼈는 그리지 않으므로
 * 값이 없다. 나중에 공중날기 몸과 물뿌리개를 붙일 때 같은 파일을 그대로 쓴다.
 *
 * ⚠️ **이름이 하나가 아니다.** 번들에는 렌더러를 든 GameObject와 메시가 같은
 * 이름이라, GLTFLoader가 겹치는 이름에 `_1`·`_2`를 붙인다 — 실측으로 파도타기
 * 몸이 빈 `naminori_00_00_BodySkin`(자식 0) 하나와 그림 둘을 담은
 * `naminori_00_00_BodySkin_1`(Group)으로 갈려 있었다. 정확히 같은 이름만 찾으면
 * **빈 쪽을 끄고 진짜 메시는 그대로 남는다** — 그래서 접두사로 본다
 */
export function keepOnly(root: Object3D, name: string): void {
  root.traverse((o) => {
    for (const wanted of Object.values(PC_PART)) {
      if (o.name === wanted || o.name.startsWith(`${wanted}_`)) {
        o.visible = wanted === name
        return
      }
    }
  })
}

/**
 * 공중날기 새(`sora_00_00`)의 자리들 — **번들 단위**다 (`.audit/pcMounts.mjs`).
 *
 * ⚠️ **오래 찌르호크(398) 모델을 태우고 있었다.** 원작 새는 이 번들에 있고
 * 날개를 편 채로 굳어 있다 — 아래 `FLY_PATH`가 몸통째로 옮길 뿐이다
 */
export const FLY_MOUNT = {
  /** 바인드에서 `Origin_mf`가 땅 위로 뜬 높이 */
  hover: 2.0,
  /** 사람이 앉는 자리 (`attach_loc_mf`, `Origin_mf` 기준) */
  seat: { x: 0, y: 0.6399, z: -0.0646 },
  /** 스킨을 먹인 몸 높이 (y 1.9775~3.6350) */
  height: 1.6574,
  /** 날개 폭 (x −2.6104~+2.6104) */
  wing: 5.2208,
  /** 원작 클립 `fly_on_f`·`fly_off_f`의 길이 */
  clip: 0.6667,
  /**
   * 사람이 땅을 뜨는 때 (`.audit/flyHero.py`).
   *
   * 치비 `Waist`가 `fly_on_f`의 0.3333초까지 땅자리(y 0.4415)에 있다가 **다음
   * 키 0.3500초에 1.1635로 뛴다** — 한 프레임에 0.72 올라간다. `fly_off_f`는
   * 거울이라 같은 때에 내려놓는다
   */
  pick: 0.3333,
} as const

/** 옮기는 키 하나 */
export interface FlyKey { t: number, x: number, y: number, z: number }
/** 돌리는 키 하나 */
export interface FlyTurn { t: number, x: number, y: number, z: number, w: number }

/**
 * **원작이 새와 사람을 어디로 옮기는가** (`.audit/flyTable.py`).
 *
 * ⚠️ **원작 새는 날갯짓을 안 한다.** `fly_on_f`·`fly_off_f`의 354개 바인딩 중
 * 새 뼈를 실제로 미는 것은 `Waist_mf` **하나**고, 날개뼈(`LArm_mf`·`RArm_mf`)는
 * 바인드 그대로다 — 편 날개로 스쳐 지나간다. 우리가 오래 돌리던 18rad/s
 * 날갯짓은 자리표시자 새의 것이었다 (`.audit/flyCurves.py`).
 *
 * 새 자리는 `Waist_mf`의 바인드 로컬(0, 0.5882, −0.0039)을 뺀 값이라 **몸을
 * 통째로 미는 양**이다. x는 `import/bdsp/model.ts`와 같게 뒤집어 두었다.
 *
 * 길을 보면 원작이 무엇을 하는지 그대로 읽힌다 — 새가 뒤에서 날아와 0.333초에
 * 사람을 채고 앞으로 빠진다. 내릴 때는 앞에서 와서 같은 때에 내려놓는다.
 *
 * ⚠️ **사람 자리는 여기 없다. 새의 `attach_loc_mf`를 그대로 쓴다.** 원작의
 * 치비 `Waist` 키도 뽑아 봤는데, 같은 클립에서 나왔는데도 키가 다르게 줄어
 * 있어서 곧게 이으면 새와 최대 0.74칸까지 벌어진다 — 사람이 새 옆 허공에 뜬다.
 * 태우는 동안은 어차피 한 몸이라, 번들이 적어 둔 부착점 하나가 맞다
 */
export const FLY_PATH = {
  /** fly_on_f · 새 */
  onBird: [
    { t: 0.0167, x: +8.3866, y: +0.9320, z: -4.3042 },
    { t: 0.2500, x: +1.5180, y: -1.7356, z: -0.8938 },
    { t: 0.3333, x: -0.2599, y: -1.8242, z: +0.6087 },
    { t: 0.4833, x: -1.8294, y: -0.5656, z: +4.2789 },
    { t: 0.6500, x: -2.6836, y: +2.8341, z: +9.1204 },
    { t: 0.6667, x: -2.8013, y: +3.2689, z: +9.6030 },
  ] as readonly FlyKey[],
  /** fly_off_f · 새 */
  offBird: [
    { t: 0.0167, x: +2.6741, y: +3.6885, z: +9.2055 },
    { t: 0.2333, x: +1.0871, y: -1.3488, z: +2.8722 },
    { t: 0.3000, x: +0.3598, y: -1.7777, z: +1.1699 },
    { t: 0.3333, x: -0.1133, y: -1.7953, z: +0.4020 },
    { t: 0.4833, x: -3.1878, y: -0.5923, z: -2.4168 },
    { t: 0.6500, x: -7.3819, y: +2.7847, z: -5.2113 },
    { t: 0.6667, x: -7.7866, y: +3.2244, z: -5.5175 },
  ] as readonly FlyKey[],
  /** fly_on_f · 새가 도는 각 (`Waist_mf` 회전, 그대로 얹는다) */
  onTurn: [
    { t: 0.2833, x: -0.2257, y: -0.3136, z: +0.5212, w: +0.7610 },
    { t: 0.4833, x: -0.2494, y: -0.0258, z: +0.5845, w: +0.7717 },
    { t: 0.6667, x: -0.2846, y: +0.1015, z: +0.6136, w: +0.7295 },
  ] as readonly FlyTurn[],
  /** fly_off_f · 새가 도는 각 */
  offTurn: [
    { t: 0.3167, x: -0.6294, y: -0.7346, z: +0.0889, w: +0.2372 },
    { t: 0.5833, x: -0.6237, y: -0.6108, z: +0.0471, w: +0.4854 },
    { t: 0.6667, x: -0.6239, y: -0.5957, z: +0.0439, w: +0.5039 },
  ] as readonly FlyTurn[],
} as const

/** 키 사이를 곧게 잇는다. 밖은 끝값으로 잡는다 — 원작 커브와 같은 규칙이다 */
export function flyAt(keys: readonly FlyKey[], t: number): FlyKey {
  const first = keys[0]!
  if (t <= first.t) return first
  const last = keys[keys.length - 1]!
  if (t >= last.t) return last
  let lo = 0
  while (lo + 1 < keys.length && keys[lo + 1]!.t <= t) lo++
  const a = keys[lo]!, b = keys[lo + 1]!
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
}

/** 길이를 1로 맞춘 사본 */
function unit(q: FlyTurn): FlyTurn {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1
  return { t: q.t, x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
}

/**
 * 도는 각도 마찬가지. **길이를 다시 1로 맞춘다** — 곧게 이으면 짧아진다.
 *
 * 키가 셋뿐이고 사이가 15° 안쪽이라 구면 보간과 눈에 띄게 다르지 않다
 */
export function flyTurnAt(keys: readonly FlyTurn[], t: number): FlyTurn {
  // ⚠️ **원작 키가 길이 1이 아니다** — 실측으로 최대 1.00003이라, 끝값도
  // 그냥 돌려주지 않고 같이 맞춘다
  const first = keys[0]!
  if (t <= first.t) return unit(first)
  const last = keys[keys.length - 1]!
  if (t >= last.t) return unit(last)
  let lo = 0
  while (lo + 1 < keys.length && keys[lo + 1]!.t <= t) lo++
  const a = keys[lo]!, b = keys[lo + 1]!
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  // 반대쪽으로 도는 짧은 길을 고른다
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  const s = dot < 0 ? -1 : 1
  const x = a.x + (b.x * s - a.x) * k, y = a.y + (b.y * s - a.y) * k
  const z = a.z + (b.z * s - a.z) * k, w = a.w + (b.w * s - a.w) * k
  const len = Math.hypot(x, y, z, w) || 1
  return { t, x: x / len, y: y / len, z: z / len, w: w / len }
}

/**
 * 손에 무엇을 거는 자리 — **번들이 만들어 둔 빈 부착 뼈**다.
 *
 * ⚠️ **치비에도 등신에도 같은 이름으로 있다.** 실측으로 `fc0001_00`과
 * `pc0001_00`·`pc0002_00` 넷 다 `LItem1`·`RItem1`을 들고 있고, 바인드 세계
 * 회전이 왼쪽은 그대로·오른쪽은 z −180°다 (`.audit/handRuler.mjs`). 오른쪽에
 * 그냥 걸면 소품이 좌우로 뒤집히므로 `spin`으로 되돌린다.
 *
 * `x`·`y`·`z`는 **치비 쪽** 자리다. `pc_parts`의 소품 정점이 그 자리를 원점
 * 삼아 찍혀 있어서, 이만큼 빼야 부착 뼈에 맞는다.
 *
 * ⚠️ **치비→등신 배수를 안 준다.** 소품은 몸이 아니라 물건이고, BDSP 번들
 * 단위는 그대로 우리 타일이다(`model/normalize`의 `BDSP_PLAYER_HEIGHT` 머리말) —
 * 파도타기 몸도 새도 그렇게 세운다. 몸(발~목)으로 늘려 보면 실측으로 배수가
 * 광휘 1.995·빛나 1.858이고, 그러면 **낚싯대가 3.43타일(3.4m)이 되고 물뿌리개가
 * 0.73타일**이 된다 — 치비 손에 맞춘 크기라 등신 손에는 안 맞는다. 안 늘리면
 * 낚싯대 1.77타일 · 물뿌리개 0.27×0.37×0.46타일로 실물 크기에 든다
 */
interface HandAttach {
  /** 부착 뼈 이름 */
  name: string
  /** 뼈의 바인드 세계 회전을 되돌리는 z 각 */
  spin: number
  x: number
  y: number
  z: number
}

export const ITEM_HAND: Readonly<Record<'left' | 'right', HandAttach>> = {
  /** 물뿌리개가 걸리는 왼손 */
  left: { name: 'LItem1', spin: 0, x: 0.4482, y: 0.5613, z: -0.0057 },
  /** 낚싯대가 걸리는 오른손 */
  right: { name: 'RItem1', spin: Math.PI, x: -0.4482, y: 0.5613, z: -0.0057 },
}

/** 낚싯대 세 가지의 메시 이름 */
export const PC_ROD = {
  old: PC_PART.rodOld,
  good: PC_PART.rodGood,
  super: PC_PART.rodSuper,
} as const

/** 낚싯대 끝 뼈. 낚싯줄이 여기서 나간다 */
export const ROD_TIP = 'PartsA6'

/**
 * 소품 하나를 손 부착 뼈에 걸 수 있게 감싼다.
 *
 * 겉 그룹이 뼈의 바인드 회전을 되돌린다(`spin`). 속의 씬은 치비 부착 자리만큼
 * 물러나 앉는다 — 소품 정점이 그 자리를 원점으로 찍혀 있기 때문이다
 */
export function handMount(scene: Object3D, hand: HandAttach): Object3D {
  const holder = new Group()
  holder.rotation.z = hand.spin
  scene.position.set(-hand.x, -hand.y, -hand.z)
  holder.add(scene)
  return holder
}

