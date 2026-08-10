// 확장자 없는 상대 import를 `.ts`로 이어 준다 (spike 드라이버용).
//
// 앱 코드는 번들러 규칙대로 `./foo`라고 적는데 node ESM은 그걸 못 찾는다.
// vitest를 띄우면 변환에만 100초가 걸려서, 디코더를 재고 고치는 짧은 고리에는
// 못 쓴다. 이 훅으로 같은 소스를 `node --experimental-strip-types`로 바로 돌린다.
//
//     node --import ./tools/spike/tsResolve.mjs --experimental-strip-types <드라이버>
//
// ⚠️ **정상 빌드·시험에는 안 쓴다.** 여기 있는 것은 개발 중 재기 위한 길이고,
// 실제 번들은 vite가, 시험은 vitest가 각자 해석한다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(new URL('./tsResolveHooks.mjs', import.meta.url), pathToFileURL('./'))
