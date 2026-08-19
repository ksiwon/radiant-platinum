// BDSP 브라우저 변환 (IMPORT.md §12 · §13-6)
//
// 여기가 `AssetAssistant` 폴더에서 glb를 굽는 자리다. 개발 추출기 셋
// (`bdspGlb.py` · `bdspPokemon.py` · `bdspArena.py`)이 하던 일을 Worker 안에서 한다.
//
// ⚠️ **산출물이 580MB다.** 그래서 `Produced` Map에 안 담고 `ctx.emit`으로 하나씩
// 흘려보낸다 (`convertTypes.ts`의 `put`). 모아 뒀다가 넘기면 Worker와 메인이 각각
// 그만큼을 들고, 탭이 죽는다.
//
// ⚠️ **한 마리를 못 구웠다고 493마리를 멈추지 않는다.** 번들 하나가 같은 폴더에
// 없는 CAB을 가리켜서 열다가 끊기는 것이 실제로 있다. 그런 것은 세어서 남기고
// 다음으로 넘어간다 — 다만 **하나도 못 구우면 그건 실패다.** 빈 그룹이 `ready`로
// 지나가면 3D가 통째로 빈 설치본이 완료가 된다
import { encodePng } from '../platinum/png'
import {
  breathe, check, json, put, requireBdsp,
  type BdspSource, type ConvertContext, type GroupSpec, type Produced,
} from '../platinum/convertTypes'
import { EVERY_ARENA } from '../../engine/battle/arena'
import {
  HERO_FIELD_CLIPS, NPC_BUNDLE, TRAINER_CLIPS, buildOf, fieldClipDonor, modelFor,
  type NpcModelTable,
} from '../../engine/actor/npcModels'
import { SPRITE_NAMES } from '../platinum/spriteTable'
import { openEnvironment, type Environment } from './environment'
import { exportModel } from './model'
import { exportArena } from './arena'
import { className, openBundle, readSerializedFile } from './unityfs'
import type { UnityValue } from './typetree'

/** 뿌리 아래 자리들. 실측 덤프 구조 그대로다 (`scan.ts` 머리말) */
const PERSONS = 'Characters/persons'
const POKEMON_BATTLE = 'Pokemon Database/pokemons/battle'
const POKEMON_COMMON = 'Pokemon Database/pokemons/common'
const ARENA_GROUND = 'Environments/bg/arenas/ground'
const MASTERDATAS = 'Dpr/masterdatas'
/** 자전거. 오버월드에서 타는 물건이라 인물과 같은 자리에서 굽는다 */
const BIKE = 'Characters/objects/ob1003_00'

/**
 * 텍스처 긴 변의 상한.
 *
 * 인물은 그대로 5.07MB인데 256으로 줄이면 2.58MB고 클립까지 빼면 1.06MB다.
 * 포켓몬은 배틀에서 화면을 채우는 크기가 400픽셀 남짓이라 256이면 텍셀이 남는다
 */
const MAX_TEXTURE = 256

/** 배틀에서 쓰는 동작만. 나머지 다섯은 아미티광장·필드용이고 애니 자료의 36%다 */
const BATTLE_CLIPS = /_ba\d\d_/

/** 포켓몬 셰이더의 알베도 자리. `_MainTex`도 같이 본다 — 몇몇 이펙트 재질이 그쪽이다 */
const MON_MAIN_PROPS = ['_Col0Tex', '_MainTex'] as const

/** 신오 도감의 마지막 번호 */
const LAST_DEX = 493

type Props = Record<string, UnityValue>

// ── 폴더 다루기 ──────────────────────────────────────────────────────────────

/** 대소문자를 안 따지고 자리를 찾는다. 덤프마다 `Dpr`/`dpr`이 갈린다 */
async function index(src: BdspSource): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const p of await src.list()) out.set(p.toLowerCase(), p)
  return out
}

const childrenOf = (at: Map<string, string>, dir: string): string[] => {
  const prefix = `${dir.toLowerCase()}/`
  const out: string[] = []
  for (const [lower, real] of at) {
    if (!lower.startsWith(prefix)) continue
    // 바로 아래 것만. 번들은 확장자가 없는 파일이다
    if (lower.indexOf('/', prefix.length) >= 0) continue
    out.push(real)
  }
  return out.sort()
}

const lookup = (at: Map<string, string>, path: string): string | null =>
  at.get(path.toLowerCase()) ?? null

/** 번들 여럿을 한 환경으로. 하나라도 못 읽으면 null */
async function environmentOf(
  src: BdspSource, paths: readonly string[],
): Promise<Environment | null> {
  const parts: Uint8Array[] = []
  for (const p of paths) {
    const bytes = await src.read(p)
    if (!bytes) return null
    parts.push(bytes)
  }
  if (parts.length === 0) return null
  try { return openEnvironment(parts) } catch { return null }
}

// ── 인물 이름표 ──────────────────────────────────────────────────────────────

/**
 * `tr0001_00_champion_body_col` — 번호 · 판번호 · **갈래** · 부위 · 쓰임.
 *
 * 앞 두 글자가 어느 뭉치인지를 말한다: `tr`은 배틀용 등신, `fc`는 오버월드 치비,
 * `pc`는 주인공 둘
 */
const TEXTURE_NAME = /^(?:tr|fc|pc)\d+_\d+_([A-Za-z][A-Za-z0-9]*)_/

/** 갈래가 아니라 부위·재질을 가리키는 낱말. 이름표로 세면 안 된다 */
const NOT_A_ROLE = new Set(['body', 'face', 'hair', 'wear', 'bag'])

/**
 * 번들 하나에 든 갈래 이름들.
 *
 * ⚠️ **텍스처 픽셀은 안 읽는다.** 이름만 필요한데 285벌을 통째로 디코딩하면
 * 설치가 몇 분 늘어난다. `m_Name`은 타입 트리 맨 앞이라 오브젝트만 훑으면 된다
 */
function tagsOf(bytes: Uint8Array): string[] {
  const found = new Set<string>()
  let bundle
  try { bundle = openBundle(bytes) } catch { return [] }
  for (const node of bundle.nodes) {
    if (/\.res[sS]$/.test(node.path)) continue
    let file
    try {
      file = readSerializedFile(bundle.data.subarray(node.offset, node.offset + node.size))
    } catch { continue }
    for (const o of file.objects) {
      if (className(o.classId) !== 'Texture2D') continue
      let v: UnityValue | null
      try { v = file.read(o) } catch { continue }
      const name = (v as Props | null)?.m_Name
      if (typeof name !== 'string') continue
      const m = TEXTURE_NAME.exec(name)
      if (m && !NOT_A_ROLE.has(m[1]!)) found.add(m[1]!)
    }
  }
  return [...found].sort()
}

/**
 * 어느 번들이 누구인가. 두 뭉치(등신·치비)를 따로 센다.
 *
 * ⚠️ **개발 쪽 `bdspNpc.py`가 만들던 `bdspNpc.json`을 여기서 다시 만든다.**
 * 공개 사용자에게는 그 파일이 없다. 규칙(`engine/actor/npcModels`)은 한 벌이고
 * 재료만 각자 만든다
 */
async function scanPersons(
  ctx: ConvertContext, src: BdspSource, at: Map<string, string>,
): Promise<NpcModelTable> {
  const table: NpcModelTable = {
    battle: { bundles: {}, vocabulary: [] },
    field: { bundles: {}, vocabulary: [] },
  }
  const builds = [['battle', `${PERSONS}/battle`], ['field', `${PERSONS}/field`]] as const
  const total = builds.reduce((a, [, dir]) => a + childrenOf(at, dir).length, 0)
  let done = 0
  for (const [build, dir] of builds) {
    const bundles: Record<string, string[]> = {}
    for (const path of childrenOf(at, dir)) {
      const bytes = await src.read(path)
      const name = path.slice(path.lastIndexOf('/') + 1)
      bundles[name] = bytes ? tagsOf(bytes) : []
      done++
      if (done % 4 === 0) { ctx.onProgress?.(done, total); await breathe(ctx) }
    }
    table[build] = {
      bundles,
      vocabulary: [...new Set(Object.values(bundles).flat())].sort(),
    }
  }
  return table
}

// ── npcModels ────────────────────────────────────────────────────────────────

/**
 * 주인공이면 치비에서 필드 동작을 꿔 온다 (`engine/actor/npcModels`의
 * `HERO_FIELD_CLIPS`). 다른 사람이면 빈 것을 돌려준다.
 *
 * ⚠️ **치비 번들을 통째로 안 연다.** 메시는 다른 번들에 나가 있어서 폴더를 다
 * 열어야 풀리지만(PLAN §16.9), 여기서 쓰는 것은 **Transform 계층과
 * AnimationClip뿐**이고 그 둘은 번들 하나에 다 들어 있다 — 실측으로
 * `fc0001_00` 하나에서 Transform 276개와 클립 56개가 나온다
 */
async function heroFieldClips(
  ctx: ConvertContext, src: BdspSource, at: Map<string, string>, bundle: string,
): Promise<{ clipsFrom?: Environment, borrowOnly?: ReadonlySet<string> }> {
  const donor = fieldClipDonor(bundle)
  if (donor === null) return {}
  const path = lookup(at, `${PERSONS}/field/${donor}`)
  const env = path ? await environmentOf(src, [path]) : null
  await breathe(ctx)
  if (!env) return {}
  return { clipsFrom: env, borrowOnly: new Set(HERO_FIELD_CLIPS) }
}

async function convertNpcModels(ctx: ConvertContext): Promise<Produced> {
  const src = requireBdsp(ctx)
  const at = await index(src)
  const out: Produced = new Map()

  const table = await scanPersons(ctx, src, at)

  /** 후보 차례 → 그 차례를 쓰는 사람. 같은 차례는 한 번만 굽는다 */
  const wanted = new Map<string, readonly string[]>()
  /** 그림 번호 → 후보 번들들. 실제로 구워진 첫 번째가 그 사람이 된다 */
  const bySprite = new Map<number, readonly string[]>()
  for (const [id, name] of Object.entries(SPRITE_NAMES)) {
    const model = modelFor(name, table, Number(id))
    if (!model) continue
    bySprite.set(Number(id), model.bundles)
    wanted.set(model.bundles.join(' '), model.bundles)
  }
  if (wanted.size === 0) throw new Error('BDSP 인물 번들에서 세울 사람을 하나도 못 찾았습니다')

  const jobs = [...wanted.values()].sort((a, b) => a[0]!.localeCompare(b[0]!))
  const made = new Set<string>()
  const broken = new Set<string>()
  let done = 0

  /** 번들 하나. 이미 해 본 것은 다시 안 한다 — 여럿이 같은 몸을 쓴다 */
  const bake = async (bundle: string): Promise<boolean> => {
    if (made.has(bundle)) return true
    if (broken.has(bundle)) return false
    const path = lookup(at, `${PERSONS}/${buildOf(bundle)}/${bundle}`)
    const env = path ? await environmentOf(src, [path]) : null
    if (!env) { broken.add(bundle); return false }
    try {
      // ⚠️ **등신과 치비가 싣는 것이 다르다.** 걷기는 `actor/locomotion`이
      // 뼈를 직접 돌려 만들어서 치비(`fc*`)의 클립 쉰여섯은 쓸 자리가 없다 —
      // 다 실으면 한 명이 1.06MB에서 2.58MB가 된다. 등신(`tr*`·`pc*`)은
      // 배틀에서 이어 붙는 셋만 싣는다 (`TRAINER_CLIPS`)
      const battle = buildOf(bundle) === 'battle'
      const { glb } = await exportModel(env, encodePng, {
        maxSize: MAX_TEXTURE,
        keepClips: battle,
        ...(battle ? { clipFilter: TRAINER_CLIPS } : {}),
        ...(await heroFieldClips(ctx, src, at, bundle)),
      })
      put(ctx, out, `models/npc/${bundle}.glb`, glb)
      made.add(bundle)
      return true
    } catch {
      broken.add(bundle)
      return false
    }
  }

  for (const order of jobs) {
    check(ctx)
    // ⚠️ **한 번들에 걸지 않는다.** 어떤 배틀 번들은 같은 폴더에 없는 CAB을
    // 가리켜서 열다가 끊긴다 (`tr1085_00`의 재질). 그때 쓸 다음 후보가 **같은
    // 번호의 필드 번들**이다 — 안 그러면 그 사람만 통째로 사라진다
    for (const bundle of order) {
      if (await bake(bundle)) break
    }
    done++
    ctx.onProgress?.(done, jobs.length + 2)
    await breathe(ctx)
  }
  if (made.size === 0) throw new Error('BDSP 인물 모델을 하나도 못 구웠습니다')

  // ⚠️ **구워 낸 것만 담는다.** 없는 glb를 받으러 가면 그 사람이 판때기로도
  // 안 서고 사라진다
  const sprites: Record<string, string> = {}
  for (const [sprite, order] of [...bySprite].sort((a, b) => a[0] - b[0])) {
    const bundle = order.find((b) => made.has(b))
    if (bundle !== undefined) sprites[String(sprite)] = bundle
  }
  put(ctx, out, 'data/npcModels.json', json(sprites))

  // 주인공. 화면 쪽이 `models/dawn.glb`로도 받는다
  if (made.has(NPC_BUNDLE.heroine)) {
    const path = lookup(at, `${PERSONS}/battle/${NPC_BUNDLE.heroine}`)
    const env = path ? await environmentOf(src, [path]) : null
    if (env) {
      // ⚠️ **클립을 안 싣는다.** 이 파일을 읽는 화면이 없다 — 배틀에도 필드에도
      // 서는 것은 `models/npc/pc0002_00.glb`다 (`playerModelPath`). 노드
      // 추출기(`extract:player`)도 `--no-clips`로 굽는다. 여기만 셋을 실으면
      // 아무도 안 보는 자리에 설치본마다 몇백 KB가 더 실린다
      const { glb } = await exportModel(env, encodePng, {
        maxSize: MAX_TEXTURE, keepClips: false,
      })
      put(ctx, out, 'models/dawn.glb', glb)
    }
  }
  ctx.onProgress?.(jobs.length + 1, jobs.length + 2)
  await breathe(ctx)

  // 자전거
  const bike = lookup(at, BIKE)
  const bikeEnv = bike ? await environmentOf(src, [bike]) : null
  if (bikeEnv) {
    const { glb } = await exportModel(bikeEnv, encodePng, { maxSize: MAX_TEXTURE, keepClips: false })
    put(ctx, out, 'models/bike.glb', glb)
  }
  ctx.onProgress?.(jobs.length + 2, jobs.length + 2)
  return out
}

// ── monModels ────────────────────────────────────────────────────────────────

/**
 * 종마다 배틀에서 곱하는 배율 (`PokemonInfo.Catalog.BattleScale`).
 *
 * ⚠️ **모델을 실측 크기로 세우면 안 된다.** 개굴닌자가 0.097m, 레쿠쟈가 10.9m라
 * 한 화면에 같이 세울 수가 없다. BDSP는 종마다 배율을 따로 적어 두었고 그걸로
 * 화면에 드는 크기를 좁힌다 — 우리가 지어낼 값이 아니다
 */
/** 배율표의 열쇠. 폼마다 다를 수 있어서 도감 번호만으로는 부족하다 */
const scaleKey = (dex: number, form: number): number => dex * 100 + form

function battleScales(env: Environment): Map<number, number> {
  const out = new Map<number, number>()
  const spare = new Map<number, number>()
  for (const e of env.ofType('MonoBehaviour')) {
    const v = env.readEntry(e) as Props | null
    if (!v || v.m_Name !== 'PokemonInfo') continue
    const rows = v.Catalog as Props[] | undefined
    if (!rows) continue
    for (const row of rows) {
      const no = row.MonsNo
      const scale = row.BattleScale
      if (typeof no !== 'number' || typeof scale !== 'number') continue
      const value = Math.round(scale * 1000) / 1000
      const form = typeof row.FormNo === 'number' ? row.FormNo : 0
      const key = scaleKey(no, form)
      if (!spare.has(key)) spare.set(key, value)
      // 같은 폼 안에서는 수컷 · 보통색이 우선이다
      if (row.Sex === 0 && row.Rare === 0) out.set(key, value)
    }
    break
  }
  for (const [key, scale] of spare) if (!out.has(key)) out.set(key, scale)
  return out
}

/**
 * 폼이 여럿인 종의 첫 판 번호.
 *
 * ⚠️ **판이 여럿인 종은 `_00`이 없다.** 안농·캐스퐁·테오키스·도롱마담·체리버·
 * 깝질무·트리토돈·로토무·기라티나·쉐이미·아르세우스 열둘이 그렇고, 판 번호가
 * **11부터** 시작한다 — `pm0479_11_00`이 로토무의 기본 모습이다. 그래서
 * 우리 폼 번호는 `판 번호 − 11`이다.
 *
 * 실측으로 그 열둘의 판 수가 원작 폼 수와 하나도 안 틀리고 같다 (안농 28 ·
 * 아르세우스 18 · 로토무 6 · 테오키스 4 · 캐스퐁 4 · 도롱마담 3 · 도롱충이 3 ·
 * 체리버 2 · 조개무지 2 · 트리토돈 2 · 기라티나 2 · 쉐이미 2)
 */
const FORM_BUNDLE_BASE = 11

/**
 * 구울 수 있는 것. `(도감 번호, 폼, 번들 이름)`.
 *
 * 폼도 전부 굽는다 (PARITY §3.4) — 로토무 가전 다섯이 다 같은 모습으로 서면
 * 가전 방이 아무 뜻이 없다
 */
function speciesBundles(at: Map<string, string>): { dex: number, form: number, name: string }[] {
  const battle = new Set(
    childrenOf(at, POKEMON_BATTLE).map((p) => p.slice(p.lastIndexOf('/') + 1)),
  )
  const out: { dex: number, form: number, name: string }[] = []
  for (let dex = 1; dex <= LAST_DEX; dex++) {
    const four = String(dex).padStart(4, '0')
    const plain = `pm${four}_00_00`
    if (battle.has(plain)) { out.push({ dex, form: 0, name: plain }); continue }
    const forms = [...battle].filter((n) => new RegExp(`^pm${four}_\\d\\d_00$`).test(n)).sort()
    for (const name of forms) {
      out.push({ dex, form: Number(name.slice(7, 9)) - FORM_BUNDLE_BASE, name })
    }
  }
  return out
}

/** 그 종의 첫 판이 들고 있는 메시 번들. 폼이 나눠 쓰는 자리다 */
function sharedMesh(at: Map<string, string>, name: string): string | null {
  const want = new RegExp(`^${name.slice(0, 6)}_\\d\\d$`)
  const found = childrenOf(at, POKEMON_COMMON)
    .map((p) => p.slice(p.lastIndexOf('/') + 1))
    .filter((n) => want.test(n))
    .sort()
  return found.length > 0 ? lookup(at, `${POKEMON_COMMON}/${found[0]!}`) : null
}

/** 바인드 포즈에서 잰 키(m). 종마다 크기가 다른 것을 이걸로 옮긴다 */
function glbHeight(glb: Uint8Array): number {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLength = view.getUint32(12, true)
  const text = new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))
  const gltf = JSON.parse(text) as {
    meshes: { primitives: { attributes: Record<string, number> }[] }[]
    accessors: { min?: number[], max?: number[] }[]
  }
  let top = -Infinity
  let low = Infinity
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION!]
      if (!acc?.min || !acc.max) continue
      top = Math.max(top, acc.max[1]!)
      low = Math.min(low, acc.min[1]!)
    }
  }
  return Number.isFinite(top - low) ? Math.round((top - low) * 1000) / 1000 : 0
}

async function convertMonModels(ctx: ConvertContext): Promise<Produced> {
  const src = requireBdsp(ctx)
  const at = await index(src)
  const out: Produced = new Map()

  const master = lookup(at, MASTERDATAS)
  const masterEnv = master ? await environmentOf(src, [master]) : null
  // 배율은 masterdatas가 임자다. 없으면 실측 크기 그대로 선다 — **지어내지 않는다**
  const scales = masterEnv ? battleScales(masterEnv) : new Map<number, number>()

  const todo = speciesBundles(at)
  if (todo.length === 0) throw new Error('BDSP 포켓몬 배틀 번들을 하나도 못 찾았습니다')

  const index2: Record<string, { file: string, height: number, scale: number }> = {}
  let done = 0
  for (const { dex, form, name } of todo) {
    check(ctx)
    // ⚠️ **번들이 셋으로 갈려 있다.** 배틀 프리팹에 재질·뼈대·동작이 있고 메시와
    // 텍스처는 `pokemons/common` 쪽 번들 둘에 있다. 하나만 열면 "메시가 없다"로
    // 끝나고 그 종이 통째로 빠진다
    const stem = name.replace(/_\d\d$/, '')
    // ⚠️ **메시가 기본 판에만 있는 종이 있다.** 아르세우스·도롱충이·도롱마담·
    // 조개무지·트리토돈이 그렇다 — `common/pm0493_12`가 아예 없고 열여덟 판이
    // `common/pm0493_11` 하나를 나눠 쓴다. 제 것이 없으면 그 종의 첫 판을 연다
    const mesh = lookup(at, `${POKEMON_COMMON}/${stem}`) ?? sharedMesh(at, name)
    const paths = [
      lookup(at, `${POKEMON_BATTLE}/${name}`),
      mesh,
      lookup(at, `${POKEMON_COMMON}/${name}`),
    ].filter((p): p is string => p !== null)
    const env = await environmentOf(src, paths)
    if (env) {
      try {
        const { glb } = await exportModel(env, encodePng, {
          maxSize: MAX_TEXTURE,
          keepClips: true,
          clipFilter: BATTLE_CLIPS,
          mainProps: MON_MAIN_PROPS,
        })
        // 폼 0은 종 번호 그대로다 — 읽는 쪽이 폼을 모르는 자리가 아직 있다
        const key = form === 0 ? String(dex) : `${String(dex)}-${String(form)}`
        const file = `${key}.glb`
        put(ctx, out, `models/pokemon/${file}`, glb)
        index2[key] = {
          file,
          height: glbHeight(glb),
          // 폼 배율이 없으면 기본 모습 것으로 떨어진다
          scale: scales.get(scaleKey(dex, form)) ?? scales.get(scaleKey(dex, 0)) ?? 1,
        }
      } catch { /* 이 종은 못 구웠다. 다음으로 */ }
    }
    done++
    ctx.onProgress?.(done, todo.length)
    await breathe(ctx)
  }
  if (Object.keys(index2).length === 0) throw new Error('BDSP 포켓몬 모델을 하나도 못 구웠습니다')

  put(ctx, out, 'models/pokemon/index.json', json({ pokemon: index2 }))
  return out
}

// ── arenas ───────────────────────────────────────────────────────────────────

/**
 * 구워야 할 무대들.
 *
 * ⚠️ **목록을 여기 적지 않는다.** 어느 배경이 어느 무대를 쓰는지는
 * `engine/battle/arena`가 유일한 임자다. 한 벌 더 적어 두면 표에 무대를 붙인 날
 * 굽는 것을 빠뜨리고, 그러면 그 배경을 쓰는 맵에서만 배틀이 빈 땅 위에 열린다
 */
export function arenaFiles(): string[] {
  return [...new Set(EVERY_ARENA.map((a) => a.file))].sort()
}

async function convertArenas(ctx: ConvertContext): Promise<Produced> {
  const src = requireBdsp(ctx)
  const at = await index(src)
  const out: Produced = new Map()

  const files = arenaFiles()
  const made: string[] = []
  let done = 0
  for (const file of files) {
    check(ctx)
    const name = file.replace(/\.glb$/, '')
    const path = lookup(at, `${ARENA_GROUND}/${name}`)
    const env = path ? await environmentOf(src, [path]) : null
    if (env) {
      try {
        const { glb } = await exportArena(env, encodePng, { name })
        put(ctx, out, `models/arena/${file}`, glb)
        made.push(file)
      } catch { /* 이 무대는 못 구웠다 */ }
    }
    done++
    ctx.onProgress?.(done, files.length)
    await breathe(ctx)
  }
  if (made.length === 0) throw new Error('BDSP 배틀 무대를 하나도 못 구웠습니다')
  put(ctx, out, 'models/arena/index.json', json({ arenas: made }))
  return out
}

// ── motionTiming ─────────────────────────────────────────────────────────────
//
// **때리는 순간은 종마다 다르다.** 한 박자로 때리면 모부기도 리아코도 같은 때에
// 부딪히는데, 공식 리메이크는 종마다 타격 프레임을 적어 두었다 —
// `battle_masterdatas`의 `BattleDataTable.MotionTimingData` 1,008줄이다. 모부기는
// 물리 25프레임, 리아코는 14프레임이다.
//
// ⚠️ **단위는 30프레임/초다.** 표는 프레임 번호만 주고 초를 안 준다. 클립 길이와
// 견주는 것으로는 못 가른다 — 30fps로 읽든 60fps로 읽든 465종이 465종 다 클립
// 안에 든다. 가른 것은 **돌진의 정점**이다: `ba20` 클립에서 뿌리 뼈가 제자리에서
// 제일 멀리 나간 시각을 재어 표와 견주면, 454종 중 410종이 30fps 쪽에 더 가깝다
// (중앙 오차 0.23초 대 0.52초).

const BATTLE_MASTERDATAS = 'Battle/battle_masterdatas'
/** 표가 적어 둔 프레임 번호의 단위 */
const MOTION_FPS = 30
/** 폼 번호를 종 번호에 붙일 때 쓰는 자릿수. 폼이 100을 넘지 않는다 */
const FORM_BASE = 100

/** 표의 칸 이름 → 우리 동작 이름 (`scene/battle/monModel.MOTION`) */
const MOTION_FIELDS = {
  physical: 'Buturi01',
  special: 'Tokusyu01',
  cry: 'Cry',
  enter: 'LandingFall',
} as const

/** `BattleDataTable`의 `MotionTimingData` 줄들 */
function motionRows(env: Environment): Props[] {
  for (const e of env.ofType('MonoBehaviour')) {
    const v = env.readEntry(e) as Props | null
    if (!v || v.m_Name !== 'BattleDataTable') continue
    const rows = v.MotionTimingData as Props[] | undefined
    if (rows) return rows
  }
  throw new Error('battle_masterdatas에 BattleDataTable이 없습니다')
}

async function convertMotionTiming(ctx: ConvertContext): Promise<Produced> {
  const src = requireBdsp(ctx)
  const at = await index(src)
  ctx.onProgress?.(0, 2)

  const path = lookup(at, BATTLE_MASTERDATAS)
  const env = path ? await environmentOf(src, [path]) : null
  if (!env) throw new Error(`${BATTLE_MASTERDATAS} 번들을 못 읽었습니다`)
  const rows = motionRows(env)
  check(ctx)
  ctx.onProgress?.(1, 2)
  await breathe(ctx)

  const byKey = new Map<number, Props[]>()
  for (const row of rows) {
    const mons = row.MonsNo, form = row.FormNo
    if (typeof mons !== 'number' || typeof form !== 'number') continue
    const key = mons * FORM_BASE + form
    const group = byKey.get(key)
    if (group) group.push(row)
    else byKey.set(key, [row])
  }
  if (byKey.size === 0) throw new Error('MotionTimingData가 비어 있습니다')

  // ⚠️ **성별 칸을 버리기 전에 여기서 다시 센다.** 지금은 남녀가 다른 조합이
  // 0개라 버려도 되는데, 표가 바뀌면 그때 알아야 한다 — 조용히 첫 줄만 쓰면
  // 암컷만 다른 박자로 때리는 종이 생겨도 아무도 모른다
  const fields = Object.keys(rows[0] ?? {}).filter((k) => !['MonsNo', 'FormNo', 'Sex'].includes(k))
  let split = 0
  for (const group of byKey.values()) {
    if (group.length > 1 && fields.some((f) => group[0]![f] !== group[1]![f])) split++
  }
  if (split > 0) throw new Error(`성별로 값이 갈리는 조합이 ${String(split)}개다 — 성별을 버리면 안 된다`)

  const frames: Record<string, number[]> = {}
  for (const key of [...byKey.keys()].sort((a, b) => a - b)) {
    const row = byKey.get(key)![0]!
    frames[String(key)] = Object.values(MOTION_FIELDS).map((f) => {
      const v = row[f]
      if (typeof v !== 'number') throw new Error(`${f} 칸이 숫자가 아니다`)
      return v
    })
  }
  ctx.onProgress?.(2, 2)

  return new Map([
    ['data/motionTiming.json', json({
      fps: MOTION_FPS, order: Object.keys(MOTION_FIELDS), frames,
    })],
  ])
}

// ── 그룹 표 ──────────────────────────────────────────────────────────────────

export const BDSP_GROUPS: readonly GroupSpec[] = [
  {
    name: 'npcModels',
    outputs: ['models/npc/{번들}.glb', 'models/dawn.glb', 'models/bike.glb', 'data/npcModels.json'],
    converter: 1,
    convert: convertNpcModels,
  },
  {
    name: 'monModels',
    outputs: ['models/pokemon/{도감}[-{폼}].glb', 'models/pokemon/index.json'],
    converter: 1,
    convert: convertMonModels,
  },
  {
    name: 'arenas',
    outputs: ['models/arena/{무대}.glb', 'models/arena/index.json'],
    converter: 1,
    convert: convertArenas,
  },
  {
    name: 'motionTiming',
    outputs: ['data/motionTiming.json'],
    converter: 1,
    convert: convertMotionTiming,
  },
]
