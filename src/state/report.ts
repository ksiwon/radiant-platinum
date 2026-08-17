// 리포트 — 세이브 파일 한 벌.
//
// **자동 저장이 아니다.** 원작은 리포트를 쓴 그 순간의 상태만 남기고, 그래서
// 리포트를 안 쓰고 끄면 지난 진행이 사라진다. 그 규칙이 게임의 긴장 절반을
// 만들기 때문에 그대로 둔다 — 그리고 "리포트한 자리에서 다시 시작한다"가
// 성립하려면 저장 시점이 하나여야 한다.
//
// ⚠️ JSON으로 안 바꾼다. 도감·플래그가 `Uint8Array`고 JSON을 거치면 평범한
// 객체가 되어 비트 연산이 조용히 망가진다. IndexedDB의 structured clone은
// TypedArray를 원형 그대로 보존한다. **파일로 나갈 때만** 명시적 코덱을 쓴다
// (`save/codec.ts`).
//
// 쓰는 순서가 규칙이다 (IMPORT.md §10):
//
//   ① 임시 슬롯에 쓴다  ② 다시 읽어 스키마·체크섬을 본다  ③ 그때 현재 슬롯을 바꾼다
//
// ⚠️ **②가 없으면 반쯤 쓰인 리포트가 현재 슬롯이 된다.** 예전에는 `set` 한 번이
// 전부였다 — 그 쓰기가 중간에 죽으면 되돌릴 자리가 없었다.
import { get, set, del, createStore } from 'idb-keyval'
import type { SaveData } from './saveStore'
import { checksum, encodePayload } from './save/codec'
// ⚠️ **스키마와 이주기를 정적으로 안 잡는다.** 둘 다 zod를 끌고 오는데 타이틀이
// 이 파일을 정적으로 닿아서 그대로 첫 화면 예산에 얹힌다 (실측 gzip 19.4kB ·
// DEPLOY.md §2). 읽고 쓰는 자리가 전부 async라 그때 받으면 된다
import type { MigrateResult } from './save/migrate'
import { LEGACY_REPORT_DB, REPORT_DB } from './storageNames'

const dbStore = createStore(REPORT_DB, 'save')
/** 슬롯 하나. 원작도 세이브가 한 벌이다 */
const SLOT = 'report'
/** 검증을 통과하기 전까지 머무는 자리. 여기 남아 있으면 지난번 쓰기가 죽은 것이다 */
const TMP = 'report.tmp'
/** 지우기 직전에 한 벌 옮겨 두는 자리 (IMPORT.md §11-8) */
const BACKUP = 'report.bak'

/**
 * ⚠️ **이름만 바꾸면 이미 저장된 리포트를 못 찾는다.** IndexedDB는 데이터베이스
 * 이름이 곧 주소라, 새 이름으로 열면 빈 창고가 하나 더 생길 뿐이고 옛 리포트는
 * 그대로 남아 영영 안 읽힌다. 그래서 처음 읽을 때 한 번 옮긴다
 */
const OLD_DB = LEGACY_REPORT_DB
let migrated = false

async function migrate(): Promise<void> {
  if (migrated) return
  migrated = true
  try {
    // 새 자리에 이미 있으면 옮길 것이 없다. 덮어쓰면 최신 리포트를 잃는다
    if (await get<SaveData>(SLOT, dbStore) !== undefined) return
    const old = createStore(OLD_DB, 'save')
    const data = await get<SaveData>(SLOT, old)
    if (data === undefined) return
    await set(SLOT, data, dbStore)
    await del(SLOT, old)
  } catch { /* 옛 창고가 없거나 못 열면 옮길 것도 없다 */ }
}

/**
 * 저장된 리포트를 **판정까지 붙여서** 읽는다.
 *
 * ⚠️ 예전에는 판이 안 맞으면 그냥 `null`이었다. 화면에는 "리포트가 없다"로만
 * 보이니, 앱을 한 번 올린 것뿐인데 진행이 사라진 것처럼 느껴진다. 못 읽는 것과
 * 없는 것은 다른 일이고, 못 읽을 때 해야 할 일도 다르다 — **원본을 파일로
 * 돌려주는 것**이다 (IMPORT.md §11 끝)
 */
export type ReportRead =
  | { kind: 'none' }
  | { kind: 'ok'; save: SaveData; migrated: boolean }
  | {
      kind: 'unreadable'
      reason: Exclude<MigrateResult, { kind: 'ok' }>
      /** 손대지 않은 원본. 이대로 파일로 내보낸다 */
      raw: unknown
    }

export async function readReportDetailed(expectVersion: number): Promise<ReportRead> {
  await migrate()
  const data: unknown = await get(SLOT, dbStore)
  if (data === undefined || data === null) return { kind: 'none' }

  const { migrateSave } = await import('./save/migrate')
  const got = migrateSave(data, expectVersion)
  if (got.kind === 'ok') return { kind: 'ok', save: got.save, migrated: got.migrated }
  return { kind: 'unreadable', reason: got, raw: data }
}

/** 리포트를 읽는다. 없거나 못 읽으면 null — 옛 부르는 쪽을 위해 남긴다 */
export async function readReport(expectVersion: number): Promise<SaveData | null> {
  const got = await readReportDetailed(expectVersion)
  return got.kind === 'ok' ? got.save : null
}

export type WriteResult =
  | { ok: true }
  | { ok: false; why: string }

/**
 * 임시 슬롯 → 다시 읽어 검증 → 현재 슬롯 교체.
 *
 * ⚠️ **읽어서 검증하는 것이 핵심이다.** structured clone이 무엇을 잃는지는
 * 써 보기 전에는 모른다 — 프록시가 섞인 객체, 함수가 붙은 값, 다른 realm의
 * TypedArray가 그 자리다. 쓴 것을 도로 읽어 체크섬까지 맞춰 봐야 "썼다"고
 * 말할 수 있다
 */
export async function writeReportVerified(data: SaveData): Promise<WriteResult> {
  // 디스크를 건드리기 전에 먼저 본다. 못 쓸 것을 임시 슬롯에라도 남길 이유가 없다
  const { safeParseSave } = await import('./save/schema')
  const before = safeParseSave(data)
  if (!before.ok) return { ok: false, why: `쓰려는 리포트가 스키마를 어긴다 — ${before.why}` }

  const want = checksum(encodePayload(data))

  try {
    await set(TMP, data, dbStore)
  } catch (e) {
    return { ok: false, why: `임시 슬롯에 못 썼다 — ${message(e)}` }
  }

  const back: unknown = await get(TMP, dbStore)
  const after = safeParseSave(back)
  if (!after.ok) {
    return { ok: false, why: `다시 읽은 리포트가 스키마를 어긴다 — ${after.why}` }
  }
  const found = checksum(encodePayload(after.save))
  if (found !== want) {
    return { ok: false, why: `다시 읽은 리포트가 다르다 (${want} ≠ ${found})` }
  }

  try {
    await set(SLOT, after.save, dbStore)
  } catch (e) {
    return { ok: false, why: `현재 슬롯을 못 바꿨다 — ${message(e)}` }
  }
  // 여기서 실패해도 리포트는 이미 제자리다. 다음 쓰기가 덮는다
  await del(TMP, dbStore).catch(() => undefined)
  return { ok: true }
}

/** 검증 없이 쓴다. 시험과 이사 경로에만 쓴다 */
export function writeReport(data: SaveData): Promise<void> {
  return set(SLOT, data, dbStore)
}

/**
 * 지우기 전에 한 벌 옮겨 둔다 (IMPORT.md §11-8).
 *
 * 파일 다운로드가 최종 보험이지만 브라우저가 막을 수 있다. 그때를 위해 같은
 * 데이터베이스 안에도 한 벌 남긴다 — 사이트 데이터를 통째로 지우면 이것도
 * 같이 사라지므로 **대신**이 아니라 **덤**이다
 */
export async function backupReport(): Promise<boolean> {
  const data: unknown = await get(SLOT, dbStore)
  if (data === undefined || data === null) return false
  await set(BACKUP, data, dbStore)
  return true
}

/** 지우기 직전에 옮겨 둔 것. 없으면 undefined */
export function readBackup(): Promise<unknown> {
  return get(BACKUP, dbStore)
}

export function clearReport(): Promise<void> {
  return del(SLOT, dbStore)
}

/** 이어하기를 띄울지 정하는 데만 쓴다 */
export async function hasReport(expectVersion: number): Promise<boolean> {
  return (await readReport(expectVersion)) !== null
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
