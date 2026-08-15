// 설치 기록의 모양 (IMPORT.md §8)
//
// ⚠️ **generic cast를 안 쓴다.** 예전에는 `JSON.parse(...) as InstallManifest`였다.
// 그러면 브라우저가 반쯤 쓴 JSON, 옛 판이 남긴 다른 구조, 사용자가 devtools로
// 건드린 값이 전부 **타입이 맞는 척** 통과한다. 그 뒤에 `manifest.groups[x].files`가
// `undefined`라 죽는데, 그때는 파일이 깨진 것인지 구조가 다른 것인지 모른다.
//
// 여기서 걸리면 결론은 하나다 — **다시 설치.** 리포트는 안 건드린다.
import { z } from 'zod'
import { CONTRACT_VERSION } from './installContract'

export { CONTRACT_VERSION }

const FileRecord = z.object({
  path: z.string().min(1),
  bytes: z.int().nonnegative(),
  // 소문자 16진 64자. 길이만 봐도 옛 판의 짧은 해시와 갈린다
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

/**
 * 설치 상태 셋.
 *
 * ⚠️ **`ready`는 "구현된 그룹을 다 돌렸다"가 아니다.** 게임을 시작하는 데
 * 필요한 그룹이 전부 있고, 그 파일들이 실제로 온전할 때만이다. 한때
 * `moves` 하나만 굽고 `ready`를 적었는데, 그 설치로 게임을 켜면 첫 화면부터
 * 종족 표가 없다
 */
export const InstallStateSchema = z.enum(['installing', 'partial', 'ready'])
export type InstallState = z.infer<typeof InstallStateSchema>

export const GroupRecordSchema = z.object({
  files: z.array(FileRecord),
  bytes: z.int().nonnegative(),
  /** 이 그룹을 만든 변환기 판. 올라가면 그 그룹만 다시 만든다 */
  converter: z.int().positive(),
  /**
   * 이 그룹 **산출물**의 모양 판 (`assetFormat.ts`).
   *
   * 옛 기록에는 없다 — 없으면 1로 읽는다. 그룹마다 따로 두는 것이 요점이다:
   * 모델 포맷을 바꿨다고 글 표까지 다시 만들 이유가 없다
   */
  format: z.int().positive().default(1),
})

/**
 * **마지막에 딱 한 번 찍는 도장.** 이게 있어야 설치가 끝난 것이다.
 *
 * ⚠️ 매니페스트와 **같은 쓰기**로 들어간다. 따로 두면 둘이 어긋날 수 있고,
 * 그 순간 "완료됐다는 표식은 있는데 목록은 반쪽"인 상태가 생긴다.
 * `packStore.write`가 임시 이름에 쓰고 길이를 확인한 뒤 제자리로 옮기므로,
 * 이 필드가 보인다는 것은 곧 그 앞의 모든 검증이 끝났다는 뜻이다
 */
export const CommitSchema = z.object({
  at: z.string().min(1),
  /** 도장을 찍은 앱 판·빌드. **호환 판정에 안 쓴다** — 기록용이다 */
  appVersion: z.string().min(1),
  buildId: z.string().min(1),
  /** 이때의 산출물 모양 판. 부팅이 이것부터 본다 */
  assetFormat: z.int().positive(),
})

export type InstallCommit = z.infer<typeof CommitSchema>

export const InstallManifestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  state: InstallStateSchema,
  /** 사용자가 고른 롬의 지역판. 하나다 */
  platinumLocale: z.string().min(1),
  /**
   * 실제로 설치된 언어. **개발판에 세 벌이 있다고 세 언어를 주지 않는다**
   * (IMPORT.md §5). UI 언어 선택지가 이 목록에서 나온다
   */
  availableLocales: z.array(z.string().min(1)).min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1).optional(),
  /** 설치물 전체의 모양 판. 그룹별 판은 `groups[].format`에 따로 있다 */
  assetFormat: z.int().positive().default(1),
  /** `state: 'ready'`일 때만 있다. 없으면 완료가 아니다 */
  commit: CommitSchema.optional(),
  groups: z.record(z.string(), GroupRecordSchema),
})

export type InstallManifest = z.infer<typeof InstallManifestSchema>
export type GroupRecord = z.infer<typeof GroupRecordSchema>

export const InstallJournalSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  /** 끝났다고 적힌 그룹. **적혔다고 믿지 않는다** — 파일을 실제로 읽어 본다 */
  done: z.array(z.string()),
  /** 하다 만 그룹. 재개하면 여기부터 다시 한다 */
  running: z.string().nullable(),
})

export type InstallJournal = z.infer<typeof InstallJournalSchema>

/** 읽기 결과. `invalid`와 `none`을 구별해야 무엇을 안내할지 정할 수 있다 */
export type ReadResult<T> =
  | { kind: 'none' }
  | { kind: 'invalid'; why: string }
  | { kind: 'ok'; value: T }

export function parseManifest(raw: unknown): ReadResult<InstallManifest> {
  const got = InstallManifestSchema.safeParse(raw)
  return got.success
    ? { kind: 'ok', value: got.data }
    : { kind: 'invalid', why: got.error.issues[0]?.message ?? '모양이 다르다' }
}

export function parseJournal(raw: unknown): ReadResult<InstallJournal> {
  const got = InstallJournalSchema.safeParse(raw)
  return got.success
    ? { kind: 'ok', value: got.data }
    : { kind: 'invalid', why: got.error.issues[0]?.message ?? '모양이 다르다' }
}
