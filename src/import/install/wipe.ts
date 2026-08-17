// 브라우저에 남은 것을 통째로 지운다 (IMPORT.md §8 · §11)
//
// 설치가 반쯤 하다 죽으면 사용자에게 남는 것은 **아무것도 못 하는 상태**다:
// 에셋은 절반, 저널은 "하는 중", 매니페스트는 `partial`. 다시 눌러도 같은
// 자리에서 또 죽으면 그 사람이 할 수 있는 일이 없다 — 브라우저 설정에 들어가
// 사이트 데이터를 지우는 법을 알아야 하고, 그 화면은 브라우저마다 다르다.
// 그래서 그 길을 화면 안에 둔다.
//
// ⚠️ **「에셋 다시 설치」와 다른 단추다.** 그쪽(`clearAssets`)은 에셋과 설치
// 기록만 지우고 **리포트를 남긴다** — 그것이 그 단추의 약속이고 ㉗이 지킨다.
// 이 함수는 반대로 **리포트까지 지운다.** 그래서 부르는 쪽이 반드시 한 번 더
// 물어야 하고, 실패한 뒤에만 보여야 한다.
//
// ⚠️ **하나가 죽어도 나머지를 계속한다.** 지우려는 이유가 대개 "뭔가 깨졌다"라
// OPFS가 안 열려서 IndexedDB를 못 지우는 일이 생기면 안 된다. 못 지운 것은
// 세어서 돌려주고, 부르는 쪽이 그것을 화면에 적는다.
import { OPFS_ROOT } from '../../data/providers/packStore'
import {
  LEGACY_OPTIONS_KEY, LEGACY_REPORT_DB, OPTIONS_KEY, REPORT_DB,
} from '../../state/storageNames'

export interface WipeReport {
  /** OPFS 나무를 지웠는가 (애초에 없었으면 지운 것으로 친다) */
  opfs: boolean
  /** 지운 IndexedDB 이름 */
  databases: string[]
  /** 지운 캐시 이름 */
  caches: string[]
  /** 등록을 푼 서비스 워커 수 */
  workers: number
  /** 지운 localStorage 키 */
  keys: string[]
  /** 못 지운 것. 비어 있지 않으면 화면이 그대로 적는다 */
  failed: string[]
}

/**
 * 데이터베이스 하나를 지운다.
 *
 * ⚠️ **`onblocked`에서 안 멈춘다.** idb-keyval이 연결을 하나 물고 있어서
 * 열려 있는 채로 지우면 `blocked`가 오고 `success`는 그 연결이 닫힐 때까지
 * 안 온다 — 그대로 `await` 하면 화면이 영영 "지우는 중"이다. 지우기 직후에
 * 어차피 새로 고치므로, 막히면 막힌 대로 두고 넘어간다
 */
function deleteDatabase(name: string, waitMs = 3000): Promise<boolean> {
  return new Promise<boolean>((done) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      done(ok)
    }
    const timer = setTimeout(() => { finish(false) }, waitMs)
    const end = (ok: boolean): void => { clearTimeout(timer); finish(ok) }
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => { end(true) }
      req.onerror = () => { end(false) }
      // 막히면 새로 고침 뒤에 마저 지워진다. 여기서 기다리지 않는다
      req.onblocked = () => { end(false) }
    } catch {
      end(false)
    }
  })
}

/**
 * 이 사이트가 남긴 것을 전부 지운다 — **리포트까지.**
 *
 * 지운 뒤에는 부르는 쪽이 화면을 새로 고쳐야 한다. 메모리에는 방금 지운 자리를
 * 가리키는 것들(활성 Provider·열린 핸들)이 그대로 남아 있다
 */
export async function wipeSiteData(): Promise<WipeReport> {
  const out: WipeReport = {
    opfs: false, databases: [], caches: [], workers: 0, keys: [], failed: [],
  }

  // ① OPFS — 에셋·세이브 폴더·저널·매니페스트가 다 이 아래다
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(OPFS_ROOT, { recursive: true })
    out.opfs = true
  } catch (e) {
    // 없어서 못 지운 것과 못 지운 것은 다르다. 없으면 성공으로 친다
    if (e instanceof DOMException && e.name === 'NotFoundError') out.opfs = true
    else out.failed.push(`OPFS(${OPFS_ROOT})`)
  }

  // ② IndexedDB — 리포트. 옛 이름도 같이 지운다
  for (const name of [REPORT_DB, LEGACY_REPORT_DB]) {
    if (await deleteDatabase(name)) out.databases.push(name)
    else out.failed.push(`IndexedDB(${name})`)
  }

  // ③ 캐시와 서비스 워커 — 껍데기가 낡아서 깨진 경우가 여기 걸린다
  try {
    for (const name of await caches.keys()) {
      if (await caches.delete(name)) out.caches.push(name)
    }
  } catch { out.failed.push('캐시') }
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    for (const reg of regs) if (await reg.unregister()) out.workers += 1
  } catch { /* 워커가 없는 자리도 있다 (개발 서버·비보안 오리진) */ }

  // ④ 설정 — 글자 속도·시점처럼 사소하지만 "깨끗이"의 일부다
  try {
    for (const key of [OPTIONS_KEY, LEGACY_OPTIONS_KEY]) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key)
        out.keys.push(key)
      }
    }
  } catch { out.failed.push('설정') }

  return out
}

/** 화면에 적을 한 줄. 무엇을 지웠는지 세어서 말한다 */
export function describeWipe(got: WipeReport): string {
  const parts = [
    got.opfs ? '에셋과 설치 기록' : null,
    got.databases.length > 0 ? `리포트 ${String(got.databases.length)}벌` : null,
    got.caches.length > 0 ? `캐시 ${String(got.caches.length)}개` : null,
    got.workers > 0 ? `워커 ${String(got.workers)}개` : null,
    got.keys.length > 0 ? '설정' : null,
  ].filter((s): s is string => s !== null)
  const done = parts.length > 0 ? `${parts.join(' · ')}을 지웠습니다` : '지울 것이 없었습니다'
  if (got.failed.length === 0) return done
  return `${done}. 못 지운 것: ${got.failed.join(' · ')}`
}
