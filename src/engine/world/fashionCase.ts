// 장식 케이스 (PARITY §7.16) — `unk_020298BC.c`의 `FashionCase`
//
// 상호교류광장에서 따라다니는 마리가 주워 오는 장식이 여기 쌓인다 (§7.8).
//
// ⚠️ **콘테스트에서 떼어 낸 조각이다.** 대회·포핀·씰·배경은 범위 밖이지만
// (§9) 케이스가 없으면 상호교류광장이 안 닫힌다 — 무엇을 주워 왔는지는 정하는데
// 넣을 곳이 없어진다.
//
// ⚠️ **장식이 두 갈래다.** 앞의 61가지는 **겹쳐 가질 수 있고**(한 가지에 아홉까지)
// 뒤의 39가지는 **하나뿐**이다. 원작이 그것을 서로 다른 비트 폭으로 담는다 —
// 겹치는 쪽은 4비트씩, 하나뿐인 쪽은 1비트씩이다.
//
// ⚠️ **배경(backdrop)은 안 담는다.** 원작 구조체에는 같이 있지만 그쪽은
// 콘테스트 전용이고 §9다.

/**
 * 장식 100가지 (`ACCESSORY_COUNT`).
 *
 * 이름은 롬 뱅크 `TEXT_BANK_CONTEST_ACCESSORY_NAMES`의 100줄이다
 */
export const ACCESSORY_COUNT = 100

/**
 * 여기까지가 **겹쳐 가질 수 있는** 장식이다 (`NON_UNIQUE_ACCESSORY_COUNT`).
 *
 * 0~60이 솜털·구슬 같은 것이고 61(컬러풀파라솔)부터가 하나뿐인 것이다 —
 * 디컴프 `generated/accessories.txt`의 `ACCESSORY_COLORED_PARASOL =
 * NON_UNIQUE_ACCESSORY_COUNT`가 그 경계고, 롬 이름표의 61번이 실제로
 * 컬러풀파라솔이다
 */
export const NON_UNIQUE_ACCESSORY_COUNT = 61

/** 겹치는 장식 하나를 몇 개까지 (`MAX_NON_UNIQUE_ACCESSORIES_PER_TYPE`) */
export const MAX_NON_UNIQUE = 9

/** 하나뿐인 장식은 하나까지 (`MAX_UNIQUE_ACCESSORIES_PER_TYPE`) */
export const MAX_UNIQUE = 1

/** 겹치는 쪽이 쓰는 u32 칸 수 (61가지 × 4비트 = 244비트 → 8칸) */
export const NON_UNIQUE_WORDS = 8

/** 하나뿐인 쪽이 쓰는 u32 칸 수 (39가지 × 1비트 → 2칸) */
export const UNIQUE_WORDS = 2

/** 리포트에 담기는 모양. 원작 구조체의 앞 두 배열 그대로다 */
export interface FashionCase {
  /** 겹치는 장식 61가지의 개수. 한 칸에 여덟 가지가 4비트씩 들어 있다 */
  readonly nonUnique: readonly number[]
  /** 하나뿐인 장식 39가지의 있고 없음. 한 칸에 서른둘이 1비트씩 */
  readonly unique: readonly number[]
}

/** 빈 케이스 (`FashionCase_Init`) */
export function newFashionCase(): FashionCase {
  return {
    nonUnique: Array.from({ length: NON_UNIQUE_WORDS }, () => 0),
    unique: Array.from({ length: UNIQUE_WORDS }, () => 0),
  }
}

/** 그 번호가 겹쳐 가질 수 있는 것인가 (`Accessory_CanHaveMultiple`) */
export function canHaveMultiple(accessory: number): boolean {
  return accessory < NON_UNIQUE_ACCESSORY_COUNT
}

/**
 * 몇 개 갖고 있는가 (`FashionCase_GetAccessoryCount`).
 *
 * ⚠️ **범위 밖이면 0이다.** 원작은 `GF_ASSERT`로 서는데 우리는 스크립트가 준
 * 값을 그대로 받으므로 조용히 0을 낸다 — 없는 장식을 가진 것으로 세지 않는다
 */
export function accessoryCount(fashionCase: FashionCase, accessory: number): number {
  if (!Number.isInteger(accessory) || accessory < 0 || accessory >= ACCESSORY_COUNT) return 0
  if (canHaveMultiple(accessory)) {
    const word = fashionCase.nonUnique[Math.floor(accessory / 8)] ?? 0
    const got = (word >>> ((accessory % 8) * 4)) & 0xf
    // ⚠️ **읽을 때도 상한을 씌운다** — `NonUniqueAccessoryFlags_GetCount`가
    // 4비트(최대 15)를 9로 깎는다. 안 깎으면 망가진 리포트가 열 개를 낸다
    return got > MAX_NON_UNIQUE ? MAX_NON_UNIQUE : got
  }
  const at = accessory - NON_UNIQUE_ACCESSORY_COUNT
  const word = fashionCase.unique[Math.floor(at / 32)] ?? 0
  return (word >>> (at % 32)) & 0x1
}

/**
 * 그만큼 더 넣을 자리가 있는가 (`FashionCase_CanFitAccessoryCount`).
 *
 * ⚠️ **자리가 없으면 스크립트가 딴 길로 간다.** 상호교류광장은 장식이 안 들어가면
 * 도구를 대신 주워 오고, 그것도 안 되면 아무것도 안 준다
 */
export function canFitAccessory(
  fashionCase: FashionCase, accessory: number, count: number,
): boolean {
  const max = canHaveMultiple(accessory) ? MAX_NON_UNIQUE : MAX_UNIQUE
  return accessoryCount(fashionCase, accessory) + count <= max
}

/**
 * 넣는다 (`FashionCase_AddAccessory`).
 *
 * ⚠️ **넘치면 자른다. 안 터진다** — 원작도 상한에서 멈춘다. `canFitAccessory`가
 * 거짓일 때 불러도 잃는 것은 넘친 몫뿐이다
 */
export function addAccessory(
  fashionCase: FashionCase, accessory: number, amount: number,
): FashionCase {
  if (!Number.isInteger(accessory) || accessory < 0 || accessory >= ACCESSORY_COUNT) {
    return fashionCase
  }
  const max = canHaveMultiple(accessory) ? MAX_NON_UNIQUE : MAX_UNIQUE
  const next = Math.min(max, accessoryCount(fashionCase, accessory) + amount)
  return setCount(fashionCase, accessory, next)
}

/** 뺀다 (`FashionCase_RemoveAccessory`). 0 밑으로는 안 내려간다 */
export function removeAccessory(
  fashionCase: FashionCase, accessory: number, amount: number,
): FashionCase {
  if (!Number.isInteger(accessory) || accessory < 0 || accessory >= ACCESSORY_COUNT) {
    return fashionCase
  }
  return setCount(fashionCase, accessory, Math.max(0, accessoryCount(fashionCase, accessory) - amount))
}

/** 다 합쳐 몇 개인가 (`FashionCase_GetTotalAccessories`) */
export function totalAccessories(fashionCase: FashionCase): number {
  let sum = 0
  for (let i = 0; i < ACCESSORY_COUNT; i++) sum += accessoryCount(fashionCase, i)
  return sum
}

function setCount(fashionCase: FashionCase, accessory: number, count: number): FashionCase {
  if (canHaveMultiple(accessory)) {
    const at = Math.floor(accessory / 8)
    const shift = (accessory % 8) * 4
    const nonUnique = [...fashionCase.nonUnique]
    // ⚠️ `>>> 0`으로 부호를 지운다 — 자바스크립트의 비트 연산이 부호 있는 32비트라
    // 맨 위 칸을 세우면 음수가 되고, 그대로 리포트에 담기면 스키마가 걷어찬다
    nonUnique[at] = (((nonUnique[at] ?? 0) & ~(0xf << shift)) | (count << shift)) >>> 0
    return { ...fashionCase, nonUnique }
  }
  const idx = accessory - NON_UNIQUE_ACCESSORY_COUNT
  const at = Math.floor(idx / 32)
  const shift = idx % 32
  const unique = [...fashionCase.unique]
  unique[at] = (((unique[at] ?? 0) & ~(0x1 << shift)) | (count << shift)) >>> 0
  return { ...fashionCase, unique }
}
