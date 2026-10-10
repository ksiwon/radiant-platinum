// 도감 화면이 한 번에 받는 자료. 꼭 있어야 하는 것(목록 · 글)이 하나라도 안 오면 화면이 안 서고,
// **없어도 되는 것**(그림 시트 · 크기 표 · 타운맵)은 못 받아도 `null`로 서서 그 쪽만 닫는다.
import {
  loadDexHeightWeight, loadDexShapes, loadLabels, loadPokedexHabitat, loadPokedexSort, loadPokeIcons,
  loadSpecies, loadSpeciesNames, loadTownMap, type DataLocale, type PokedexHabitat, type PokedexSort,
  type SpeciesTable,
} from '../../../data/gameData'
import type { DexHeightWeight, PokeIcons, TownMapFile } from '../../../data/schema'
import type { SpriteSheet } from '../../../data/spriteSheet'
import { loadUiText } from '../../../data/uiText'

export interface DexData {
  species: SpeciesTable
  names: string[]
  category: string[]
  entries: string[]
  heights: string[]
  weights: string[]
  /** 도감 뱅크 697 */
  ui: string[]
  /** 타입 이름 (엔진 타입 번호 차례) */
  types: string[]
  sort: PokedexSort
  habitat: PokedexHabitat
  // 없어도 서는 것
  icons: PokeIcons | null
  shapes: SpriteSheet | null
  hw: DexHeightWeight | null
  townMap: TownMapFile | null
}

/** 못 받아도 되는 것은 `null`로 접는다 — 던지지 않는다 */
function soft<T>(p: Promise<T>): Promise<T | null> {
  return p.then((v) => v, () => null)
}

export async function loadDexData(locale: DataLocale): Promise<DexData> {
  const [
    species, names, category, entries, heights, weights, ui, labels, sort, habitat,
    icons, shapes, hw, townMap,
  ] = await Promise.all([
    loadSpecies(), loadSpeciesNames(locale),
    loadUiText('speciesCategory', locale), loadUiText('dexEntry', locale),
    loadUiText('speciesHeight', locale), loadUiText('speciesWeight', locale),
    loadUiText('pokedex', locale), loadLabels(locale),
    loadPokedexSort(locale), loadPokedexHabitat(),
    soft(loadPokeIcons()), loadDexShapes().then((v) => v, () => null),
    loadDexHeightWeight(), soft(loadTownMap()),
  ])
  return {
    species, names, category, entries, heights, weights, ui, types: [...labels.types], sort, habitat,
    icons, shapes, hw, townMap,
  }
}
