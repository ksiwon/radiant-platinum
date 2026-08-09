// 부팅 — 어느 Provider로 시작하는가 (IMPORT.md §7 · §8 · §13-3)
//
// ⚠️ **한때 이 결정을 아무도 안 내렸다.** `main.tsx`가 곧바로 `<App />`을
// 그렸고, `assets()`는 Provider가 없으면 `httpAssetProvider()`를 만들었다.
// 그래서 공개 빌드는 설치를 끝내고 다시 켜도 OPFS를 안 읽고, 있지도 않은
// `/data`·`/models`로 요청을 보냈다. `installReady()`·`opfsAssetProvider()`·
// `setAssetProvider()`·`setContentContract()`를 부르는 코드가 **프로덕션에
// 한 줄도 없었다.**
//
// 갈래는 셋이다:
//
//   개발            지금 그대로 `public/data`·`public/models`를 HTTP로
//   공개 + 설치됨    OPFS를 읽는다. 콘텐츠 계약과 언어 목록도 여기서 정해진다
//   공개 + 아님      **HTTP로 안 되돌아간다.** 앱 셸만으로 된 설치 화면을 그린다
//
// 셋째가 중요하다. 되돌아가면 404가 무더기로 나가고, 그 404 목록이 곧 우리가
// 무엇을 굽는지 적은 목록이라 서버 로그에 남는다.
import { setAssetProvider } from '../data/providers/assetProvider'
import { absentAssetProvider } from '../data/providers/absentAssetProvider'
import { httpAssetProvider } from '../data/providers/httpAssetProvider'
import { opfsAssetProvider } from '../data/providers/opfsAssetProvider'
import {
  opfsAvailable, opfsPackStore, OPFS_ASSETS, OPFS_ROOT,
  type PackStore, type WritablePackStore,
} from '../data/providers/packStore'
import { installReady, readInstall, type InstallManifest } from '../import/install/installer'
import { setContentContract } from '../state/save/contract'
import { setAvailableLocales } from '../state/optionsStore'

/** 왜 설치 화면인가. 화면이 할 말이 갈린다 */
export type InstallReason =
  | 'none'         // 아직 안 했다
  | 'partial'      // 하다 말았다. 이어서 할 수 있다
  | 'invalid'      // 기록이 깨졌다. 다시 설치해야 한다 (리포트는 그대로)
  | 'unsupported'  // 이 브라우저로는 못 한다 (OPFS 없음)

export type BootState =
  | { kind: 'play'; source: 'dev' | 'opfs'; manifest: InstallManifest | null }
  | { kind: 'install'; reason: InstallReason; detail?: string }

export interface BootEnv {
  /** `import.meta.env.DEV`. 시험이 양쪽을 다 돌릴 수 있어야 한다 */
  dev: boolean
  opfs: boolean
  /**
   * 설치 기록이 있는 저장소. 안 주면 OPFS에서 연다.
   *
   * 노드에는 OPFS가 없다 — 여기를 못 바꾸면 부팅 갈래를 한 줄도 못 잰다.
   * 잴 수 없는 결정이 바로 지금까지 아무도 안 내리던 그 결정이었다
   */
  rootStore?: WritablePackStore
  /** 게임이 읽을 저장소. 같은 이유로 갈아 끼울 수 있다 */
  assetStore?: PackStore
}

export function bootEnv(): BootEnv {
  return { dev: import.meta.env.DEV, opfs: opfsAvailable() }
}

/**
 * 무엇으로 시작할지 정하고 **Provider를 실제로 꽂는다.**
 *
 * 정하기만 하고 안 꽂으면 두 군데가 따로 결정하게 된다 — 그게 지금까지의
 * 문제였다
 */
export async function boot(env: BootEnv = bootEnv()): Promise<BootState> {
  if (env.dev) {
    // 개발판은 기존 raw 산출물을 그대로 쓴다 (COPYRIGHT.md §5). 이 동작을
    // 보존하는 것이 전환의 첫 조건이다
    setAssetProvider(httpAssetProvider())
    return { kind: 'play', source: 'dev', manifest: null }
  }

  if (!env.opfs) {
    setAssetProvider(absentAssetProvider('이 브라우저는 OPFS를 지원하지 않습니다'))
    return { kind: 'install', reason: 'unsupported' }
  }

  const root = env.rootStore ?? opfsPackStore(OPFS_ROOT)
  const manifest = await installReady(root)
  if (!manifest) {
    // ⚠️ **HTTP로 안 되돌아간다.** 왜 설치 화면인지만 정해서 넘긴다
    setAssetProvider(absentAssetProvider())
    const got = await readInstall(root)
    if (got.kind === 'invalid') return { kind: 'install', reason: 'invalid', detail: got.why }
    if (got.kind === 'none') return { kind: 'install', reason: 'none' }
    return { kind: 'install', reason: 'partial', detail: `상태: ${got.value.state}` }
  }

  activateInstall(manifest, env.assetStore)
  return { kind: 'play', source: 'opfs', manifest }
}

/**
 * 설치본을 쓰기 시작한다.
 *
 * 설치가 막 끝난 직후에도 부른다 — **다시 켜지 않고** 그 자리에서 갈아 끼운다.
 * `setAssetProvider`가 옛 Provider의 캐시와 Blob URL을 먼저 정리한다
 */
export function activateInstall(manifest: InstallManifest, store?: PackStore): void {
  setAssetProvider(opfsAssetProvider(store ?? opfsPackStore(`${OPFS_ROOT}/${OPFS_ASSETS}`)))
  setContentContract({ platinumLocale: manifest.platinumLocale, schema: manifest.contractVersion })
  // ⚠️ 설치된 언어만 준다. 개발판에 세 벌이 있다고 세 언어를 주지 않는다
  setAvailableLocales(manifest.availableLocales)
}
