// 상점 재고 — ARM9에서 (DATA.md §2.13 · IMPORT.md §6)
//
// ⚠️ **한때 "롬에 없다"고 적혀 있었고 그것이 틀렸다.** 노드 추출기가
// `raw/decomp/include/data/mart_items.h`를 읽고 있어서 롬에 없는 줄 알았는데,
// 표는 ARM9 정적 바이너리 안에 그대로 있다. 셋 다 실측으로 확인했다 —
// `public/data/marts.json`과 일반 19줄·지역 20곳이 **바이트로 같다**.
//
// ARM9은 파일시스템 밖이다. FNT에도 FAT에도 이름이 없어서 헤더의
// `arm9RomOffset`(0x20)·`arm9RamAddress`(0x28)·`arm9Size`(0x2c)로 직접 찾는다.
// 셋 다 실측으로 0x4000 · 0x02000000이었지만 **고정하지 않는다** — 헤더에서 읽는다.
//
// ⚠️ **재고를 코드에도 `supported.json`에도 안 넣는다.** 넣는 것은 자리와
// 개수뿐이다 (비표현적 호환성 메타데이터). 물건 목록 자체는 사용자의 롬에서 나온다.
//
// 표 둘:
//
//   일반 상점 `{ u16 아이템, u16 계단 }` × 19. 뱃지 수로 재고가 늘어난다
//   지역 상점 u32 ARM 포인터 × 20 → 각자 u16 배열, `0xFFFF`에서 끝
import type { NdsFileSystem } from './nds'

/** 일반 상점 줄 수. 롬마다 같다 — 다르면 자리를 잘못 짚은 것이다 */
export const COMMON_ROWS = 19
/** 지역 상점 수 */
export const SPECIALTY_COUNT = 20
/** 배열 끝 표지 */
const END = 0xffff
/**
 * 한 상점이 파는 물건 수의 상한.
 *
 * ⚠️ 종단자를 못 만나면 어딘가를 잘못 짚은 것이다. 상한이 없으면 ARM9 끝까지
 * 훑으며 쓰레기를 재고로 읽는다. 실측 최대가 12개(백화점 1층)라 64면 넉넉하다
 */
const MAX_STOCK = 64

/** 지역별 자리. **ROM 파일 오프셋이 아니라 ARM9 시작 기준 상대다** */
export interface MartLocator {
  /** 일반 상점 표 */
  common: number
  /** 지역 상점 포인터 표 */
  specialty: number
}

export interface MartTable {
  common: { item: number; tier: number }[]
  specialties: number[][]
}

export class MartError extends Error {
  constructor(why: string) { super(`상점 표: ${why}`); this.name = 'MartError' }
}

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0
}

/**
 * 상점 표를 읽는다.
 *
 * `itemCount`는 설치된 아이템 표의 크기다 — 읽어 낸 번호가 그 안에 드는지
 * 본다. 안 주면 그 검사를 건너뛴다 (아이템 그룹보다 먼저 도는 경우)
 */
export async function readMarts(
  fs: NdsFileSystem, at: MartLocator, itemCount?: number,
): Promise<MartTable> {
  // ── 자리 검사 ──────────────────────────────────────────────────────────────
  //
  // 정렬을 먼저 본다. ARM 표는 4바이트 정렬이고, 어긋났다면 자리가 틀린 것이다
  if (at.common % 2 !== 0) throw new MartError(`일반 표 자리가 2바이트 정렬이 아니다 (0x${at.common.toString(16)})`)
  if (at.specialty % 4 !== 0) throw new MartError(`포인터 표 자리가 4바이트 정렬이 아니다 (0x${at.specialty.toString(16)})`)

  // ── 일반 상점 ──────────────────────────────────────────────────────────────
  const commonBytes = await fs.arm9(at.common, COMMON_ROWS * 4)
  if (!commonBytes) throw new MartError(`일반 표가 ARM9 범위 밖이다 (0x${at.common.toString(16)})`)
  const common: MartTable['common'] = []
  for (let i = 0; i < COMMON_ROWS; i++) {
    const item = u16(commonBytes, i * 4)
    const tier = u16(commonBytes, i * 4 + 2)
    if (item === 0 || item === END) throw new MartError(`일반 ${String(i)}번 아이템이 ${String(item)}이다`)
    if (itemCount !== undefined && item >= itemCount) {
      throw new MartError(`일반 ${String(i)}번 아이템 ${String(item)}이 아이템 표(${String(itemCount)}) 밖이다`)
    }
    // 계단은 뱃지 사다리 여섯 단계 안이다 (`ScrCmd_PokeMartCommon`)
    if (tier > 6) throw new MartError(`일반 ${String(i)}번 계단이 ${String(tier)}이다`)
    common.push({ item, tier })
  }

  // ── 지역 상점 ──────────────────────────────────────────────────────────────
  const ptrBytes = await fs.arm9(at.specialty, SPECIALTY_COUNT * 4)
  if (!ptrBytes) throw new MartError(`포인터 표가 ARM9 범위 밖이다 (0x${at.specialty.toString(16)})`)

  const specialties: number[][] = []
  const seen = new Set<number>()
  for (let i = 0; i < SPECIALTY_COUNT; i++) {
    const pointer = u32(ptrBytes, i * 4)
    const start = fs.arm9At(pointer)
    if (start === null) {
      throw new MartError(`${String(i)}번 포인터 0x${pointer.toString(16)}가 ARM9를 안 가리킨다`)
    }
    if (start % 2 !== 0) throw new MartError(`${String(i)}번 배열이 2바이트 정렬이 아니다`)
    // ⚠️ 같은 자리를 두 번 읽는 것 자체는 정상일 수 있지만(두 상점이 같은 재고),
    // 실측으로는 20곳이 전부 다른 자리였다. 겹치면 자리를 잘못 짚은 것이다
    if (seen.has(start)) throw new MartError(`${String(i)}번 배열 자리가 앞과 겹친다`)
    seen.add(start)

    const raw = await fs.arm9(start, (MAX_STOCK + 1) * 2)
      // 배열이 ARM9 끝에 붙어 있으면 상한만큼 못 읽는다. 남은 만큼만 읽어 본다
      ?? await fs.arm9(start, Math.max(2, fs.header.arm9Size - start))
    if (!raw) throw new MartError(`${String(i)}번 배열을 못 읽었다`)

    const list: number[] = []
    let closed = false
    for (let k = 0; k * 2 + 1 < raw.byteLength && k <= MAX_STOCK; k++) {
      const v = u16(raw, k * 2)
      if (v === END) { closed = true; break }
      if (v === 0) throw new MartError(`${String(i)}번 배열 ${String(k)}째가 0이다`)
      if (itemCount !== undefined && v >= itemCount) {
        throw new MartError(`${String(i)}번 아이템 ${String(v)}이 아이템 표(${String(itemCount)}) 밖이다`)
      }
      list.push(v)
    }
    if (!closed) throw new MartError(`${String(i)}번 배열이 ${String(MAX_STOCK)}칸 안에서 안 끝난다`)
    if (list.length === 0) throw new MartError(`${String(i)}번 상점이 비어 있다`)
    specialties.push(list)
  }

  return { common, specialties }
}
