// 지난번에 고른 자리를 기억한다 (IMPORT.md §8)
//
// ⚠️ **한 번 고른 것을 다시 고르라고 묻지 않는다.** 변환기를 고쳐 같은 원본에서
// 다른 바이트가 나오게 되면 그 그룹만 다시 굽는데(`assetFormat`), 그때마다
// 사용자에게 롬 파일과 BDSP 폴더를 **처음부터 다시 고르게** 했다. 고르는 일은
// 소유를 확인하는 절차지 매번 되풀이할 일이 아니다.
//
// ⚠️ **파일을 복사해 두는 것이 아니다.** 롬은 134MB고 BDSP 폴더는 수 GB다.
// 여기 담는 것은 **손잡이**(`FileSystemHandle`)뿐이라 크기가 사실상 0이고,
// 바이트는 여전히 사용자 디스크에만 있다 — 우리가 쥐는 것은 "어디였는가"다.
//
// ⚠️ **권한은 같이 안 따라온다.** 손잡이는 남아도 읽기 권한은 탭을 닫으면
// 풀린다. 다시 쓰려면 `regrant()`로 한 번 물어야 하고 그것은 **사용자 제스처
// 안**이어야 한다 — 그래서 이 모듈은 묻지 않고, 묻는 자리는 화면이 정한다.
//
// ⚠️ **structured clone으로 그대로 들어간다.** JSON으로 바꾸면 손잡이가 빈
// 객체가 된다. IndexedDB라야 원형이 남는다 (`state/report.ts`와 같은 이유다)
import { get, set, del, createStore } from 'idb-keyval'
import { SOURCES_DB } from '../../state/storageNames'

const store = createStore(SOURCES_DB, 'handles')

const ROM = 'platinum'
const BDSP = 'bdsp'

export async function rememberRom(handle: FileSystemFileHandle): Promise<void> {
  try { await set(ROM, handle, store) } catch { /* 못 적어도 설치는 된다 */ }
}

export async function rememberBdsp(handle: FileSystemDirectoryHandle): Promise<void> {
  try { await set(BDSP, handle, store) } catch { /* 위와 같다 */ }
}

export interface RememberedSources {
  rom: FileSystemFileHandle | null
  bdsp: FileSystemDirectoryHandle | null
}

export async function recallSources(): Promise<RememberedSources> {
  try {
    const [rom, bdsp] = await Promise.all([
      get<FileSystemFileHandle>(ROM, store),
      get<FileSystemDirectoryHandle>(BDSP, store),
    ])
    return { rom: rom ?? null, bdsp: bdsp ?? null }
  } catch {
    return { rom: null, bdsp: null }
  }
}

export async function forgetSources(): Promise<void> {
  try { await Promise.all([del(ROM, store), del(BDSP, store)]) } catch { /* 지울 것이 없다 */ }
}

/**
 * 손잡이에 붙은 권한 관련 부분. 표준에 있지만 타입에는 아직 없다.
 *
 * ⚠️ **`as any`로 넘기지 않는다.** 여기 적어 두면 무엇을 가정하고 있는지가
 * 남고, 브라우저가 이 자리를 안 주면 아래에서 `undefined`로 갈린다
 */
interface Permissioned {
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

/** 지금 읽을 수 있는가. 물어보지 않는다 */
async function readable(handle: FileSystemHandle): Promise<PermissionState> {
  const api = (handle as unknown as Permissioned).queryPermission
  if (!api) return 'prompt'
  try { return await api.call(handle, { mode: 'read' }) } catch { return 'prompt' }
}

/**
 * 읽기 권한을 청한다. **반드시 사용자 제스처 안에서 부른다** — 밖에서 부르면
 * 브라우저가 묻지도 않고 거절한다
 */
export async function regrant(handle: FileSystemHandle): Promise<boolean> {
  if (await readable(handle) === 'granted') return true
  const api = (handle as unknown as Permissioned).requestPermission
  if (!api) return false
  try { return await api.call(handle, { mode: 'read' }) === 'granted' } catch { return false }
}
