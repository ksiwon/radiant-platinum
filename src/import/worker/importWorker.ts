// Import Worker의 진입점 (IMPORT.md §6)
//
// 하는 일은 `self`를 `createImportWorker`에 넘기는 것뿐이다. 얇게 두는 이유는
// **이 파일만 스레드에 묶여 있기 때문**이다 — 로직이 여기 있으면 시험에서
// 한 줄도 못 돌린다. `handler.ts`는 `MessagePort`로도 같은 코드가 돈다.
import { createImportWorker } from './handler'

createImportWorker(self as unknown as Parameters<typeof createImportWorker>[0])
