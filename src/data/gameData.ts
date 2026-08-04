// 정적 게임 데이터 로더 (DATA.md §3.2)
//
// 롬은 런타임에 파싱하지 않는다 — 브라우저에서 128MB를 다룰 이유도, 로케일 3벌을
// 매번 디코드할 이유도 없다. 추출기가 만든 JSON만 받아 스키마로 검증한다.
//
// 메커니즘(species/moves)과 이름(names/*)을 나눠 둔 이유: 로케일을 바꿔도
// 메커니즘은 다시 받을 필요가 없고, 배틀 계산은 이름을 아예 필요로 하지 않는다.
import {
  labelsSchema, moveFileSchema, nameListSchema, speciesFileSchema, trainerFileSchema,
  type Labels, type Move, type Species, type Trainer,
} from './schema'

export type DataLocale = 'en' | 'ko' | 'ja'

/** 모듈 스코프 캐시 — 같은 파일을 두 번 받지 않는다 */
const cache = new Map<string, Promise<unknown>>()

async function fetchJson<T>(path: string, parse: (v: unknown) => T): Promise<T> {
  const hit = cache.get(path)
  if (hit) return hit as Promise<T>
  const promise = fetch(`${import.meta.env.BASE_URL}data/${path}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${path} 로드 실패: HTTP ${r.status}`)
      return r.json()
    })
    .then(parse)
    .catch((e) => {
      cache.delete(path) // 실패를 캐시하면 재시도가 영영 막힌다
      throw e
    })
  cache.set(path, promise)
  return promise
}

export interface SpeciesTable {
  all: readonly Species[]
  byId: ReadonlyMap<number, Species>
  get(id: number): Species
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
  return fetchJson('species.json', (v) =>
    indexed(speciesFileSchema.parse(v).species, '종족'))
}

export function loadMoves(): Promise<MoveTable> {
  return fetchJson('moves.json', (v) => indexed(moveFileSchema.parse(v).moves, '기술'))
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
    const all = trainerFileSchema.parse(v).trainers
    const byId = new Map(all.map((t) => [t.id, t]))
    return {
      all,
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

export function loadLabels(locale: DataLocale): Promise<Labels> {
  return fetchJson(`names/labels.${locale}.json`, (v) => labelsSchema.parse(v))
}

/** 성비 바이트를 암컷 확률로. 무성이면 null */
export function femaleChance(genderRatio: number): number | null {
  if (genderRatio === 255) return null
  return genderRatio / 254
}
