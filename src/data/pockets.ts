// 주머니 칸 수 하나 (DATA.md §2.12)
//
// ⚠️ **왜 파일이 따로인가.** 이 수는 `schema.ts`의 zod 스키마가 상한으로 쓰고
// `bag.ts`가 주머니 배열을 만들 때도 쓴다. 같은 파일에 두면 **상수 하나 때문에
// 부팅 그래프가 zod를 통째로 끌어온다** — 타이틀 → 세이브 스토어 → 가방이
// 그 길이었고, 첫 화면 예산에서 gzip 19.4kB다 (실측, DEPLOY.md §2)

/** 주머니 8칸. 순서가 곧 번호다 (POCKET_ITEMS 0 … POCKET_KEY_ITEMS 7) */
export const POCKET_COUNT = 8
