// 스크립트 실행을 **엿보는 자리** — 개발 빌드 전용 훅 (`app/devScriptLog`).
//
// 배포본에서는 이 객체가 늘 비어 있다. 부르는 쪽이 전부 `scriptSpy.x?.(…)` 한 줄이라
// 비용은 널 검사 하나뿐이고, 채우는 쪽(`devScriptLog`)은 `import.meta.env.DEV` 뒤의
// 동적 import라 배포 청크에 안 실린다.
//
// ⚠️ **이 모듈은 아무것도 import 하지 않는다.** 명령 표 · 문맥 · 세계가 전부 이것을
// 불러야 해서, 무언가를 끌어오면 그 순환이 첫 청크에 번진다.

/** 스크립트 한 판의 시작 */
interface SpyStart {
  /** 맵 이벤트가 들고 있던 번호 (공용 구역이면 2000 이상) */
  script: number
  file: number
  entry: number
  /** 말을 건 상대 (`VAR_LAST_TALKED`). 0이면 없다 */
  local: number
  /**
   * 어떤 판인가. 비면 `start`가 건 보통 판이다.
   *   `init`  한 프레임에 끝나는 맵 초기화 (`runFixedInit`) — 시작과 끝을 둘 다 부른다
   *   `call`  `CallCommonScript`가 부른 공용 스크립트 — 시작만 부른다(부모 판 안에 있다)
   */
  kind?: 'init' | 'call'
}

interface ScriptSpy {
  start?: (info: SpyStart) => void
  /** 판이 끝났다 (`finish`) — 정상 종료와 오류 종료 둘 다. 초기화 판은 `kind: 'init'`로 부른다 */
  end?: (kind?: 'init') => void
  /** `noteScriptError` — 터진 스크립트 */
  error?: (message: string, where: string) => void
  /** 구현이 없어 건너뛴 명령 (`skipper`). `at`은 그 명령 **다음** 바이트 */
  unimplemented?: (name: string, file: number, at: number | null) => void
  /** 대사창에 글이 올라갔다. `text`가 비면 뱅크에 그 번호가 없거나 빈 글이다 */
  message?: (id: number, text: string, bankSize: number) => void
  /** 명령 하나를 읽었다 (opcode · 그 명령 바이트 주소 · 파일). 멈춘 자리를 찾는 데 쓴다 */
  opcode?: (opcode: number, file: number, at: number) => void
}

export const scriptSpy: ScriptSpy = {}
