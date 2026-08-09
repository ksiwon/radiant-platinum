// 휴대용 리포트 `.rpsave` — 봉투 (PLAN §9.3 · IMPORT.md §10~11)
//
// 브라우저 저장소는 사용자가 모르는 사이에 비워진다. 저장 공간 압박, 사이트
// 데이터 삭제, 시크릿 창, 프로필 이전 — 어느 것도 우리가 막을 수 없다. 그래서
// **리포트를 쓸 때마다 파일도 한 벌 내보낸다** (IMPORT.md §10).
//
// 봉투에 담는 것과 안 담는 것이 갈린다:
//
//   담는다   형식·세이브 판, 만든 시각, 콘텐츠 계약, 표시용 요약, 체크섬, payload
//   안 담는다 원본 에셋 바이트, 원본 파일명, 로컬 경로, ROM 전체 해시
//
// 마지막 줄이 정책이다 (COPYRIGHT.md §7). 호환 판정에 필요한 것은 "어느 지역판을
// 깔았는가"뿐이고 "어떤 파일에서 깔았는가"는 필요 없다.
import { CODEC, checksum, decodePayload, encodePayload } from './codec'
import {
  APP_BUILD, CONTENT_SCHEMA, MIN_COMPATIBLE_BUILD, contentContract,
  type ContentContract,
} from './contract'
import type { SaveData } from '../saveStore'

export const PORTABLE_MAGIC = 'RADIANT_PLATINUM_SAVE'
/** 봉투 자체의 판. `saveVersion`(세이브 내용의 판)과 다른 축이다 */
export const PORTABLE_FORMAT = 1
export const PORTABLE_EXT = '.rpsave'

/**
 * 파일 크기 상한 (IMPORT.md §11-2).
 *
 * ⚠️ **없으면 안 된다.** 사용자가 고른 파일을 통째로 문자열로 읽는데, 상한이
 * 없으면 잘못 고른 4GB 파일 하나가 탭을 죽인다. 실측으로 박스를 가득 채운
 * 세이브(540마리)가 200KB 언저리라 8MB면 40배 여유다
 */
export const MAX_PORTABLE_BYTES = 8 * 1024 * 1024

export interface PortableSave {
  magic: typeof PORTABLE_MAGIC
  formatVersion: number
  saveVersion: number
  createdAt: string
  buildCompatibility: { min: string; max?: string }
  contentContract: ContentContract
  /** 열기 전에 보여 줄 것. 여기 값으로 게임을 굴리지 않는다 */
  summary: { trainer: string; playtimeMs: number; build: string }
  codec: string
  checksum: string
  payload: string
}

export function buildPortable(save: SaveData, at: Date): PortableSave {
  const payload = encodePayload(save)
  return {
    magic: PORTABLE_MAGIC,
    formatVersion: PORTABLE_FORMAT,
    saveVersion: save.version,
    createdAt: at.toISOString(),
    buildCompatibility: { min: MIN_COMPATIBLE_BUILD },
    contentContract: contentContract(),
    summary: {
      trainer: save.trainer.name,
      playtimeMs: save.trainer.playtimeMs,
      build: APP_BUILD,
    },
    codec: CODEC,
    checksum: checksum(payload),
    payload,
  }
}

/**
 * 읽을 수 없는 파일을 **버리지 않고** 내보내기 위한 봉투.
 *
 * IndexedDB에 이 판이 못 읽는 리포트가 남아 있을 수 있다(더 새 판이 썼거나,
 * 옮길 길이 없는 옛 판이거나). 그걸 조용히 "없는 리포트"로 두면 사용자는 사라진
 * 줄 안다 — 원본을 그대로 파일로 돌려준다 (IMPORT.md §11 끝)
 */
export function buildPortableRaw(raw: unknown, saveVersion: number, at: Date): PortableSave {
  const payload = encodePayload(raw)
  return {
    magic: PORTABLE_MAGIC,
    formatVersion: PORTABLE_FORMAT,
    saveVersion,
    createdAt: at.toISOString(),
    buildCompatibility: { min: MIN_COMPATIBLE_BUILD },
    contentContract: contentContract(),
    summary: { trainer: '', playtimeMs: 0, build: APP_BUILD },
    codec: CODEC,
    checksum: checksum(payload),
    payload,
  }
}

export function serializePortable(env: PortableSave): string {
  return JSON.stringify(env, null, 1)
}

export type ParseFailure =
  | { kind: 'too-big'; bytes: number; limit: number }
  | { kind: 'not-json' }
  | { kind: 'not-ours' }
  | { kind: 'format-too-new'; found: number; expected: number }
  | { kind: 'unknown-codec'; found: string }
  | { kind: 'checksum'; expected: string; found: string }
  | { kind: 'payload' }

export type ParseResult =
  | { ok: true; envelope: PortableSave; data: unknown }
  | { ok: false; fail: ParseFailure }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * 봉투를 연다. **여기서는 세이브 스키마를 안 본다** — 그건 migration 뒤 일이다.
 *
 * 순서가 규칙이다 (IMPORT.md §11): 크기 → magic·봉투 → 체크섬 → payload.
 * 체크섬을 payload 해석 **전에** 보는 것이 핵심이다. 뒤집으면 손상된 바이트를
 * `JSON.parse`가 먼저 만나서, 왜 실패했는지 알 수 없는 오류가 나온다
 */
export function parsePortable(text: string): ParseResult {
  // 문자열 길이가 아니라 UTF-8 바이트로 잰다 — 한글 이름이 든 파일은 길이가
  // 바이트 수의 3분의 1이라 상한이 세 배로 헐거워진다
  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes > MAX_PORTABLE_BYTES) {
    return { ok: false, fail: { kind: 'too-big', bytes, limit: MAX_PORTABLE_BYTES } }
  }

  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, fail: { kind: 'not-json' } } }
  if (!isRecord(raw) || raw.magic !== PORTABLE_MAGIC || typeof raw.payload !== 'string') {
    return { ok: false, fail: { kind: 'not-ours' } }
  }

  const format = typeof raw.formatVersion === 'number' ? raw.formatVersion : 0
  if (format > PORTABLE_FORMAT) {
    return { ok: false, fail: { kind: 'format-too-new', found: format, expected: PORTABLE_FORMAT } }
  }
  if (raw.codec !== CODEC) {
    return { ok: false, fail: { kind: 'unknown-codec', found: String(raw.codec) } }
  }

  const found = checksum(raw.payload)
  if (found !== raw.checksum) {
    return { ok: false, fail: { kind: 'checksum', expected: String(raw.checksum), found } }
  }

  let data: unknown
  try { data = decodePayload(raw.payload) } catch { return { ok: false, fail: { kind: 'payload' } } }

  return {
    ok: true,
    envelope: {
      magic: PORTABLE_MAGIC,
      formatVersion: format,
      saveVersion: typeof raw.saveVersion === 'number' ? raw.saveVersion : 0,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
      buildCompatibility: isRecord(raw.buildCompatibility)
        ? { min: String(raw.buildCompatibility.min ?? MIN_COMPATIBLE_BUILD) }
        : { min: MIN_COMPATIBLE_BUILD },
      contentContract: isRecord(raw.contentContract)
        ? {
            platinumLocale: String(raw.contentContract.platinumLocale ?? 'dev'),
            schema: Number(raw.contentContract.schema ?? CONTENT_SCHEMA),
          }
        : { platinumLocale: 'dev', schema: CONTENT_SCHEMA },
      summary: isRecord(raw.summary)
        ? {
            trainer: String(raw.summary.trainer ?? ''),
            playtimeMs: Number(raw.summary.playtimeMs ?? 0),
            build: String(raw.summary.build ?? ''),
          }
        : { trainer: '', playtimeMs: 0, build: '' },
      codec: CODEC,
      checksum: found,
      payload: raw.payload,
    },
    data,
  }
}

/** 사람이 읽을 실패 이유 */
export function explainFailure(fail: ParseFailure): string {
  switch (fail.kind) {
    case 'too-big':
      return `파일이 너무 큽니다 (${mb(fail.bytes)} · 상한 ${mb(fail.limit)})`
    case 'not-json':
    case 'not-ours':
      return '이 게임의 리포트 파일이 아닙니다'
    case 'format-too-new':
      return '더 새로운 판이 만든 파일입니다. 그 판에서 열어 주세요'
    case 'unknown-codec':
      return `모르는 형식입니다 (${fail.found})`
    case 'checksum':
      return '파일이 손상됐습니다. 원본을 그대로 보관해 주세요'
    case 'payload':
      return '내용을 읽을 수 없습니다. 원본을 그대로 보관해 주세요'
  }
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`
