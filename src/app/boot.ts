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
import { verifiedPackStore, type VerifiedStore } from '../data/providers/verifiedPackStore'
import { needsSource, planAssets } from '../import/install/assetFormat'
import { installReady, readInstall, type InstallManifest } from '../import/install/installer'
import { setContentContract } from '../state/save/contract'
import { setAvailableLocales } from '../state/optionsStore'

/** 왜 설치 화면인가. 화면이 할 말이 갈린다 */
export type InstallReason =
  | 'none'         // 아직 안 했다
  | 'partial'      // 하다 말았다. 이어서 할 수 있다
  | 'invalid'      // 기록이 깨졌다. 다시 설치해야 한다 (리포트는 그대로)
  | 'unsupported'  // 이 브라우저로는 못 한다 (OPFS 없음)
  | 'outdated'     // 설치물 모양이 낡았고 **원본 없이는** 못 옮기는 그룹이 있다

export type BootState =
  | { kind: 'play'; source: 'dev' | 'opfs'; manifest: InstallManifest | null }
  | { kind: 'install'; reason: InstallReason; detail?: string }

export interface BootEnv {
  /** `import.meta.env.DEV`. 시험이 양쪽을 다 돌릴 수 있어야 한다 */
  dev: boolean
  opfs: boolean
  /**
   * 개발판인데도 **설치본으로** 열라는 요청 (`?assets=opfs`).
   *
   * ⚠️ **뒷문이 아니다.** 프로덕션에서는 `import.meta.env.DEV`가 `false`라
   * `bootEnv()`가 이 칸을 아예 안 채운다 — 번들에서도 접혀 사라진다. 배포본의
   * 갈래는 그대로 「설치했으면 OPFS, 아니면 설치 화면」이고 그것을 ㉓이 잰다.
   *
   * ⚠️ **이게 없으면 설치본을 확인 지점으로 못 몬다.** 확인 지점은 개발
   * 빌드에만 있는데(`import.meta.env.DEV`) 개발 빌드는 무조건 HTTP를 꽂았다.
   * 그래서 ㉕·㉖이 설치본으로 야생·트레이너·상점까지밖에 못 갔고, 깨어진
   * 세계·도감·타운맵·나무열매·프런티어·크레딧은 **설치본에서 한 번도 안
   * 열려 봤다** (REPAIR §2.3)
   */
  preferOpfs?: boolean
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
  return {
    dev: import.meta.env.DEV,
    opfs: opfsAvailable(),
    // 프로덕션에서는 `import.meta.env.DEV`가 상수 `false`라 이 줄이 통째로 접힌다
    ...(import.meta.env.DEV && typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('assets') === 'opfs'
      ? { preferOpfs: true }
      : {}),
  }
}

/**
 * 무엇으로 시작할지 정하고 **Provider를 실제로 꽂는다.**
 *
 * 정하기만 하고 안 꽂으면 두 군데가 따로 결정하게 된다 — 그게 지금까지의
 * 문제였다
 */
export async function boot(env: BootEnv = bootEnv()): Promise<BootState> {
  return mark(await decide(env))
}

/**
 * 어느 갈래로 떴는지를 문서에 적어 둔다 — `<html data-boot="play:opfs">`.
 *
 * ⚠️ **시험용 뒷문이 아니다.** 아무것도 바꾸지 않고 이미 내린 결정을 밖에서
 * 읽을 수 있게만 한다. 이게 없으면 "설치본을 읽고 떴는가"를 화면 글자로
 * 짐작해야 하는데, 그건 갈래가 아니라 렌더 결과를 재는 것이다. 지원 문의에도
 * 같은 값이 필요하다 — 사용자가 개발자 도구를 열어 한 줄만 읽으면 된다
 */
function mark(state: BootState): BootState {
  const tag = state.kind === 'play' ? `play:${state.source}` : `install:${state.reason}`
  if (typeof document !== 'undefined') document.documentElement.dataset.boot = tag
  return state
}

async function decide(env: BootEnv): Promise<BootState> {
  if (env.dev && env.preferOpfs !== true) {
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
    // 기록은 멀쩡한데 산출물 모양이 낡아서 원본이 필요한 경우를 따로 말한다 —
    // "하다 말았다"와 "다시 만들어야 한다"는 사용자가 할 일이 다르다
    const stale = planAssets(got.value.groups)
    if (got.value.state === 'ready' && needsSource(stale)) {
      const names = stale.regenerate.map((r) => r.group).join(' · ')
      return { kind: 'install', reason: 'outdated', detail: `다시 만들 그룹: ${names}` }
    }
    return { kind: 'install', reason: 'partial', detail: `상태: ${got.value.state}` }
  }

  activateInstall(manifest, env.assetStore)
  return { kind: 'play', source: 'opfs', manifest }
}

/**
 * 설치본을 쓰기 시작한다.
 *
 * 설치가 막 끝난 직후에도 부른다 — **다시 켜지 않고** 그 자리에서 갈아 끼운다.
 * `setAssetProvider`가 옛 Provider의 캐시와 Blob URL을 먼저 정리한다.
 *
 * ⚠️ 저장소를 `verifiedPackStore`로 감싼다. 부팅에서 해싱하지 않고 **읽는
 * 파일만 처음 한 번** 본다 — 그 균형이 이 계약의 전부다
 */
export function activateInstall(manifest: InstallManifest, store?: PackStore): void {
  const raw = store ?? opfsPackStore(`${OPFS_ROOT}/${OPFS_ASSETS}`)
  const checked = verifiedPackStore(raw, manifest)
  live = checked
  setAssetProvider(opfsAssetProvider(checked))
  setContentContract({ platinumLocale: manifest.platinumLocale, schema: manifest.contractVersion })
  // ⚠️ 설치된 언어만 준다. 개발판에 세 벌이 있다고 세 언어를 주지 않는다
  setAvailableLocales(manifest.availableLocales)
}

/**
 * 지금 쓰고 있는 검사 저장소. 설정 화면의 "전부 확인"과 타이틀 뒤 idle 검사가
 * 여기로 온다. 개발판(HTTP)에서는 null이다 — 확인할 설치 기록이 없다
 */
let live: VerifiedStore | null = null

export function installedStore(): VerifiedStore | null {
  return live
}
