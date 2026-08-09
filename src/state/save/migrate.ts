// 세이브 버전 이전 (PLAN §9.3 · IMPORT.md §11-5)
//
// 지금까지는 `data.version !== SAVE_VERSION`이면 **없는 리포트로 쳤다.** 화면에는
// "리포트가 없다"로만 보이므로, 앱을 한 번 올린 것뿐인데 진행이 사라진 것처럼
// 느껴진다. 그 조용한 실패를 셋으로 가른다:
//
//   · 옮길 수 있다      → 한 단계씩 올린다
//   · 이 판보다 최신이다 → 손대지 않고 "더 새 판에서 쓰라"고 말한다
//   · 못 옮긴다         → 손대지 않고 **원본 파일을 돌려준다**
//
// ⚠️ **없는 과거를 지어내지 않는다.** `SAVE_VERSION`은 7이고 여태 한 번도 안
// 올랐다 — 1~6으로 저장된 리포트는 세상에 없다. 그래서 표가 비어 있다. 표가
// 비었다고 장치가 없는 것은 아니다: 8이 되는 날 `MIGRATIONS[7]`을 적으면 되고,
// 그 자리가 도는지는 시험이 가짜 표로 이미 확인한다.
import { safeParseSave } from './schema'
import type { SaveData } from '../saveStore'

/** n에서 n+1로만 옮긴다. 두 칸을 한 번에 건너뛰는 함수는 두지 않는다 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

/** 이 표로 닿을 수 있는 가장 낮은 버전 */
export function oldestSupported(target: number, table = MIGRATIONS): number {
  let v = target
  while (table[v - 1]) v--
  return v
}

export type MigrateResult =
  | { kind: 'ok'; save: SaveData; from: number; migrated: boolean }
  | { kind: 'too-new'; found: number; expected: number }
  | { kind: 'unsupported-old'; found: number; oldest: number }
  | { kind: 'invalid'; why: string; found: number | null }

function versionOf(value: unknown): number | null {
  if (value === null || typeof value !== 'object') return null
  const v = (value as { version?: unknown }).version
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

/**
 * 어떤 버전의 세이브 모양이든 지금 판으로 올린다.
 *
 * 마지막에 **반드시 스키마를 다시 통과**해야 한다 — 이전 함수가 한 칸을
 * 빠뜨려도 여기서 걸린다. 이전 함수 자체를 믿고 넘기면 그 실수가 게임 한복판에서
 * 나온다
 */
export function migrateSave(
  value: unknown,
  target: number,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrateResult {
  const found = versionOf(value)
  if (found === null) return { kind: 'invalid', why: 'version 칸이 없다', found: null }
  if (found > target) return { kind: 'too-new', found, expected: target }

  let data = value as Record<string, unknown>
  let at = found
  while (at < target) {
    const step = table[at]
    if (!step) return { kind: 'unsupported-old', found, oldest: oldestSupported(target, table) }
    data = { ...step(data), version: at + 1 }
    at++
  }

  const parsed = safeParseSave(data)
  if (!parsed.ok) return { kind: 'invalid', why: parsed.why, found }
  return { kind: 'ok', save: parsed.save, from: found, migrated: found !== target }
}
