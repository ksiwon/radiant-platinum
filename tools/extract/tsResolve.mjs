// 확장자 없는 상대 import에 `.ts`를 붙여 주는 해석 훅.
//
// `node --experimental-strip-types`는 타입만 벗기고 **경로는 안 고쳐 준다**.
// 브라우저 변환기(`src/import/**`)를 노드 추출기에서 그대로 부르려면
// (「굽는 쪽이 둘이다」) 그 안의 `import ... from './nds'`가 풀려야 한다.
//
//     node --experimental-strip-types --import ./tools/extract/tsResolve.mjs <스크립트>
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(new URL('./tsResolveHook.mjs', import.meta.url).href, pathToFileURL('./'))
