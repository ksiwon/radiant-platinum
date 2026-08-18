// 정적 게임 데이터 로더 (DATA.md §3.2)
//
// 롬은 런타임에 파싱하지 않는다 — 브라우저에서 128MB를 다룰 이유도, 로케일 3벌을
// 매번 디코드할 이유도 없다. 추출기가 만든 JSON만 받아 스키마로 검증한다.
//
// 메커니즘(species/moves)과 이름(names/*)을 나눠 둔 이유: 로케일을 바꿔도
// 메커니즘은 다시 받을 필요가 없고, 배틀 계산은 이름을 아예 필요로 하지 않는다.
import {
  boxWallpapersSchema, creditsSchema, dialogueIndexSchema, signpostsSchema, itemFileSchema, itemIconsSchema, labelsSchema,
  berriesSchema, distortionSchema, pokedexHabitatSchema, pokedexSortSchema,
  frontierSchema,
  martTableSchema, motionTimingSchema, moveFileSchema, nameListSchema, npcTradesSchema,
  pokeIconsSchema,
  scriptFileSchema,
  speciesFileSchema, trainerFileSchema, townMapSchema, poketchMapSchema,
  type BoxWallpapers, type CreditsAtlas, type DialogueIndex, type Signposts, type Item, type ItemIcons, type Labels,
  type MartTable, type MotionTiming, type Move, type NpcTrades, type PokeIcons, type ScriptFile,
  type Species, type Trainer, type TownMapFile, type PoketchMapFile,
  type PokedexHabitat, type PokedexSort, type Berries, type DistortionData,
  type FrontierData,
} from './schema'
import type { HiddenItem } from '../engine/world/hiddenItemTable'
import type { MoveAnim } from '../engine/battle/moveAnimTable'

/** 숨은 도구 한 줄 */
export type HiddenItemRow = HiddenItem

export type { PokedexHabitat, PokedexSort, Berries }
export type { Berry } from './schema'
import { assets, onProviderSwap, readJson } from './providers/assetProvider'
import { pinAtlas } from './providers/atlas'
import { formSpeciesId } from '../engine/pokemon/form'
import {
  EXTRA_ITEM_DESCRIPTIONS, EXTRA_ITEM_NAMES, EXTRA_ITEMS, withExtraItems,
} from '../engine/bag/extraItems'

/**
 * 세션 내내 살아 있는 그림 넉 장 (`providers/atlas`).
 *
 * 이름을 여기 두는 것은 **칸 크기 자료를 받는 자리가 여기**이기 때문이다 —
 * `itemIcons.json`과 `itemIcons.png`가 갈리면 한쪽만 온 상태가 생긴다
 */
export const ITEM_ICON_ATLAS = 'data/itemIcons.png'
export const POKE_ICON_ATLAS = 'data/pokeIcons.png'
export const BOX_WALLPAPER_ATLAS = 'data/boxWallpapers.png'
/** 크레딧 배경 한 장의 자리 (PARITY §8.12). 장마다 크기가 달라 파일도 따로다 */
export const creditsImage = (at: number): string => `data/credits${String(at)}.png`
export const SIGNPOST_ATLAS = 'data/signposts.png'
/** 포켓치 지도. 가로가 지도 갈래 둘, 세로가 액정 색 여덟이다 */
export const POKETCH_MAP_ATLAS = 'data/poketchMap.png'

export type DataLocale = 'en' | 'ko' | 'ja'

/** 모듈 스코프 캐시 — 같은 파일을 두 번 받지 않는다 */
const cache = new Map<string, Promise<unknown>>()

// ⚠️ **주소를 만들지 않는다.** 공개판에서 이 자료는 HTTP로 오지 않고 사용자의
// OPFS에서 온다 (IMPORT.md §7). 논리 경로만 넘기고 어디서 오는지는 Provider가
// 정한다 — 그 분기가 여기 들어오면 스무 군데로 번진다
async function fetchJson<T>(path: string, parse: (v: unknown) => T): Promise<T> {
  const hit = cache.get(path)
  if (hit) return hit as Promise<T>
  const promise = readJson(assets(), `data/${path}`)
    .then(parse)
    .catch((e: unknown) => {
      cache.delete(path) // 실패를 캐시하면 재시도가 영영 막힌다
      throw e
    })
  cache.set(path, promise)
  return promise
}

/** Provider를 갈아 끼우면 캐시도 버려야 한다 — 옛 설치본의 자료가 남는다 */
export function resetGameDataCache(): void {
  cache.clear()
}

// 갈아 끼울 때 자동으로. 손으로 부르는 것에 기대면 한 군데를 반드시 빠뜨린다
onProviderSwap(() => { resetGameDataCache() })

/**
 * 종족 자료를 집어 오는 데 필요한 최소한.
 *
 * 표 전체가 아니라 이것만 받는 자리가 여럿이다 — 시험이 표를 흉내 내기 쉽고,
 * 무엇을 실제로 읽는지가 형에 드러난다
 */
export interface SpeciesLookup {
  get(id: number): Species
  /**
   * 그 **개체**의 종족 자료 (`SpeciesData_LoadForm`).
   *
   * ⚠️ **폼이 있는 마리는 `get(mon.species)`가 아니다.** 도롱마담 쓰레기의
   * 종족값·타입·특성·기술표가 표의 500번 칸에 따로 있어서, 종 번호로 읽으면
   * 겉모습만 바뀌고 싸울 때는 풀 옷감이 된다
   */
  of(mon: { species: number, form: number }): Species
}

export interface SpeciesTable extends SpeciesLookup {
  all: readonly Species[]
  byId: ReadonlyMap<number, Species>
  /** 종족 번호 → 신오도감 번호. 0이면 신오도감에 없다 */
  sinnohOf: readonly number[]
  /** 신오도감 순서 (1번이 모부기다). 0번 칸은 비어 있다 */
  sinnohDex: readonly number[]
  /** 종족 → 알에서 나오는 맨 앞 단계 (`pms.narc`). 육성가가 이걸 본다 */
  babyOf: readonly number[]
}

export interface MoveTable {
  all: readonly Move[]
  byId: ReadonlyMap<number, Move>
  get(id: number): Move
}

function indexed<T extends { id: number }>(all: T[], what: string) {
  const byId = new Map(all.map((x) => [x.id, x]))
  return {
    all,
    byId,
    get(id: number) {
      const v = byId.get(id)
      if (!v) throw new Error(`${what} #${id}이(가) 데이터에 없다`)
      return v
    },
  }
}

export function loadSpecies(): Promise<SpeciesTable> {
  return fetchJson('species.json', (v) => {
    const file = speciesFileSchema.parse(v)
    const base = indexed(file.species, '종족')
    return {
      ...base,
      of: (mon: { species: number, form: number }) =>
        base.get(formSpeciesId(mon.species, mon.form)),
      sinnohOf: file.sinnohOf,
      sinnohDex: file.sinnohDex,
      babyOf: file.babyOf,
    }
  })
}

export function loadMoves(): Promise<MoveTable> {
  return fetchJson('moves.json', (v) => indexed(moveFileSchema.parse(v).moves, '기술'))
}

export interface MotionTimingTable {
  /** 그 동작이 **몇 초 뒤에 꽂히는가**. 표에 없는 종은 null */
  at(species: number, form: number, motion: string): number | null
}

/**
 * 종마다 다른 동작 타이밍 (`BattleDataTable.MotionTimingData`, 11.9KB).
 *
 * 프레임 번호를 그대로 내놓지 않고 **초**로 바꿔 준다 — 읽는 쪽이 30이라는
 * 수를 알 필요가 없고, 표가 프레임률을 함께 들고 있기 때문이다
 */
export function loadMotionTiming(): Promise<MotionTimingTable> {
  return fetchJson('motionTiming.json', (v) => {
    const file: MotionTiming = motionTimingSchema.parse(v)
    const slot = new Map(file.order.map((name, i) => [name, i]))
    return {
      at(species, form, motion) {
        const i = slot.get(motion)
        if (i === undefined) return null
        // 폼이 있는 종은 그 폼 줄이 따로 있고, 없으면 0번 폼으로 떨어진다
        const row = file.frames[String(species * 100 + form)]
          ?? file.frames[String(species * 100)]
        const frame = row?.[i]
        return frame === undefined || frame === 0 ? null : frame / file.fps
      },
    }
  })
}

/**
 * 종족 이름 배열. 인덱스는 **종족 번호(id)**다 — 배열 순서가 아니다.
 * 추출기가 일부러 번호로 색인해 둔다. 순서로 색인하면 id와 어긋나서 조용히 옆
 * 포켓몬 이름이 나오고, 그런 버그는 눈으로 안 잡힌다
 */
export function loadSpeciesNames(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/species.${locale}.json`, (v) => nameListSchema.parse(v))
}

export function loadMoveNames(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/moves.${locale}.json`, (v) => nameListSchema.parse(v))
}

export interface TrainerTable {
  all: readonly Trainer[]
  /** 분류별 상금 배수. 색인은 `Trainer.class`다 */
  prizeMul: readonly number[]
  get(id: number): Trainer
}

/**
 * 트레이너 928명. 파티·AI 플래그·가방까지 한 파일이다.
 *
 * 154 kB(gzip 16 kB)라 통째로 받아도 부담이 없다. 트레이너전이 시작될 때
 * 처음 받으므로 오버월드 예산에는 안 들어간다
 */
export function loadTrainers(): Promise<TrainerTable> {
  return fetchJson('trainers.json', (v) => {
    const file = trainerFileSchema.parse(v)
    const all = file.trainers
    const byId = new Map(all.map((t) => [t.id, t]))
    return {
      all,
      prizeMul: file.prizeMul,
      get(id: number) {
        const t = byId.get(id)
        if (!t) throw new Error(`트레이너 #${id}이(가) 데이터에 없다`)
        return t
      },
    }
  })
}

/** 트레이너 이름 928개. 번호로 색인한다 */
export function loadTrainerNames(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/trainers.${locale}.json`, (v) => nameListSchema.parse(v))
}

/** 트레이너 분류 이름 105개("체육관 관장"). trdata의 class로 색인한다 */
export function loadTrainerClasses(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/trainerClasses.${locale}.json`, (v) => nameListSchema.parse(v))
}

/** 지역명. 맵 헤더의 `label`로 색인한다 (`MapHeader_GetMapLabelTextID`) */
export function loadLocationNames(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/locations.${locale}.json`, (v) => nameListSchema.parse(v))
}

export interface ItemTable {
  all: readonly Item[]
  pockets: readonly string[]
  /** 번호가 곧 배열 자리다 — 468칸이 빠짐없이 차 있다 */
  get(id: number): Item
  /** 주머니별 아이템 번호. 가방이 이 순서로 보여 준다 */
  pocket(index: number): readonly number[]
  /** 기술머신 100개가 가르치는 기술 번호 (TM01…TM92, HM01…HM08) */
  tmMoves: readonly number[]
}

/** 아이템 468종. 자료가 없는 ITEM_UNUSED_* 22종도 자리를 지킨다 */
export function loadItems(): Promise<ItemTable> {
  return fetchJson('items.json', (v) => {
    const file = itemFileSchema.parse(v)
    // 롬 밖의 둘을 표 뒤에 잇는다 (PARITY §12). 앞의 468줄은 안 건드린다
    const items = withExtraItems(file.items, EXTRA_ITEMS)
    const byPocket = file.pockets.map(() => [] as number[])
    items.forEach((it, id) => {
      if (it.pocket !== undefined) byPocket[it.pocket]!.push(id)
    })
    return {
      all: items,
      pockets: file.pockets,
      get(id: number) {
        const it = items[id]
        if (!it) throw new Error(`아이템 #${id}이(가) 데이터에 없다`)
        return it
      },
      pocket: (index: number) => byPocket[index] ?? [],
      tmMoves: file.tmMoves,
    }
  })
}

export function loadItemNames(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/items.${locale}.json`, (v) => withExtraItems(
    nameListSchema.parse(v), EXTRA_ITEM_NAMES[locale] ?? EXTRA_ITEM_NAMES.en!,
  ))
}

export function loadItemDescriptions(locale: DataLocale): Promise<string[]> {
  return fetchJson(`names/itemDescriptions.${locale}.json`, (v) => withExtraItems(
    nameListSchema.parse(v), EXTRA_ITEM_DESCRIPTIONS[locale] ?? EXTRA_ITEM_DESCRIPTIONS.en!,
  ))
}

/**
 * 아이콘 아틀라스의 칸 크기. 그림 자체는 `data/itemIcons.png`다.
 *
 * ⚠️ **그림을 함께 잡아 둔다.** 칸 크기와 그림은 한 짝이라, 따로 두면 크기만
 * 온 상태가 화면에 남아 빈 칸이 뜬다 (`providers/atlas`)
 */
export function loadItemIcons(): Promise<ItemIcons> {
  return fetchJson('itemIcons.json', (v) => itemIconsSchema.parse(v))
    .then(async (icons) => { await pinAtlas(ITEM_ICON_ATLAS); return icons })
}

/** 포켓몬 아이콘 아틀라스의 칸 크기. 그림은 `data/pokeIcons.png`다 */
export function loadPokeIcons(): Promise<PokeIcons> {
  return fetchJson('pokeIcons.json', (v) => pokeIconsSchema.parse(v))
    .then(async (icons) => { await pinAtlas(POKE_ICON_ATLAS); return icons })
}

/** 박스 벽지 아틀라스. 그림은 `data/boxWallpapers.png`다 */
export function loadBoxWallpapers(): Promise<BoxWallpapers> {
  return fetchJson('boxWallpapers.json', (v) => boxWallpapersSchema.parse(v))
    .then(async (walls) => { await pinAtlas(BOX_WALLPAPER_ATLAS); return walls })
}

/** 크레딧 배경. 그림 세 장을 다 받아 둔다 — 흐르는 중에 받으면 그 자리가 빈다 */
export function loadCreditsAtlas(): Promise<CreditsAtlas> {
  return fetchJson('credits.json', (v) => creditsSchema.parse(v))
    .then(async (meta) => {
      for (let i = 0; i < meta.count; i++) await pinAtlas(creditsImage(i))
      return meta
    })
}

/** 간판 판 그림 아틀라스. 그림은 `data/signposts.png`다 */
export function loadSignposts(): Promise<Signposts> {
  return fetchJson('signposts.json', (v) => signpostsSchema.parse(v))
    .then(async (a) => { await pinAtlas(SIGNPOST_ATLAS); return a })
}

/** 상점 재고표. 롬이 아니라 디컴프 헤더에서 나온 것이다 (`tools/extract/marts.js`) */
export function loadMarts(): Promise<MartTable> {
  return fetchJson('marts.json', (v) => martTableSchema.parse(v))
}

/**
 * 배틀프런티어의 개체 형 951과 트레이너 315 (PARITY §9.3).
 *
 * ⚠️ **배틀팩토리에 들어갈 때만 읽는다.** 138KB라 첫 왕복에 실을 것이 아니다 —
 * 시설 문 앞에서 부른다
 */
export function loadFrontier(): Promise<FrontierData> {
  return fetchJson('frontier.json', (v) => frontierSchema.parse(v))
}

/**
 * NPC 교환 넷 (PARITY §10).
 *
 * 이름 둘은 여기 없다 — `loadUiText('npcTradeNames')`가 뱅크에서 가져온다
 */
export function loadNpcTrades(): Promise<NpcTrades> {
  return fetchJson('npcTrades.json', (v) => npcTradesSchema.parse(v))
}

/**
 * 숨은 도구 표 (PARITY §7.3). 다우징머신이 탐지 반경을 여기서 읽는다.
 *
 * 자리 번호(`script`)로 바로 짚을 수 있게 표로 만들어 준다 — 257개를
 * 매 프레임 훑으면 안 된다.
 *
 * ⚠️ **롬에서 안 온다.** 이 표는 오버레이 코드 안에 굳어 있어서 사용자의 롬
 * 하나로는 못 꺼낸다 — `pnpm gen:hiddenItems`가 디컴프에서 TS 모듈로 굽는다
 * (`engine/world/hiddenItemTable.ts`). 그래서 `fetchJson`이 아니라 동적 import다
 */
export async function loadHiddenItems(): Promise<Map<number, HiddenItemRow>> {
  const { HIDDEN_ITEMS } = await import('../engine/world/hiddenItemTable')
  return new Map(HIDDEN_ITEMS.map((row) => [row.script, row]))
}

/** 도감 정렬 목록 (PARITY §5). **로케일마다 다르다** — 가나다순이 언어에 매인다 */
export function loadPokedexSort(locale: DataLocale): Promise<PokedexSort> {
  return fetchJson(`pokedexSort.${locale}.json`, (v) => pokedexSortSchema.parse(v))
}

/** 도감 서식지 지도 (PARITY §5) */
export function loadPokedexHabitat(): Promise<PokedexHabitat> {
  return fetchJson('pokedexHabitat.json', (v) => pokedexHabitatSchema.parse(v))
}

/** 나무열매 64종 (PARITY §5 `berry_tag` · §4.6) */
export function loadBerries(): Promise<Berries> {
  return fetchJson('berries.json', (v) => berriesSchema.parse(v))
}

/** 깨어진 세계의 판·뛰는 자리·카메라·사건 (PARITY §6.10) */
/**
 * 기술 연출 대본 468개 (PARITY §7.3). 색인이 기술 번호고, 대본이 없는 자리는 null이다.
 *
 * ⚠️ **롬에서 안 온다.** 대본은 빌드 때 오버레이 코드로 굳어서 사용자의 롬
 * 하나로는 못 꺼낸다 — `pnpm gen:moveAnim`이 디컴프에서 TS 모듈로 굽는다.
 *
 * ⚠️ **정적으로 import 하면 안 된다.** 표 하나가 178KB라 첫 청크에 얹히면 앱 셸
 * 예산(첫 청크 gzip 150kB)을 그 자리에서 깬다. 부르는 자리가 `MoveVfx` 하나이고
 * **배틀에 들어갈 때 한 번**이므로 동적 import로 배틀 청크에 붙인다
 * (`@pkmn/sim`을 배틀 진입에서 집는 것과 같은 자리다 — PLAN §14)
 */
export async function loadMoveAnims(): Promise<readonly (MoveAnim | null)[]> {
  const { MOVE_ANIMS } = await import('../engine/battle/moveAnimTable')
  return MOVE_ANIMS
}

export function loadDistortion(): Promise<DistortionData> {
  return fetchJson('distortion.json', (v) => distortionSchema.parse(v))
}

export function loadLabels(locale: DataLocale): Promise<Labels> {
  return fetchJson(`names/labels.${locale}.json`, (v) => labelsSchema.parse(v))
}

/** 타운맵의 격자 표. 그림은 `data/townMap.png`로 따로 받는다 */
export function loadTownMap(): Promise<TownMapFile> {
  return fetchJson('townMap.json', (v) => townMapSchema.parse(v))
}

/** 포켓치 지도 아틀라스의 크기와 액정 팔레트. 그림은 `POKETCH_MAP_ATLAS`다 */
export function loadPoketchMap(): Promise<PoketchMapFile> {
  return fetchJson('poketchMap.json', (v) => poketchMapSchema.parse(v))
}

// ── 스크립트·대사 (DATA.md §2.10, §2.11) ──────────────────────────────────────

/** 바이트코드 1124개를 읽는 데 필요한 것 — 파일 경계, 명령 폭, scriptID 표 */
export function loadScriptMeta(): Promise<ScriptFile> {
  return fetchJson('scripts.json', (v) => scriptFileSchema.parse(v))
}

/**
 * 바이트코드 자체. 288KB이고 롬에서 꺼낸 그대로다.
 *
 * 스키마로 검증할 것이 없다 — 검증은 `scripts.json`의 파일 경계가 하고, 그
 * 경계는 추출기가 롬 바이트와 맞춰 본 것이다
 */
export function loadScriptBytes(): Promise<Uint8Array> {
  const hit = cache.get('scripts.bin')
  if (hit) return hit as Promise<Uint8Array>
  const promise = assets().bytes('data/scripts.bin')
    .then((b) => new Uint8Array(b))
    .catch((e: unknown) => {
      cache.delete('scripts.bin')
      throw e
    })
  cache.set('scripts.bin', promise)
  return promise
}

export function loadDialogueIndex(): Promise<DialogueIndex> {
  return fetchJson('dialogue/index.json', (v) => dialogueIndexSchema.parse(v))
}

/**
 * 뱅크 하나. **번호는 미국 롬 기준**이고 맵 헤더의 `msg`가 그 번호다.
 *
 * 맵 하나가 쓰는 것은 몇 KB뿐이라 필요할 때 받는다 — 430개를 다 받으면
 * 첫 대화 한 번에 141KB가 나간다
 */
export function loadDialogueBank(locale: DataLocale, bank: number): Promise<string[]> {
  return fetchJson(`dialogue/${locale}/${bank}.json`, (v) => nameListSchema.parse(v))
}

/** 성비 바이트를 암컷 확률로. 무성이면 null */
export function femaleChance(genderRatio: number): number | null {
  if (genderRatio === 255) return null
  return genderRatio / 254
}
