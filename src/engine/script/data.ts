// 스크립트 데이터 (DATA.md §2.10) — 바이트코드와 진입점 찾기.
//
// 맵 이벤트가 들고 있는 `script` 번호 하나로 **어느 파일의 몇 번째 진입점인지**가
// 정해진다. 규칙은 `script_manager.c`의 `ScriptContext_LoadAndOffsetID` 그대로다:
//
//   2000 이상   공용 구역 30개. **큰 값부터** 내려오며 처음 걸리는 곳
//   1 이상      지금 맵의 스크립트 파일, 진입점 = 번호 − 1
//   0           아무 일도 안 하는 자리표시자 파일
//
// "큰 값부터"가 중요하다. 경계가 2000·2500·2800…처럼 촘촘해서 작은 것부터 보면
// 3000번이 2000번 구역에 걸린다.
import { scriptFileSchema, type ScriptFile } from '../../data/schema'

export interface ScriptData {
  readonly meta: ScriptFile
  readonly bytes: Uint8Array
}

/** 아무 일도 안 하는 자리표시자. scriptID 0이 여기로 온다 */
const IDLE_FILE = 'scripts_unk_0402'

interface Resolved {
  /** `scripts.json`의 파일 번호 */
  file: number
  /** 그 파일의 몇 번째 진입점인가 */
  entry: number
  /** 글 뱅크 이름. 맵 스크립트면 null이고 맵 헤더의 `msg`를 써야 한다 */
  bank: string | null
  /**
   * 글 뱅크의 **미국 번호**. 맵 스크립트면 null이다.
   *
   * ⚠️ 공용 스크립트는 스크립트 파일과 글 뱅크를 **같이** 갈아 끼운다
   * (`ScriptContext_Load`). 공용 스크립트 안의 `Message 3`은 맵의 3번이 아니라
   * 이 뱅크의 3번이다 — 안 갈면 엉뚱한 문장이 나오는데 글자는 나오므로
   * 눈으로는 "번역이 이상한가" 싶은 채로 넘어간다
   */
  msg: number | null
}

/**
 * scriptID를 (파일, 진입점)으로.
 *
 * @param mapFile 지금 맵의 스크립트 파일 번호 (맵 헤더의 `scripts`)
 */
export function resolveScript(meta: ScriptFile, id: number, mapFile: number): Resolved | null {
  for (const range of meta.ranges) {
    if (id < range.from) continue
    if (range.file === null) return null
    return { file: range.file, entry: id - range.from, bank: range.bank, msg: range.msg }
  }
  if (id >= 1) return { file: mapFile, entry: id - 1, bank: null, msg: null }
  const idle = meta.files.findIndex((f) => f.name === IDLE_FILE)
  return idle < 0 ? null : { file: idle, entry: 0, bank: null, msg: null }
}

/** `ScriptEntryEnd` — 진입점 표의 끝. 원본이 빠뜨린 파일이 셋 있다 */
const ENTRY_TABLE_END = 0xfd13

/**
 * 진입점의 바이트 주소.
 *
 * 표에는 상대 오프셋이 들어 있고 기준은 **그 필드 바로 뒤**다:
 * `scriptPtr = base + entry * 4; scriptPtr += readWord()`
 */
export function entryOffset(data: ScriptData, file: number, entry: number): number {
  const info = data.meta.files[file]
  if (!info) throw new Error(`스크립트 파일 #${file}이 없다`)
  if (entry < 0 || entry >= info.entries) {
    throw new Error(`${info.name}: 진입점 ${entry}가 없다 (${info.entries}개)`)
  }
  const view = new DataView(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength)
  const at = entry * 4
  return at + 4 + view.getInt32(info.at + at, true)
}

/** 파일 하나의 바이트만 잘라 준다 — VM은 파일 안 주소로만 움직인다 */
export function fileBytes(data: ScriptData, file: number): Uint8Array {
  const info = data.meta.files[file]
  if (!info) throw new Error(`스크립트 파일 #${file}이 없다`)
  return data.bytes.subarray(info.at, info.at + info.size)
}

/**
 * 파일의 진입점 개수를 바이트에서 다시 센다.
 *
 * 추출기가 센 것과 맞는지 보는 용도다. 끝 표시에 기대지 않고 **가장 앞선
 * 목적지**를 표의 끝으로 본다 — 원본이 `ScriptEntryEnd`를 빠뜨린 파일이 셋 있다.
 */
export function countEntries(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let limit = bytes.byteLength
  let count = 0
  for (let at = 0; at + 4 <= limit; at += 4) {
    if (view.getUint16(at, true) === ENTRY_TABLE_END) break
    limit = Math.min(limit, at + 4 + view.getInt32(at, true))
    count++
  }
  return count
}

export function parseScriptMeta(raw: unknown): ScriptFile {
  return scriptFileSchema.parse(raw)
}
