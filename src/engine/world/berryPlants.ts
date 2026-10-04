// 나무열매 나무 모델의 이름 (docs/orders/BATTLE_FX_20261004.md §2)
//
// BDSP `Environments/gimmick/kino001`~`kino064`가 열매마다 한 벌이다. 열매 번호는 `KinomiData`의 `TagNo`(1~65)와 같고
// `ItemNo` 149(Cheri)부터 이어진다 — 우리 열매 번호(`berries.json`의 1~64)와 같은 차례다. 065는 BDSP가 더한 열매라 짝이 없다.
// 한 벌은 `Miki`(줄기 · 잎) · `Hana`(꽃) · `Mi`(열매) 세 묶음이고, 싹은 따로 `kinoseeding` 한 벌이다.
//
// ⚠️ **굽는 쪽 둘이 이 표를 읽는다** — 노드 쪽 `bdspArena.py`(`BERRY_COUNT`)와 브라우저 변환기(`import/bdsp/convert.ts`).
// 갈리면 설치본에서 어느 열매 나무가 빈다

/** 우리 열매 표의 개수 */
const BERRY_PLANT_COUNT = 64

/** 싹 모델 — 열매와 상관없이 한 벌이다 */
export const BERRY_SEEDING = 'kinoseeding'

/** 묶음 노드 이름: 자람(줄기 · 잎) · 꽃 · 열매 */
export const BERRY_GROWING = 'Miki'
export const BERRY_BLOOMING = 'Hana'
export const BERRY_FRUIT = 'Mi'

/** 그 열매(1~64)의 모델 이름 — 범위 밖이면 null */
export function berryPlantName(berryID: number): string | null {
  if (!Number.isInteger(berryID) || berryID < 1 || berryID > BERRY_PLANT_COUNT) return null
  return `kino${String(berryID).padStart(3, '0')}`
}

/** 구워야 할 모델 전부 (`.glb` 확장자 없이) */
export function berryPlantNames(): string[] {
  return [...Array.from({ length: BERRY_PLANT_COUNT }, (_, i) => berryPlantName(i + 1)!), BERRY_SEEDING]
}
