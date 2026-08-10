// 부활 지점 그룹 — 브라우저에서 (DATA.md §2.3)
//
// ⚠️ **롬에서 뽑는 것이 없다.** 이 표는 원작 소스의 배열이라 파일로도 오버레이로도
// 안 나온다 (`spawnTable.ts` 머리말). 그래서 이 그룹은 굽는 것이 아니라 **적어 둔
// 것을 내보낸다** — 그래도 그룹으로 두는 이유는 설치 기록·무결성·재개가 다른
// 자료와 같은 길로 돌아야 하기 때문이다
import { SPAWN_TABLE } from './spawnTable'
import { json, type ConvertContext, type Produced } from './convertTypes'

export function convertSpawns(ctx: ConvertContext): Promise<Produced> {
  ctx.onProgress?.(1, 1)
  return Promise.resolve(new Map([
    ['data/spawns.json', json({ count: SPAWN_TABLE.length, spawns: SPAWN_TABLE })],
  ]))
}
