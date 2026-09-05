// 옮겨진 변환기 전부 (IMPORT.md §6 · §13-5)
//
// 원천이 둘이라 표도 둘이다 — Platinum 롬(`platinum/convert`)과 BDSP 폴더
// (`bdsp/convert`). 설치기와 Worker와 화면은 **한 목록**을 봐야 한다: 갈라 두면
// Worker가 아는 그룹과 설치기가 도는 그룹이 어긋나고, 그때 사용자에게는
// "그런 그룹이 없습니다"만 보인다.
//
// ⚠️ **`boot.ts`가 이 파일을 읽으면 안 된다.** 여기에는 변환기 열몇 벌이 달려
// 오고 그것이 전부 첫 화면 청크가 된다 (`install/installer.ts` 머리말). 필수
// 그룹 **이름**만 필요한 자리는 `install/required.ts`를 본다
import { GROUPS } from './platinum/convert'
import { BDSP_GROUPS } from './bdsp/convert'
import type { GroupSpec } from './platinum/convertTypes'

export const ALL_GROUPS: readonly GroupSpec[] = [...GROUPS, ...BDSP_GROUPS]

export function groupsReady(): readonly GroupSpec[] {
  return ALL_GROUPS.filter((g) => g.convert !== undefined)
}

export function groupsBlocked(): readonly GroupSpec[] {
  return ALL_GROUPS.filter((g) => g.convert === undefined)
}

/**
 * 사용자가 켜야 굽는 그룹들.
 *
 * ⚠️ **`groupsReady()`에 그냥 두면 안 된다.** 그러면 설치기가 말없이 굽고
 * 설치 총량이 늘어난다 — 무거운 그룹은 물어보고 굽는다
 */
export function groupsOptional(): readonly GroupSpec[] {
  return ALL_GROUPS.filter((g) => g.convert !== undefined && g.optional !== undefined)
}

/** 이번 설치에서 실제로 돌릴 목록. `extras`에 든 선택 그룹만 함께 간다 */
export function groupsToInstall(extras: readonly string[] = []): readonly GroupSpec[] {
  const want = new Set(extras)
  return ALL_GROUPS.filter((g) => g.optional === undefined || want.has(g.name))
}

export function groupSpec(name: string): GroupSpec | undefined {
  return ALL_GROUPS.find((g) => g.name === name)
}
