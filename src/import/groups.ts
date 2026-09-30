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

export function groupSpec(name: string): GroupSpec | undefined {
  return ALL_GROUPS.find((g) => g.name === name)
}
