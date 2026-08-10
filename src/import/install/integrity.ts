// 설치된 파일이 온전한가 (IMPORT.md §8)
//
// ⚠️ **있다는 것과 온전하다는 것은 다르다.** 예전 검증은 `store.list()`로 이름만
// 모아 `Set`으로 물었다. 그러면 쓰다 만 0바이트 파일, 할당량이 차서 잘린 파일,
// 브라우저가 되찾다 만 파일이 전부 "완료"로 지나간다 — 그리고 그 뒤에 게임이
// 그것을 읽고 죽는데, 그때는 무엇이 잘못됐는지 알 수가 없다.
//
// ⚠️ **이 해시는 롬 지문이 아니다.** 브라우저가 자기 기계에서 만든 산출물이
// 자기가 쓴 그대로인지만 본다. 원본을 식별하는 값이 아니고, 어디로도 안 나간다.

/** 브라우저 산출물의 SHA-256 (소문자 16진) */
export async function sha256(bytes: Uint8Array): Promise<string> {
  // ⚠️ 뷰의 `.buffer`를 통째로 넘기면 안 된다 — 여러 파일이 한 버퍼를 나눠 쓰는
  // 날 남의 바이트까지 해싱한다. **뷰를 그대로 넘긴다**: `digest`는 BufferSource를
  // 받고 뷰면 `byteOffset`·`byteLength`만큼만 본다.
  //
  // 한때 여기서 `new Uint8Array(bytes).buffer`로 잘라 넘겼다. 자기 몫만 보는
  // 것은 맞았지만 **전체를 한 벌 더 만든다** — 96MB 파일 하나에 힙이 +97MB
  // 뛰는 것을 브라우저에서 쟀다 (`tools/e2e/run.mjs` ⑭). BDSP 모델 그룹이
  // 붙으면 그 한 벌이 그대로 실패로 이어진다
  //
  // 캐스트는 `SharedArrayBuffer` 하나 때문이다. 우리는 그걸 안 쓴다 —
  // CSP에서 `Cross-Origin-Embedder-Policy`를 안 켠 것이 그 선언이다 (csp.mjs)
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 설치된 파일 하나의 기록 */
export interface FileRecord {
  path: string
  bytes: number
  sha256: string
}

export async function recordOf(path: string, data: Uint8Array): Promise<FileRecord> {
  return { path, bytes: data.byteLength, sha256: await sha256(data) }
}

export type BrokenWhy = 'missing' | 'length' | 'hash'

export interface Broken {
  path: string
  why: BrokenWhy
  /** 무엇이 어긋났는지. 진단 화면이 그대로 보여 준다 */
  detail: string
}

/** 파일 하나를 실제로 읽어 기록과 견준다 */
export async function checkFile(
  read: (path: string) => Promise<Uint8Array | null>,
  record: FileRecord,
): Promise<Broken | null> {
  const got = await read(record.path)
  if (got === null) return { path: record.path, why: 'missing', detail: '없다' }
  if (got.byteLength !== record.bytes) {
    return {
      path: record.path,
      why: 'length',
      detail: `${String(record.bytes)}바이트여야 하는데 ${String(got.byteLength)}바이트다`,
    }
  }
  const hash = await sha256(got)
  if (hash !== record.sha256) {
    return {
      path: record.path,
      why: 'hash',
      detail: `내용이 다르다 (${record.sha256.slice(0, 12)} → ${hash.slice(0, 12)})`,
    }
  }
  return null
}
