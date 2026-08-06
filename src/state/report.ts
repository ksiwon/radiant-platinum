// 리포트 — 세이브 파일 한 벌.
//
// **자동 저장이 아니다.** 원작은 리포트를 쓴 그 순간의 상태만 남기고, 그래서
// 리포트를 안 쓰고 끄면 지난 진행이 사라진다. 그 규칙이 게임의 긴장 절반을
// 만들기 때문에 그대로 둔다 — 그리고 "리포트한 자리에서 다시 시작한다"가
// 성립하려면 저장 시점이 하나여야 한다.
//
// ⚠️ JSON으로 안 바꾼다. 도감·플래그가 `Uint8Array`고 JSON을 거치면 평범한
// 객체가 되어 비트 연산이 조용히 망가진다. IndexedDB의 structured clone은
// TypedArray를 원형 그대로 보존한다.
import { get, set, del, createStore } from 'idb-keyval'
import type { SaveData } from './saveStore'

const dbStore = createStore('radiant-platinum', 'save')
/** 슬롯 하나. 원작도 세이브가 한 벌이다 */
const SLOT = 'report'

/**
 * 이름을 바꾸기 전에 쓰던 데이터베이스.
 *
 * ⚠️ **이름만 바꾸면 이미 저장된 리포트를 못 찾는다.** IndexedDB는 데이터베이스
 * 이름이 곧 주소라, 새 이름으로 열면 빈 창고가 하나 더 생길 뿐이고 옛 리포트는
 * 그대로 남아 영영 안 읽힌다. 그래서 처음 읽을 때 한 번 옮긴다
 */
const OLD_DB = 'pt-3d'
let migrated = false

async function migrate(): Promise<void> {
  if (migrated) return
  migrated = true
  try {
    // 새 자리에 이미 있으면 옮길 것이 없다. 덮어쓰면 최신 리포트를 잃는다
    if (await get<SaveData>(SLOT, dbStore) !== undefined) return
    const old = createStore(OLD_DB, 'save')
    const data = await get<SaveData>(SLOT, old)
    if (data === undefined) return
    await set(SLOT, data, dbStore)
    await del(SLOT, old)
  } catch { /* 옛 창고가 없거나 못 열면 옮길 것도 없다 */ }
}

/**
 * 리포트를 읽는다. 없거나 판이 안 맞으면 null.
 *
 * 버전이 다른 리포트는 **안 고친다.** 옛 세이브를 억지로 끌고 오다 보면
 * 어긋난 자료가 게임 안까지 흘러든다 — 없는 것으로 치고 새로 시작하는 편이 낫다
 */
export async function readReport(expectVersion: number): Promise<SaveData | null> {
  await migrate()
  const data = await get<SaveData>(SLOT, dbStore)
  if (!data || data.version !== expectVersion) return null
  return data
}

export function writeReport(data: SaveData): Promise<void> {
  return set(SLOT, data, dbStore)
}

export function clearReport(): Promise<void> {
  return del(SLOT, dbStore)
}

/** 이어하기를 띄울지 정하는 데만 쓴다 */
export async function hasReport(expectVersion: number): Promise<boolean> {
  return (await readReport(expectVersion)) !== null
}
