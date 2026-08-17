// 이 사이트가 브라우저에 남기는 것들의 **이름** (IMPORT.md §8)
//
// ⚠️ **이름을 두 군데 적지 않는다.** 쓰는 쪽(`report.ts`·`optionsStore.ts`)과
// 지우는 쪽(`import/install/wipe.ts`)이 각자 문자열을 들고 있으면, 이름을 한 번
// 바꾼 날 지우기가 **엉뚱한 창고를 지우고 성공했다고 말한다.** 사용자에게는
// "다 지웠습니다" 뒤에 옛 데이터가 그대로 남는 것으로 보인다.
//
// ⚠️ **딸린 것이 없는 잎이어야 한다.** 지우기는 첫 화면(설치 마법사)에서
// 부르는데, 여기서 `report.ts`를 끌어오면 idb-keyval과 세이브 코덱이 통째로
// 첫 화면 청크에 얹힌다 (DEPLOY.md §2의 예산). 그래서 이 파일에는 import가
// 하나도 없다.
//
// OPFS 뿌리 이름은 `data/providers/packStore.ts`의 `OPFS_ROOT`다 — 거기가
// 그 나무를 만드는 자리라 옮겨 오지 않는다.

/** 리포트가 사는 IndexedDB 이름. 창고 하나(`save`)를 쓴다 */
export const REPORT_DB = 'radiant-platinum'

/**
 * 이름을 바꾸기 전에 쓰던 데이터베이스.
 *
 * 아직 이걸 물고 있는 사람이 있어서 `report.ts`가 처음 읽을 때 한 번 옮긴다.
 * 지우기도 이걸 같이 지워야 "깨끗이"가 참이 된다
 */
export const LEGACY_REPORT_DB = 'pt-3d'

/** 설정이 사는 localStorage 키 */
export const OPTIONS_KEY = 'radiant-platinum.options'

/** 이름을 바꾸기 전 설정 키. 위와 같은 이유로 여기 남는다 */
export const LEGACY_OPTIONS_KEY = 'pt3d.options'
