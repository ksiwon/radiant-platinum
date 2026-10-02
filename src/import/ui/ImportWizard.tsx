// Import Wizard (IMPORT.md §4 · §13-9)
//
// ⚠️ **"업로드"라는 말을 쓰지 않는다** (COPYRIGHT.md §2). 파일 선택기는 브라우저가
// 로컬 읽기 권한을 받는 UI지 전송이 아니다. 그 오해가 이 프로젝트의 정책을 통째로
// 잘못 읽게 만든다 — 문구를 "이 기기에서 선택 · 브라우저 안에서 변환 · 서버로
// 전송하지 않음"으로 못 박는다.
//
// ⚠️ **취득·복호화·키 안내를 하지 않는다** (COPYRIGHT.md §4). `AssetAssistant`가
// 준비 안 됐으면 "이미 추출된 지원 폴더가 필요합니다"에서 멈춘다.
//
// ⚠️ **읽기와 변환은 전부 Worker 안에서 돈다** (`worker/client.ts`). 예전에는
// `typeof Worker === 'function'`만 확인하고 메인 스레드에서 직접 돌렸다 —
// 확인만 하고 안 쓰는 것은 확인이 아니다.
//
// ⚠️ **모자란 것이 있으면 첫 화면에 적고, 없으면 안 적는다.** 감추면 설치를 끝내고도
// 게임이 안 뜨는 이유를 아무도 모른다 — 표는 `import/groups.ts`가 임자다. 그러나
// 다 됐을 때 「변환 N개가 전부 옮겨졌습니다 · Worker 변환 · OPFS 설치와 재개」를
// 늘어놓으면 처음 오는 사람이 제일 먼저 읽는 것이 개발 진행 보고가 된다. 그 줄과
// 진단 표는 `import.meta.env.DEV`에서만 그린다.
//
// ⚠️ **화면 글은 사람 말이다.** 그룹은 id가 아니라 이름으로(`groupLabels`), 예외는
// 원문이 아니라 할 일로(`installErrors`) 적는다. 원문·경로·바이트는 버리지 않고
// 접힌 「자세히」·「진단 정보」로 보낸다 — 지원 문의에는 그쪽이 필요하다.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ValidationReport } from '../worker/protocol'
import { spawnImportWorker, WorkerCancelled, type ImportClient } from '../worker/client'
import { explain, STEP_LABEL, SUPPORTED, type Validation } from '../platinum/validate'
import { ALL_GROUPS, groupsBlocked, groupsReady } from '../groups'
import type { BdspScan } from '../bdsp/scan'
import { formatBytes, NEEDED_BYTES, requestPersist, storageState, type StorageState } from '../install/storage'
import {
  clearAssets, readInstall, runInstall,
  type GroupFailure, type InstallEvent, type InstallStores, type Producer,
} from '../install/installer'
import { REQUIRED_BDSP_GROUPS, missingRequired } from '../install/required'
import { groupLabel, groupLabels } from '../install/groupLabels'
import {
  forgetSources, recallSources, regrant, rememberBdsp, rememberRom,
  type RememberedSources,
} from '../install/sourceHandles'
import { describeWipe, wipeSiteData } from '../install/wipe'
import { opfsAvailable, opfsPackStore, OPFS_ASSETS, OPFS_ROOT } from '../../data/providers/packStore'
import { activateInstall } from '../../app/boot'
import { Hint, HintCaveat, HintTree } from '../../ui/common/Hint'
import { explainInstallError, type ExplainedError } from './installErrors'
import * as css from './importWizard.css'

/**
 * `AssetAssistant`가 무엇이고 어디 있는가.
 *
 * ⚠️ **어디 있는지는 적고, 어떻게 얻는지는 안 적는다** (COPYRIGHT.md §4).
 * 앞은 사용자가 이미 가진 자기 덤프 안의 **경로**고, 뒤는 취득·복호화 안내라
 * 이 프로젝트가 하지 않기로 한 것이다. 여기가 사람들이 "그럼 그건 어디서
 * 구하나요"를 묻는 자리라, 그 자리에서 안 한다고 말한다
 */
function AssetAssistantHelp() {
  return (
    <Hint label="AssetAssistant 폴더">
      {'BDSP(브릴리언트 다이아몬드 · 샤이닝 펄)의 에셋이 들어 있는 폴더입니다. '}
      {'사람과 포켓몬의 3D 모델과 동작, 배틀 무대가 여기서 나옵니다.\n'}
      {'게임을 풀면 romfs 안 이 자리에 생깁니다:'}
      <HintTree>
        {'romfs/\n'
          + '└─ Data/\n'
          + '   └─ StreamingAssets/\n'
          + '      └─ AssetAssistant/   ← 이것을 고릅니다\n'
          + '         ├─ Characters/    사람 · 포켓몬 · 소품\n'
          + '         ├─ Pokemon/       종 · 폼별 모델\n'
          + '         └─ Environments/  배틀 무대'}
      </HintTree>
      {'romfs · Data · StreamingAssets 중 위쪽 폴더를 골라도 앱이 아래에서 '}
      {'AssetAssistant를 찾아 내려갑니다.'}
      <HintCaveat>
        {'파일을 구하는 방법, 콘솔 개조, 키 획득, 복호화는 안내하지 않습니다. '}
        {'원본 게임 파일이나 키를 요구하지도 않습니다.'}
      </HintCaveat>
    </Hint>
  )
}

/** 못 만든 그룹을 몇 개까지 이름으로 적을지. Worker가 죽으면 남은 것이 줄줄이 같은 말을 한다 */
const FAILURES_SHOWN = 6

/** 「진단 정보」에 남길 줄 수. 파일마다 한 줄이라 설치 한 번에 수천 줄이 된다 */
const DIAG_KEPT = 200

/** 설치될 언어의 이름. `optionsStore`를 안 끌어온다 — 첫 화면 청크에 얹힌다 */
const LOCALE_NAME: Readonly<Record<string, string>> = { ko: '한국어', en: '영어', ja: '일본어' }

interface Capability {
  ok: boolean
  secure: boolean
  opfs: boolean
  worker: boolean
  directoryPicker: boolean
}

function capabilities(): Capability {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const opfs = opfsAvailable()
  const worker = typeof Worker === 'function'
  const directoryPicker = typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  // 디렉터리 API가 없어도 `<input webkitdirectory>` 폴백이 있다 (IMPORT.md §3)
  return { ok: secure && opfs && worker, secure, opfs, worker, directoryPicker }
}

/** 이 기계가 3D를 어떻게 그리는가. 설치 전에 한 번만 본다 */
type GpuPath = 'webgpu' | 'webgl2' | 'software' | 'none'

/** 그래픽 카드 없이 CPU로 그리는 구현들 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render/i

/**
 * 3D를 그릴 길이 있는가 (IMPORT.md §4 「설치 전 그래픽 경고」).
 *
 * ⚠️ **설치를 막지 않는다.** 설치를 다 끝낸 뒤에야 「3D를 열 수 없다」를 알게
 * 되는 것을 막으려는 경고일 뿐이다. 헤드리스 하네스는 SwiftShader로 설치를
 * 끝까지 민다 — 여기서 막으면 그 판이 전부 선다. WebGL2만 되는 것은 경고하지
 * 않는다: 그것은 고장이 아니라 정상 폴백이다 (PLAN §2.4).
 *
 * ⚠️ **잰 컨텍스트는 돌려준다** (`WEBGL_lose_context`). 브라우저는 한 탭의
 * WebGL 컨텍스트 수를 제한한다 — 시험 삼아 연 것이 남으면 게임이 쓸 몫을 먹는다
 */
async function gpuProbe(): Promise<GpuPath> {
  const gpu = (navigator as unknown as {
    gpu?: { requestAdapter(): Promise<{
      isFallbackAdapter?: boolean
      info?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean }
    } | null> }
  }).gpu
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter()
      if (adapter) {
        const info = adapter.info
        const said = [info?.vendor, info?.architecture, info?.device, info?.description].join(' ')
        if (adapter.isFallbackAdapter === true || info?.isFallbackAdapter === true
          || SOFTWARE_RENDERER.test(said)) return 'software'
        return 'webgpu'
      }
    } catch { /* WebGL2로 내려가 본다 */ }
  }
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'none'
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return SOFTWARE_RENDERER.test(renderer) ? 'software' : 'webgl2'
  } catch {
    return 'none'
  }
}

type Phase = 'idle' | 'installing' | 'done' | 'cancelled' | 'failed'

/** 설치 막대가 지금 무엇을 재는가. 단계마다 줄이 붙어서 0으로 돌아가도 왜인지 보인다 */
type Progress =
  | { stage: 'checking'; value: number }
  | { stage: 'converting'; value: number; name: string; index: number; total: number }
  | { stage: 'verifying'; value: number }

function stores(): InstallStores {
  return {
    root: opfsPackStore(OPFS_ROOT),
    assets: opfsPackStore(`${OPFS_ROOT}/${OPFS_ASSETS}`),
  }
}

/** 왜 이 화면이 떴는가를 한 문장으로 (`app/boot`의 `InstallReason`) */
function reasonText(reason: string): string {
  switch (reason) {
    case 'outdated':
      return '설치본은 그대로 있습니다. 바뀌었거나 새로 생긴 것만 만들면 됩니다 — 나머지는 건너뜁니다.'
    case 'partial': return '지난 설치가 끝나지 않았습니다. 끝난 그룹은 그대로 두고 이어서 합니다.'
    case 'invalid': return '설치 기록을 읽지 못했습니다. 다시 만듭니다.'
    case 'unsupported': return '이 브라우저에서는 설치본을 둘 곳이 없습니다.'
    default: return '아직 설치하지 않았습니다.'
  }
}

export function ImportWizard({ onClose, onReady, why, from = 'title' }: {
  /**
   * 화면을 닫는다. **무엇을 뜻하는지는 `from`이 정한다** — 타이틀에서 열었으면
   * 타이틀로 돌아가고, 부팅에서 떴으면 돌아갈 타이틀이 없으므로 부팅을 다시 묻는다
   */
  onClose: () => void
  /** 설치가 끝나 게임을 열 수 있게 됐다. **다시 켜지 않고** 그대로 넘어간다 */
  onReady?: () => void
  /**
   * 왜 이 화면이 떴는가 (`app/boot`의 `BootState`).
   *
   * ⚠️ **안 적으면 "또 다 깔라는 건가"가 된다.** 설치가 없어서 뜬 것과, 산출물
   * 판이 올라 **그 그룹만** 다시 만들면 되는 것은 사용자가 할 일이 아주 다른데,
   * 그동안 그 이유가 `document.documentElement.dataset.boot`에만 있었다
   */
  why?: { reason: string; detail?: string; raw?: string }
  /**
   * 누가 열었는가.
   *
   * ⚠️ **`onReady`·`why`의 유무로 가르지 않는다.** 둘 다 선택이라 타이틀도 언젠가
   * 넘길 수 있고, 그날 단추의 뜻이 조용히 바뀐다. 「타이틀로 돌아가기」가 첫
   * 방문에서 아무 데도 안 가던 것이 바로 그 자리였다
   */
  from?: 'boot' | 'title'
}) {
  const [caps] = useState(capabilities)
  const [gpu, setGpu] = useState<GpuPath | null>(null)
  const [platinum, setPlatinum] = useState<ValidationReport | null>(null)
  const [checking, setChecking] = useState(false)
  const [bdsp, setBdsp] = useState<BdspScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [storage, setStorage] = useState<StorageState | null>(null)
  /** 이번 설치에 필요한 양. 이어하기면 이미 깔린 것을 뺀다 */
  const [need, setNeed] = useState(NEEDED_BYTES)
  const [phase, setPhase] = useState<Phase>('idle')
  const [log, setLog] = useState<string[]>([])
  /** 파일 경로·바이트·원문. 접힌 「진단 정보」에만 그린다 */
  const [diag, setDiag] = useState<string[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  /** 이번 설치가 지금까지 쓴 바이트 (IMPORT.md §4 「쓴 용량」) */
  const [wrote, setWrote] = useState(0)
  const [failure, setFailure] = useState<ExplainedError | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  /** 죽은 그룹과 그 이유. **이름만 적지 않는다** — 왜 죽었는지가 다음 걸음이다 */
  const [failed, setFailed] = useState<GroupFailure[]>([])
  /**
   * 「전부 지우기」를 한 번 눌렀는가.
   *
   * ⚠️ **한 번에 안 지운다.** 이 단추는 리포트까지 지운다 — 되돌릴 자리가 없다.
   * 그래서 누르면 확인 단추로 바뀌고, 그때 한 번 더 눌러야 실제로 지운다
   */
  const [wipeArmed, setWipeArmed] = useState(false)
  /**
   * 「에셋 다시 설치」를 한 번 눌렀는가. 위와 같은 까닭이다 — 리포트는 남지만
   * 설치 전체를 처음부터 다시 만드는 일이라 한 번 누른 것으로는 안 지운다
   */
  const [reinstallArmed, setReinstallArmed] = useState(false)
  /** 지난번 설치가 남긴 것이 OPFS에 있는가. 있으면 지울 길을 보여 준다 */
  const [leftover, setLeftover] = useState(false)
  /**
   * 「설치 상태 다시 확인」을 누를 때의 `why`. 부팅이 새 값을 주면 그 값과
   * 달라진다 — 그때 「다시 확인했습니다」를 띄운다. 안 띄우면 눌러도 아무 일이
   * 없는 것처럼 보인다 (같은 화면이 같은 자리에 그대로 있으므로)
   */
  const [askedWith, setAskedWith] = useState<{ why: typeof why } | null>(null)
  /**
   * 지난번에 고른 파일·폴더. **바이트가 아니라 핸들**이다 (`install/sourceHandles`).
   *
   * 이것이 있으면 다시 만들 일이 생겨도 파일 고르기를 되풀이하지 않는다 —
   * 권한 한 번만 다시 받으면 된다
   */
  const [remembered, setRemembered] = useState<RememberedSources>({ rom: null, bdsp: null })
  const romPicker = useRef<HTMLInputElement>(null)
  const dirPicker = useRef<HTMLInputElement>(null)
  /**
   * 지금 설치의 취소 신호.
   *
   * ⚠️ **Worker에게 말하는 것만으로는 모자란다.** `runInstall`은 그룹을 돌리기
   * 전에 저널·매니페스트를 쓰고 이미 있는 것을 검증한다 — 그 사이에는 Worker에
   * 걸린 일이 없어서 `client.cancel()`이 조용히 아무것도 안 한다. 브라우저
   * E2E가 취소를 켜지자마자 눌렀더니 그 창에 정확히 떨어졌다. 신호를
   * `runInstall`에도 함께 준다
   */
  const abort = useRef<{ aborted: boolean } | null>(null)
  /**
   * 이 화면에서 설치본을 지웠는데 아직 새로 다 깔지 못했는가.
   *
   * ⚠️ **타이틀로 그냥 돌아가면 안 된다.** 활성 Provider와 열린 OPFS 핸들이 방금
   * 지운 자리를 그대로 가리킨다 — 「전부 지우기」가 지운 뒤 화면을 새로 여는 것과
   * 같은 까닭이다. 그래서 닫을 때 새로 연다
   */
  const wiped = useRef(false)

  const unsupportedHere = why?.reason === 'unsupported'
  /** 설치할 수 있는 브라우저인가. 함수가 있어도 부팅이 OPFS를 못 열었으면 아니다 */
  const supported = caps.ok && !unsupportedHere

  // ⚠️ Worker를 화면 수명에 묶는다. 안 끝내면 탭에 스레드가 쌓인다
  const client = useRef<ImportClient | null>(null)
  useEffect(() => () => { client.current?.close(); client.current = null }, [])

  // 남은 것이 있는지 한 번 본다. `parts`까지 세는 것이 요점이다 — 쓰다 만 조각만
  // 남은 상태가 정확히 "지우고 싶은데 지울 길이 없는" 그 상태다
  useEffect(() => {
    if (!caps.opfs || unsupportedHere) return
    void stores().root.list('', { parts: true })
      .then((all) => { setLeftover(all.length > 0) })
      .catch(() => { /* 못 읽으면 그 자체가 정상은 아니지만, 여기서 할 말은 없다 */ })
  }, [caps.opfs, unsupportedHere])

  // 지난번에 고른 자리를 불러온다. 권한은 여기서 안 묻는다 — 제스처 밖이라
  // 브라우저가 묻지도 않고 거절한다 (`sourceHandles`의 머리말)
  useEffect(() => {
    void recallSources().then((got) => { setRemembered(got) })
  }, [])

  // 3D를 그릴 길이 있는지 설치 **전에** 본다. 타이틀에서 연 것이면 이미 3D가 돌고
  // 있으므로 안 잰다 — 그 자리에서 컨텍스트를 또 열 까닭이 없다
  useEffect(() => {
    if (from !== 'boot') return
    let alive = true
    void gpuProbe().then((got) => { if (alive) setGpu(got) })
    return () => { alive = false }
  }, [from])

  /**
   * 저장 공간을 잰다. **화면이 뜰 때 한 번 재고**, 「다시 재기」와 지운 뒤에 또 잰다.
   *
   * ⚠️ **이어하기에서 전체를 다시 요구하지 않는다.** 이미 깔린 그룹은 건너뛰므로
   * 새로 쓸 것은 그만큼 적다. 깔린 크기는 설치 기록이 그룹마다 적은 바이트다 —
   * 그 바이트는 이미 `usage`에 들어 있으므로 여유에 더하지 않고 필요에서 뺀다.
   *
   * ⚠️ **여기서 `persist()`를 청하지 않는다.** 그 요청은 「설치 시작」 클릭이
   * 제스처다 (`install`). 마운트에서 부르면 브라우저가 묻지도 않고 거절한다
   */
  const measure = useCallback(async (): Promise<StorageState> => {
    let installed = 0
    if (caps.opfs && !unsupportedHere) {
      try {
        const got = await readInstall(stores().root)
        if (got.kind === 'ok') installed = Object.values(got.value.groups).reduce((a, g) => a + g.bytes, 0)
      } catch { /* 기록을 못 읽으면 처음 설치로 잰다 — 모자라게 재는 것보다 낫다 */ }
    }
    const want = Math.max(0, NEEDED_BYTES - installed)
    const got = await storageState(want)
    setNeed(want)
    setStorage(got)
    return got
  }, [caps.opfs, unsupportedHere])

  useEffect(() => { void measure() }, [measure])

  /**
   * 필요할 때 만든다. **화면이 떴다는 것만으로 스레드를 띄우지 않는다.**
   *
   * ⚠️ 예전에는 마운트하면서 곧바로 띄웠다. 그러면 하다 만 설치본으로 다시
   * 접속했을 때, 사용자가 아무것도 안 눌러도 변환기 스레드가 하나 뜬다 —
   * "한 번 설치하면 다시 안 만든다"를 재는 E2E(⑰)가 그것을 잡았다.
   * 파일을 고르거나 설치를 누를 때 만들면 그 자리가 없어진다
   */
  const workerNow = (): ImportClient | null => {
    if (!caps.worker) return null
    client.current ??= spawnImportWorker()
    return client.current
  }

  const say = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), line])
  }, [])

  /** 사람에게는 안 읽히지만 지원 문의에 필요한 줄. 「진단 정보」로 간다 */
  const note = useCallback((line: string) => {
    setDiag((prev) => [...prev.slice(-(DIAG_KEPT - 1)), line])
  }, [])

  const pickPlatinum = (file: File): void => {
    const worker = workerNow()
    if (!worker) return
    setChecking(true)
    setPlatinum(null)
    // ⚠️ `File`을 그대로 넘긴다. 바이트를 읽어 넘기면 여기서 128MB가 복사된다 —
    // `File`은 structured clone이 되고 Worker가 필요한 범위만 `slice`한다
    void worker.validate(file, (s) => {
      say(`Platinum 확인 — ${(STEP_LABEL as Readonly<Record<string, string>>)[s] ?? s}`)
    })
      .then((got) => { setPlatinum(got) })
      .catch((e: unknown) => {
        const got = explainInstallError(e, { during: 'read' })
        say(`Platinum 확인 실패 — ${got.text}`)
        note(`Platinum 확인: ${got.raw}`)
      })
      .finally(() => { setChecking(false) })
  }

  // ⚠️ 이름을 `useDir`로 두면 안 된다 — lint가 훅으로 보고 "콜백 안에서 훅을
  // 부른다"며 선다 (`react-hooks/rules-of-hooks`)
  const scanDir = (input: { handle?: FileSystemDirectoryHandle; files?: File[] }): void => {
    const worker = workerNow()
    if (!worker) return
    setScanning(true)
    setBdsp(null)
    void worker.scanBdsp(input)
      .then((got) => { setBdsp(got) })
      .catch((e: unknown) => {
        const got = explainInstallError(e, { during: 'read' })
        say(`폴더 확인 실패 — ${got.text}`)
        note(`폴더 확인: ${got.raw}`)
      })
      .finally(() => { setScanning(false) })
  }

  /**
   * Platinum을 고른다.
   *
   * ⚠️ **`showOpenFilePicker`를 먼저 쓴다.** `<input type=file>`은 `File`만 주고
   * **핸들을 안 준다** — 그러면 다음에 다시 만들 때 또 고르라고 물어야 한다.
   * 없는 브라우저에서는 그대로 폴백하고, 그때는 기억하지 않는다
   */
  const pickRom = (): void => {
    const open = (window as {
      showOpenFilePicker?: (o?: {
        types?: { description: string; accept: Record<string, string[]> }[]
        multiple?: boolean
      }) => Promise<FileSystemFileHandle[]>
    }).showOpenFilePicker
    if (!open) { romPicker.current?.click(); return }
    void open({
      types: [{ description: 'DS 롬', accept: { 'application/octet-stream': ['.nds'] } }],
      multiple: false,
    })
      .then(async ([handle]) => {
        if (!handle) return
        await rememberRom(handle)
        setRemembered((was) => ({ ...was, rom: handle }))
        pickPlatinum(await handle.getFile())
      })
      // 권한 거부는 오류가 아니라 **취소**다 (IMPORT.md §3)
      .catch(() => { say('파일 선택을 취소했습니다') })
  }

  /**
   * 지난번에 고른 Platinum을 그대로 쓴다.
   *
   * ⚠️ **이 클릭이 권한을 청할 수 있는 유일한 자리다.** 마운트에서 부르면
   * 브라우저가 묻지도 않고 거절한다. 그래서 폴더와 **단추를 따로** 둔다 —
   * 하나로 묶으면 앞의 물음이 제스처를 다 쓰고 뒤가 조용히 거절된다
   */
  const reuseRom = (): void => {
    const handle = remembered.rom
    if (!handle) return
    void regrant(handle).then(async (granted) => {
      if (!granted) { say('Platinum 파일 읽기 권한을 못 받았습니다'); return }
      try {
        pickPlatinum(await handle.getFile())
      } catch {
        // 파일이 옮겨졌거나 지워졌다. 기억이 낡은 것이므로 지우고 다시 고르게 한다
        await forgetSources()
        setRemembered({ rom: null, bdsp: null })
        say('지난번 Platinum 파일이 그 자리에 없습니다 — 다시 골라 주세요')
      }
    })
  }

  /** 지난번에 고른 BDSP 폴더를 그대로 쓴다. 위와 같은 이유로 단추가 따로다 */
  const reuseBdsp = (): void => {
    const handle = remembered.bdsp
    if (!handle) return
    void regrant(handle).then((granted) => {
      if (!granted) { say('BDSP 폴더 읽기 권한을 못 받았습니다'); return }
      scanDir({ handle })
    })
  }

  const pickDirectory = (): void => {
    const open = (window as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker
    if (!open) { dirPicker.current?.click(); return }
    void open()
      .then(async (handle) => {
        await rememberBdsp(handle)
        setRemembered((was) => ({ ...was, bdsp: handle }))
        scanDir({ handle })
      })
      // 권한 거부는 오류가 아니라 **취소**다 (IMPORT.md §3)
      .catch(() => { say('폴더 선택을 취소했습니다') })
  }

  /**
   * 설치를 돌린다. `want`는 이번에 새로 쓸 양이다 — 보통은 화면이 잰 `need`지만,
   * 「에셋 다시 설치」는 방금 지워서 전체가 필요한데 이 렌더의 `need`는 아직
   * 이어하기로 줄여 잰 값이라 그쪽이 넘겨준다
   */
  const install = (want: number = need): void => {
    const worker = workerNow()
    if (!worker || !platinum?.ok) return
    setPhase('installing')
    setFailure(null)
    setProgress(null)
    setWrote(0)
    setMissing([])
    setFailed([])
    setReinstallArmed(false)
    setWipeArmed(false)
    const signal = { aborted: false }
    abort.current = signal
    say('설치를 시작합니다 — 탭을 닫거나 취소해도 끝난 그룹은 남고, 다시 열면 이어서 합니다')

    // ⚠️ **설치 전에 보호를 청한다** (`navigator.storage.persist`). 이 버튼 클릭이
    // 그 제스처다 — 나중에 부르면 브라우저가 그냥 거절한다. 거절을 실패로 다루지
    // 않는다: 설치는 그대로 하고, 브라우저가 공간을 되찾아 갈 수 있다고 말해 준다
    void requestPersist().then(async () => {
      const got = await storageState(want)
      setStorage(got)
      say(got.persisted
        ? '브라우저가 설치본을 지우지 않도록 보호를 켰습니다. 사이트 데이터를 지우기 전에는 설치본이 남습니다'
        : '주의 — 브라우저가 설치본 보호를 켜 주지 않았습니다. 공간이 모자라면 브라우저가 설치본을 '
          + '되찾아 갈 수 있습니다 — 리포트는 .rpsave 파일로 따로 내보내 두세요')
    })

    // Worker가 만들고 메인이 커밋한다 (`worker/client.ts` 머리말)
    // ⚠️ **`onFile`을 준다.** 모델 그룹 산출물이 580MB라 Map으로 모으면 메인
    // 스레드가 그만큼을 들고 있다가 죽는다 (`worker/client.ts`의 `ConvertHooks`)
    const produce: Producer = (spec, hooks) =>
      worker.convert(spec.name, { onProgress: hooks.onProgress, onFile: hooks.onFile })

    void runInstall({
      ...stores(),
      locale: platinum.release.locale,
      groups: ALL_GROUPS,
      produce,
      signal,
      onEvent: (e: InstallEvent) => {
        switch (e.kind) {
          case 'checking':
            if (e.total > 0) setProgress({ stage: 'checking', value: e.done / e.total })
            return
          case 'resumed':
            say(`이미 만든 것 ${String(e.skipped.length)}가지는 건너뜁니다`)
            if (e.rebuilt.length > 0) {
              say(`깨진 것 ${String(e.rebuilt.length)}가지는 다시 만듭니다: ${groupLabels(e.rebuilt)}`)
            }
            return
          case 'group':
            say(`만드는 중: ${groupLabel(e.name)} (${String(e.index + 1)}/${String(e.total)})`)
            note(`group ${e.name} (${String(e.index + 1)}/${String(e.total)})`)
            setProgress({
              stage: 'converting', value: e.index / e.total, name: e.name, index: e.index, total: e.total,
            })
            return
          case 'progress':
            // ⚠️ **막대 하나가 설치 전체다.** 그룹마다 0으로 돌아가면 마흔여덟 번 차오르는
            // 막대가 되고, 얼마나 남았는지는 아무도 모른다
            if (e.total > 0) {
              setProgress((p) => (p?.stage === 'converting'
                ? { ...p, value: (p.index + Math.min(1, e.done / e.total)) / p.total }
                : p))
            }
            return
          case 'wrote':
            setWrote((w) => w + e.bytes)
            note(`${e.path} — ${formatBytes(e.bytes)}`)
            return
          case 'verifying':
            if (e.total > 0) setProgress({ stage: 'verifying', value: e.done / e.total })
            return
          case 'groupFailed':
            say(`못 만든 것: ${groupLabel(e.name)} — 건너뛰고 계속합니다`)
            note(`${e.name} 실패 — ${e.why}`)
            return
          case 'done':
            setMissing(e.missing)
            setFailed(e.failed)
        }
      },
    })
      .then((manifest) => {
        setPhase('done')
        // 지운 뒤에 무엇이든 다시 썼으므로 남은 것이 있다 — 「전부 지우기」의 조건
        setLeftover(true)
        if (manifest.state === 'ready') {
          say('설치를 마쳤습니다')
          // ⚠️ **다시 켜지 않고** 그 자리에서 OPFS로 갈아 끼운다. 갈아 끼웠으므로
          // 타이틀로 돌아갈 때 새로 열 까닭도 없어진다 (`wiped`)
          activateInstall(manifest)
          wiped.current = false
          onReady?.()
          return
        }
        say('일부만 설치되었습니다 — 다시 누르면 남은 것부터 합니다')
      })
      .catch((e: unknown) => {
        // 취소는 오류가 아니다 (IMPORT.md §3)
        if (e instanceof WorkerCancelled || (e as Error).name === 'Cancelled') {
          setPhase('cancelled')
          say('설치를 취소했습니다')
          return
        }
        setPhase('failed')
        const got = explainInstallError(e, { space: storage ? { need: want, free: storage.free } : undefined })
        setFailure(got)
        note(`설치 실패: ${got.raw}`)
      })
  }

  /**
   * 「에셋 다시 설치」 — 확인을 받은 뒤 지우고, **곧바로 다시 만든다.**
   *
   * ⚠️ 예전에는 지우기만 하고 「지웠습니다」에서 끝났다. 단추 이름은 「다시
   * 설치」인데 설치는 사람이 따로 눌러야 했고, 처음 온 사람 눈에도 늘 떠 있었다.
   * 준비물이 다 있으면 바로 설치로 넘어가고, 없으면 무엇을 하면 되는지 적는다
   */
  const reinstall = (): void => {
    setReinstallArmed(false)
    void clearAssets(stores())
      .then(async () => {
        wiped.current = true
        setLeftover(false)
        setPhase('idle')
        setMissing([])
        setFailed([])
        // 지웠으니 이제 전체가 필요하다 — 이어하기로 줄여 잰 값을 버린다
        const room = await measure()
        if (platinum?.ok && bdsp?.ok && supported && room.enough) {
          say('에셋과 설치 기록을 지웠습니다 (리포트는 그대로입니다) — 처음부터 다시 만듭니다')
          install(NEEDED_BYTES)
          return
        }
        say('에셋과 설치 기록을 지웠습니다 (리포트는 그대로입니다) — 준비물을 고른 뒤 「설치 시작」을 누르세요')
      })
      .catch((e: unknown) => {
        const got = explainInstallError(e)
        say(`지우지 못했습니다 — ${got.text}`)
        note(`에셋 지우기: ${got.raw}`)
      })
  }

  /**
   * 지우기 전에 리포트를 파일로 받아 둔다 (IMPORT.md §8).
   *
   * ⚠️ **여기 오는 사람은 게임 안에서 못 받는다.** 설치가 반쯤이라 타이틀에
   * 못 가고, 그래서 「리포트 → 백업」 화면도 못 연다. 지우기 직전이 마지막
   * 기회다.
   *
   * ⚠️ **정적으로 안 끌어온다.** `saveStore`는 이주기(zod)를 달고 오고, 이
   * 화면은 첫 화면 예산에 그대로 얹히는 자리다 (DEPLOY.md §2). 누른 뒤에
   * 받으면 된다 — 타이틀 화면이 `previewImport`에서 쓰는 것과 같은 길이다
   */
  const backupReportFile = (): void => {
    void import('../../state/saveStore')
      .then(async ({ useSaveStore }) => useSaveStore.getState().exportReport())
      .then((got) => {
        if (got.kind === 'none') { say('받을 리포트가 없습니다'); return }
        say(got.outcome.started
          ? `리포트를 파일로 받았습니다 — ${got.fileName}`
            + `${got.raw ? ' (이 버전이 못 읽는 리포트라 원본 그대로 담았습니다)' : ''}`
          : '브라우저가 다운로드를 막았습니다. 한 번 더 눌러 주세요')
      })
      .catch(() => { say('리포트를 못 읽었습니다') })
  }

  /**
   * 브라우저에 남은 것을 전부 지우고 화면을 새로 연다.
   *
   * ⚠️ **다시 그리는 것으로 안 끝난다.** 방금 지운 자리를 가리키는 것들이
   * 메모리에 그대로 있다 — 활성 Provider, 열린 OPFS 핸들, idb-keyval의 연결.
   * 그래서 지운 뒤에는 화면을 통째로 새로 연다
   */
  const wipeAll = (): void => {
    setWipeArmed(false)
    say('브라우저에 남은 것을 지우는 중…')
    void wipeSiteData().then((got) => {
      say(describeWipe(got))
      // 못 지운 것이 있으면 그 문구를 읽을 틈을 준다 — 바로 새로 열면 사라진다
      setTimeout(() => { location.reload() }, got.failed.length > 0 ? 2500 : 400)
    })
  }

  /** 화면 맨 아래 단추. 누가 열었는가에 따라 뜻이 다르다 (`from`) */
  const leave = (): void => {
    if (from === 'boot') {
      // 돌아갈 타이틀이 없다 — 부팅을 다시 묻는다. 기록이 ready면 그 자리에서 게임으로
      setAskedWith({ why })
      onClose()
      return
    }
    if (wiped.current) { location.reload(); return }
    onClose()
  }
  const rechecked = askedWith !== null && askedWith.why !== why && why !== undefined

  /**
   * 「전부 지우기」를 보일 자리인가.
   *
   * ⚠️ **처음 오는 사람에게는 안 보인다.** 아무것도 없는 브라우저에 "전부
   * 지웁니다"를 띄우면 지울 것도 없는데 겁부터 준다. 그래서 조건은 둘이다 —
   * 이번에 무언가 죽었거나(`failed`·`failed` 상태), **지난번 것이 남아 있거나**.
   *
   * ⚠️ **`failed`만 보면 안 된다.** 설치가 도중에 멈춘 채로 탭을 닫은 사람은
   * 다시 왔을 때 `phase`가 `idle`이다 — 화면에는 아무 실패도 안 적혀 있는데
   * OPFS에는 반쯤 쓴 나무가 있다. 정작 이 단추가 제일 필요한 사람이 그 사람이다
   */
  const broke = phase === 'failed' || failed.length > 0 || leftover
  /**
   * 「에셋 다시 설치」를 보일 자리인가. **지울 설치본이 있을 때만이다** — 처음 온
   * 사람은 OPFS가 비어 있어 `leftover`가 거짓이고, 그러면 이 단추도 없다
   */
  const canReinstall = phase !== 'installing'
    && (leftover || phase === 'done' || phase === 'failed' || phase === 'cancelled')

  const ready = groupsReady()
  const blocked = groupsBlocked()
  const stillMissing = missingRequired(ready.map((g) => g.name))
  // 설치를 시작할 수 있는가. **BDSP와 공간도 조건이다** (§2.3)
  const canInstall = Boolean(
    platinum?.ok && supported && bdsp?.ok && storage?.enough && phase !== 'installing')

  /** 안 되는 것만, 할 일과 함께 (IMPORT.md §3 「지원 환경을 설명한다」) */
  const envProblems = [
    caps.secure ? null : '안전한 연결이 아닙니다 — https 주소로 열어 주세요.',
    caps.opfs && !unsupportedHere ? null
      : '이 브라우저는 설치본을 둘 저장 공간을 주지 않습니다. 시크릿 창이 아닌 Chrome·Edge 최신판에서 열어 주세요.',
    caps.worker ? null : '백그라운드에서 변환할 수 없습니다 — Chrome·Edge 최신판에서 열어 주세요.',
  ].filter((s): s is string => s !== null)

  const gpuWarning = gpu === 'none'
    ? '이 브라우저에서는 3D 그래픽을 열 수 없습니다 — 설치는 되지만 게임 화면이 뜨지 않습니다. '
      + '설치 전에 브라우저 설정에서 하드웨어 가속을 켜고, 그래픽 드라이버를 최신으로 맞춰 주세요.'
    : gpu === 'software'
      ? '그래픽 카드 대신 소프트웨어로 그리고 있어 게임이 매우 느립니다 — '
        + '설치 전에 브라우저 설정에서 하드웨어 가속을 켜 주세요.'
      : null

  const pct = (v: number): string => `${String(Math.round(Math.max(0, Math.min(1, v)) * 100))}%`

  return (
    <div className={css.wrap}>
      {/* 타이틀 그림. 설치 전에는 이 화면이 곧 첫 화면이다 (`importWizard.css`) */}
      <div className={css.sky} />
      <div className={css.sheet}>
        <header className={css.crest}>
          <h1 className={css.crestName}>Radiant Platinum</h1>
          <span className={css.crestNote}>비공식 팬 프로젝트 · 비영리</span>
        </header>

        {/* ⚠️ **여기가 이 고지의 유일한 자리다** (COPYRIGHT.md §11). 설치 전
            사용자는 타이틀에 못 간다 — `BootGate`가 설치 전에는 `<App/>`을 아예
            안 그리기 때문이다. 타이틀에만 두면 정작 처음 오는 사람은 못 본다.
            ⚠️ **첫 화면 안에 둔다.** 아래쪽 끝에 두었더니 세 화면쯤 스크롤해야
            나왔다 — 문서에 있는 것과 눈에 띄는 것은 다르다 */}
        <p className={css.disclaimer}>
          비공식·비제휴 팬 프로젝트입니다. 관련 상표와 저작물은 각 권리자의 것이며,
          직접 가진 게임 파일을 쓰는 무료·비영리 방식이어도 권리자의 허가를 뜻하지는 않습니다.
          적법하게 보유한 게임 데이터만 고르세요 — 서버는 원본도 변환 결과도
          받거나 저장하지 않습니다.
        </p>

        {/* ⚠️ **준비물을 맨 앞에 둔다.** 여기서 사람이 제일 먼저 알아야 하는 것은
            단계 목록이 아니라 무엇을 미리 갖고 와야 하는가다. 그것이 없으면
            아래를 아무리 읽어도 할 수 있는 것이 없다 */}
        <div className={css.lead}>
          <div className={css.leadHead}>시작하려면 준비물 둘이 먼저 필요합니다</div>
          <ul className={css.needs}>
            <li>
              <span
                className={`${css.needMark} ${platinum?.ok ? css.ok : css.stepNote}`}
                aria-label={platinum?.ok ? '준비됨' : '아직 없음'}
              >
                {platinum?.ok ? '✓' : '○'}
              </span>
              <b>Platinum .nds 파일</b>
              {' — 본인이 적법하게 보유한 것. 영어 · 한국어 · 일본어판을 받습니다'}
            </li>
            <li>
              <span
                className={`${css.needMark} ${bdsp?.ok ? css.ok : css.stepNote}`}
                aria-label={bdsp?.ok ? '준비됨' : '아직 없음'}
              >
                {bdsp?.ok ? '✓' : '○'}
              </span>
              <b>AssetAssistant 폴더</b>
              {' — BDSP에서 이미 추출해 둔 것 '}
              <AssetAssistantHelp />
            </li>
          </ul>
          <div className={css.body}>
            {'아래에서 두 가지를 고르면 브라우저가 그 자리에서 변환해 설치합니다. '}
            {/* 부팅에서 떴으면 끝난 순간 게임으로 넘어가고, 타이틀에서 열었으면 그리로 돌아간다 */}
            {from === 'boot'
              ? '설치가 끝나면 이 화면이 스스로 게임으로 넘어가고, 다음부터는 파일을 다시 묻지 않습니다.'
              : '다 고치면 타이틀로 돌아갑니다. 다음부터는 파일을 다시 묻지 않습니다.'}
          </div>
        </div>

        <h2 className={css.title}>에셋 설치</h2>

        {/* ⚠️ **이유를 적는다.** 설치본이 아예 없는 것과, 산출물 판이 올라 그
            그룹만 다시 만들면 되는 것은 사용자가 할 일이 다르다. 그동안 이 값이
            `data-boot`에만 있어서 화면에는 늘 처음 설치처럼 보였다 */}
        {why && why.reason !== 'none' && (
          <div className={css.banner}>
            {reasonText(why.reason)}
            {why.detail ? `\n${why.detail}` : ''}
            {why.raw && <Fold label="자세히">{why.raw}</Fold>}
          </div>
        )}

        {/* ⚠️ **여기 적힌 것이 사실이어야 한다.** 한때 "설치를 끝내도 아직 게임은
            시작할 수 없습니다"가 박혀 있었는데, 그 말이 참이 아니게 된 뒤에도
            남아 있었다. 그래서 숫자는 전부 표에서 세어 온다.
            모자란 것이 있으면 누구에게나 보이고, 다 됐을 때의 진행 보고는 개발판에서만.
            공개판에서 감추지 않는다 — 감추면 설치가 끝났는데 왜 게임이 안 열리는지 알 길이 없다
            (사용자 결정 2026-10-02: 남기고 사람 말로만 다듬는다) */}
        {(import.meta.env.DEV || stillMissing.length > 0) && (
          <div className={css.banner}>
            {stillMissing.length > 0
              ? `이 버전은 게임에 필요한 것 ${String(stillMissing.length)}가지를 아직 만들 수 없어서, `
                + `설치를 마쳐도 게임을 시작할 수 없습니다 — ${groupLabels(stillMissing)}\n`
              : `변환 ${String(ready.length)}개가 전부 옮겨졌습니다.\n`}
            {import.meta.env.DEV && '여기서 실제로 도는 것은 입력 검증 · 폴더 판정 · 저장 공간 · '
              + 'Worker 변환 · OPFS 설치와 재개 · 파일별 무결성 검증입니다.'}
          </div>
        )}

        {/* ⚠️ **이 네 사실은 접지 않는다** (IMPORT.md §4 표) — 서버로 안 보낸다,
            다시 안 고른다, 사이트 데이터를 지우면 사라진다, 브라우저·기기·주소마다 따로다 */}
        <div className={css.body}>
          {'고른 파일은 이 기기 안에서만 읽습니다. 바이트도, 파일 이름도, 폴더 목록도, '}
          {'판정 결과도 서버로 보내지 않습니다. 변환은 전부 브라우저 안에서 일어납니다.\n'}
          {'설치가 끝나면 다음부터는 파일을 다시 고르지 않습니다 — 이 브라우저의 '}
          {'저장 공간에서 바로 엽니다. 게임이 도는 동안 원본은 한 번도 안 읽습니다.\n'}
          {'다만 나중에 일부를 다시 변환해야 할 때 또 고르라고 묻지 않으려고, '}
          {'지난번에 고른 파일·폴더를 이 브라우저 안에만 기억합니다. 바이트도 '}
          {'경로 문자열도 서버로 가지 않고, 읽기 권한은 그때 한 번 더 물어봅니다 — '}
          {'아래 「고른 파일·폴더 기억 지우기」로 지울 수 있고 「전부 지우기」에도 함께 지워집니다.\n'}
          {'주의 — 설치본은 이 브라우저 · 이 기기 · 이 주소에만 있습니다. 다른 브라우저나 '}
          {'다른 기기에서는 다시 설치해야 하고, 주소가 바뀌어도 이어받지 못합니다.\n'}
          {'사이트 데이터를 지우면 설치된 에셋도 함께 사라집니다. 리포트는 '}
          {'.rpsave 파일로 따로 내보내 둘 수 있습니다 (타이틀 화면) — 에셋을 다시 '}
          {'설치한 뒤 그 파일로 진행 상태를 되돌립니다.'}
        </div>

        {/* ── 0. 환경 ─────────────────────────────────────────────── */}
        {/* ⚠️ **다 되면 한 줄이다.** 「보안 컨텍스트 · OPFS · Worker」 체크리스트는
            사람이 할 일이 없는 정보다 — 안 되는 것만, 무엇을 하면 되는지와 함께 적는다 */}
        <section className={css.step}>
          <div className={css.stepHead}>
            환경 확인
            <span className={supported ? css.ok : css.bad}>
              {supported ? '이 브라우저에서 설치할 수 있습니다' : '이 브라우저에서는 설치할 수 없습니다'}
            </span>
          </div>
          {envProblems.length > 0 && (
            <ul className={`${css.list} ${css.bad}`}>
              {envProblems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {/* 고장이 아니라 다른 길이다 — 빨갛게 칠하지 않는다 (IMPORT.md §3) */}
          {!caps.directoryPicker && (
            <div className={css.stepNote}>
              {'이 브라우저는 폴더를 파일 목록으로 고릅니다 — 다시 이어 할 때 폴더를 한 번 더 고릅니다.'}
            </div>
          )}
          {gpuWarning !== null && <div className={`${css.body} ${css.bad}`}>{gpuWarning}</div>}
          {import.meta.env.DEV && (
            <div className={css.groups}>
              <Line label="보안 컨텍스트 (HTTPS·localhost)" ok={caps.secure} />
              <Line label="OPFS" ok={caps.opfs && !unsupportedHere} />
              <Line label="Worker" ok={caps.worker} />
              <Line label="폴더 선택 API" ok={caps.directoryPicker} note={caps.directoryPicker ? '' : 'webkitdirectory 폴백'} />
              <Line label="3D" ok={gpu === 'webgpu' || gpu === 'webgl2'} note={gpu ?? (from === 'boot' ? '재는 중' : '안 잼')} />
            </div>
          )}
        </section>

        {/* ── 1. Platinum ─────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>
            ① Platinum
            <span className={css.stepNote}>이 기기에서 선택 · 전송하지 않음</span>
          </div>
          <div className={css.row}>
            <button
              className={css.button}
              disabled={checking || !caps.worker}
              onClick={pickRom}
            >
              {checking ? '확인하는 중…' : '이 기기에서 Platinum 선택'}
            </button>
            {remembered.rom && !platinum && (
              <button className={css.button} disabled={checking || !caps.worker} onClick={reuseRom}>
                {`지난번 그대로 (${remembered.rom.name})`}
              </button>
            )}
            <input
              ref={romPicker}
              type="file"
              accept=".nds"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) pickPlatinum(file)
              }}
            />
          </div>
          {platinum && (
            <div className={`${css.body} ${platinum.ok ? css.ok : css.bad}`}>
              {explain(platinum as Validation)}
              {platinum.ok && `\n설치될 언어: ${platinum.locales.map((l) => LOCALE_NAME[l] ?? l).join(' · ')}`}
              {platinum.ok && import.meta.env.DEV
                && `\n파일 ${String(platinum.measured.files)}개 · 오버레이 ${String(platinum.measured.overlays)}개`
                  + `\n상점 표: ARM9+${platinum.release.marts.common.arm9RelativeOffset}`
                  + ` · ${String(SUPPORTED.martCounts.common)}줄`}
              {!platinum.ok && platinum.detail !== undefined && <Fold label="자세히">{platinum.detail}</Fold>}
            </div>
          )}
        </section>

        {/* ── 2. BDSP ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>
            ② BDSP 폴더
            <AssetAssistantHelp />
            <span className={css.stepNote}>이미 추출된 AssetAssistant (또는 그 상위)</span>
          </div>
          <div className={css.row}>
            <button className={css.button} disabled={scanning || !caps.worker} onClick={pickDirectory}>
              {scanning ? '살펴보는 중…' : '이 기기에서 BDSP 폴더 선택'}
            </button>
            {remembered.bdsp && !bdsp && (
              <button className={css.button} disabled={scanning || !caps.worker} onClick={reuseBdsp}>
                {`지난번 그대로 (${remembered.bdsp.name})`}
              </button>
            )}
            <input
              ref={dirPicker}
              type="file"
              hidden
              // @ts-expect-error — 표준에 없지만 크로미움·사파리가 받는다
              webkitdirectory=""
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (files.length > 0) scanDir({ files })
              }}
            />
          </div>
          <div className={css.body}>
            {`이 폴더에서 만드는 것 — ${groupLabels(REQUIRED_BDSP_GROUPS)}\n`}
            {'폴더를 못 고르면 여기서 멈춥니다. 이미 추출된 지원 폴더가 필요합니다.\n'}
            {/* ⚠️ 여기가 사람들이 "그럼 그건 어디서 구하나요"를 묻는 자리다.
                안내하지 않는다는 것을 그 자리에서 말한다 (COPYRIGHT.md §4) */}
            {'파일을 구하는 방법, 콘솔 개조, 키 획득, 복호화, 보호조치 우회는 '}
            {'안내하지 않습니다. 원본 게임 파일이나 키를 요구하지도 않습니다.'}
          </div>
          {bdsp && (
            <>
              <div className={`${css.body} ${bdsp.ok ? css.ok : css.bad}`}>
                {bdsp.ok
                  ? `찾았습니다: ${bdsp.root || '(고른 폴더가 뿌리입니다)'}`
                    + `\n파일 ${bdsp.files.toLocaleString()}개 · ${formatBytes(bdsp.bytes)}`
                  : bdsp.why}
              </div>
              {import.meta.env.DEV && bdsp.groups && (
                <div className={css.groups}>
                  {bdsp.groups.map((g) => (
                    <Line
                      key={g.name}
                      label={g.name}
                      ok={g.index && g.bundles > 0}
                      note={g.index ? `번들 ${g.bundles.toLocaleString()}개` : '색인 없음'}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── 3. 공간 ─────────────────────────────────────────────── */}
        {/* ⚠️ **누르지 않아도 잰다.** 예전에는 「공간 확인하고 자리 잡기」를 눌러야만
            값이 채워졌고, 그 전에는 「설치 시작」이 이유 없이 잠겨 있었다 */}
        <section className={css.step}>
          <div className={css.stepHead}>
            ③ 저장 공간
            <span className={css.stepNote}>원본 크기가 아니라 변환 결과와 임시 여유를 더한 크기</span>
          </div>
          {storage === null
            ? <div className={css.body}>{'저장 공간을 재는 중…'}</div>
            : (
              <div className={`${css.body} ${storage.enough ? css.ok : css.bad}`}>
                {storage.measurable
                  ? `여유 ${formatBytes(storage.free)} / 전체 ${formatBytes(storage.quota)}`
                    + ` · 필요 ${formatBytes(need)}`
                    + (need < NEEDED_BYTES ? ' (이미 설치된 것은 뺐습니다)' : '')
                    + (storage.enough ? ''
                      : `\n${formatBytes(need - storage.free)}가 더 필요합니다 — 디스크를 비우고 다시 재 주세요. `
                        + '시크릿 창은 할당량이 작으니 일반 창에서 열어 주세요.')
                    + `\n브라우저가 설치본을 지우지 않도록 보호: ${storage.persisted ? '켜짐' : '안 켜짐 (브라우저가 정합니다)'}`
                  : '이 브라우저는 저장 공간을 알려 주지 않아 설치를 시작할 수 없습니다 — '
                    + '데스크톱 Chrome·Edge 최신판의 일반 창에서 열어 주세요.'}
              </div>
            )}
          {/* 디스크를 비운 사람이 다시 잴 길이다. 넉넉하면 누를 까닭이 없다 */}
          {storage !== null && !storage.enough && (
            <div className={css.row}>
              <button className={css.button} onClick={() => { void measure() }}>다시 재기</button>
            </div>
          )}
        </section>

        {/* ── 4. 설치 ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>④ 설치</div>
          <div className={css.row}>
            <button className={css.button} disabled={!canInstall} onClick={() => { install() }}>
              {phase === 'installing' ? '변환하는 중…' : '설치 시작'}
            </button>
            <button
              className={css.button}
              disabled={phase !== 'installing'}
              onClick={() => {
                // 둘 다 켠다 — 어느 창에서 눌렸는지 모른다 (`abort` 참고)
                if (abort.current) abort.current.aborted = true
                client.current?.cancel()
              }}
            >
              취소
            </button>
            {canReinstall && (reinstallArmed
              ? (
                <>
                  <button className={`${css.button} ${css.bad}`} onClick={reinstall}>
                    정말 처음부터 다시 만듭니다
                  </button>
                  <button className={css.button} onClick={() => { setReinstallArmed(false) }}>
                    그만두기
                  </button>
                </>
              )
              : (
                <button
                  className={css.button}
                  onClick={() => { setReinstallArmed(true); setWipeArmed(false) }}
                >
                  에셋 다시 설치 (리포트는 남습니다)
                </button>
              ))}
            {/* 기억한 파일·폴더를 지운다. 위 안내문이 약속한 그 단추다 — 없으면
                "기억합니다"만 있고 무를 길이 없다 */}
            {(remembered.rom ?? remembered.bdsp) && (
              <button
                className={css.button}
                disabled={phase === 'installing'}
                onClick={() => {
                  void forgetSources().then(() => {
                    setRemembered({ rom: null, bdsp: null })
                    say('고른 파일·폴더를 잊었습니다 — 다음에는 다시 고릅니다')
                  })
                }}
              >
                고른 파일·폴더 기억 지우기
              </button>
            )}
          </div>
          {canReinstall && reinstallArmed && (
            <div className={css.body}>
              {'변환 결과와 이어하기 기록을 지우고 처음부터 다시 만듭니다 — 리포트는 남습니다. '}
              {'깨진 것만 고치려면 「설치 시작」을 누르세요 (온전한 그룹은 건너뜁니다).'}
            </div>
          )}
          {/* ⚠️ **하다 죽었을 때만 보인다.** 늘 띄워 두면 리포트를 지우는 단추가
              설치가 잘된 사람 눈앞에도 있게 된다. 여기 오는 사람은 이미 같은
              자리에서 두 번 막힌 사람이고, 그때 브라우저 설정을 뒤지게 두는
              대신 이 자리에서 끝내게 한다 */}
          {broke && (
            <div className={css.row}>
              {wipeArmed ? (
                <>
                  {/* 지우기 전에 받아 둘 마지막 기회다 — 위 ⚠️ 참고 */}
                  <button className={css.button} onClick={backupReportFile}>
                    먼저 리포트를 파일로 받기
                  </button>
                  <button className={`${css.button} ${css.bad}`} onClick={wipeAll}>
                    정말 전부 지웁니다
                  </button>
                  <button className={css.button} onClick={() => { setWipeArmed(false) }}>
                    그만두기
                  </button>
                </>
              ) : (
                <button
                  className={css.button}
                  disabled={phase === 'installing'}
                  onClick={() => { setWipeArmed(true); setReinstallArmed(false) }}
                >
                  전부 지우고 처음부터 (리포트도 사라집니다)
                </button>
              )}
            </div>
          )}
          {broke && wipeArmed && (
            <div className={`${css.body} ${css.bad}`}>
              {'이 사이트가 이 브라우저에 남긴 것을 전부 지웁니다 — '}
              {'에셋 · 설치 기록 · 설정, 그리고 리포트까지.\n'}
              {'진행이 있으면 먼저 파일로 받아 두세요 — 여기서는 게임 안 백업 화면에 못 갑니다.\n'}
              {'에셋만 다시 만들 거라면 「에셋 다시 설치」를 쓰세요. 지운 뒤에는 화면이 새로 열립니다.'}
            </div>
          )}
          {!canInstall && phase !== 'installing' && (
            <div className={css.body}>
              {'설치를 시작하려면 — '}
              {[
                platinum?.ok ? null : 'Platinum 확인',
                bdsp?.ok ? null : 'BDSP 폴더',
                storage === null ? '저장 공간 재는 중'
                  : !storage.measurable ? '저장 공간을 잴 수 없음'
                    : storage.enough ? null : '저장 공간 부족',
                supported ? null : '브라우저 지원',
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          {/* ⚠️ **막대 위에 지금 무엇을 하는지 적는다.** 이어하기는 먼저 이미 만든 것을
              다시 읽고, 끝에는 전부를 한 번 더 읽는다 — 그 두 구간에서 막대가 0으로
              돌아가는데 까닭이 안 보이면 멈춘 것처럼 읽힌다 */}
          {phase === 'installing' && (
            <>
              <div className={css.progressHead}>
                <span>
                  {progress === null ? '준비하는 중'
                    : progress.stage === 'checking' ? '이미 만든 것 확인 중'
                      : progress.stage === 'verifying' ? '마지막 확인 중'
                        : `만드는 중: ${groupLabel(progress.name)} `
                          + `(${String(progress.index + 1)}/${String(progress.total)})`}
                </span>
                <span>{progress === null ? '' : pct(progress.value)}</span>
                <span className={css.stepNote}>{`지금까지 ${formatBytes(wrote)}`}</span>
              </div>
              <div className={css.bar}>
                <div
                  className={css.barFill}
                  style={{ width: pct(progress?.value ?? 0) }}
                />
              </div>
            </>
          )}
          {failure !== null && (
            <div className={`${css.body} ${css.bad}`}>
              {failure.text}
              <Fold label="자세히">{failure.raw}</Fold>
            </div>
          )}
          {phase === 'cancelled' && (
            <div className={css.body}>{'취소했습니다. 끝난 그룹은 건너뛰고 남은 것부터 이어서 합니다.'}</div>
          )}
          {phase === 'done' && missing.length > 0 && (
            <div className={`${css.body} ${css.bad}`}>
              {`만든 것은 설치됐지만 게임을 시작하려면 ${String(missing.length)}가지가 더 필요합니다:\n`}
              {groupLabels(missing)}
              {/* ⚠️ **왜 없는지가 이름보다 중요하다.** 무엇을 다시 고르면 되는지
                  알려면 "arenas가 없다"가 아니라 "무대를 하나도 못 만들었다"가
                  필요하다 — 설치는 죽은 그룹을 건너뛰고 끝까지 간다. 이름은 여기,
                  변환기가 준 원문 이유는 바로 아래 「자세히」에 둔다 */}
              {/* Worker가 죽으면 남은 그룹이 줄줄이 같은 말을 하므로 몇 개만 */}
              {failed.length > 0 && `\n\n못 만든 것 ${String(failed.length)}가지: `
                + groupLabels(failed.slice(0, FAILURES_SHOWN).map((f) => f.name))
                + (failed.length > FAILURES_SHOWN ? ` … 외 ${String(failed.length - FAILURES_SHOWN)}가지` : '')}
              {failed.length > 0 && (
                <Fold label="자세히">
                  {failed.slice(0, FAILURES_SHOWN).map((f) => `${f.name} — ${f.why}`).join('\n')}
                </Fold>
              )}
            </div>
          )}
          {log.length > 0 && (
            <ul className={css.list}>
              {log.slice(-12).map((line, i) => <li key={`${String(i)}-${line}`}>{line}</li>)}
            </ul>
          )}
          {/* 파일 경로·바이트·원문. 기본으로 접혀 있다 — 여는 사람은 지원 문의를 쓰는 사람이다 */}
          {diag.length > 0 && <Fold label="진단 정보">{diag.slice(-40).join('\n')}</Fold>}
        </section>

        {/* ── 남은 일 ─────────────────────────────────────────────── */}
        {(import.meta.env.DEV || blocked.length > 0) && (
          <section className={css.step}>
            <div className={css.stepHead}>
              아직 만들지 못하는 것
              <span className={css.stepNote}>{`${String(blocked.length)}가지`}</span>
            </div>
            <ul className={css.list}>
              {blocked.map((g) => <li key={g.name}><b>{groupLabel(g.name)}</b> — {g.blockedBy}</li>)}
              {blocked.length === 0 && <li>{'없습니다 — 필수 그룹이 전부 옮겨졌습니다.'}</li>}
            </ul>
          </section>
        )}

        <div className={css.row}>
          {/* ⚠️ **설치 중에는 못 누른다.** 타이틀에서는 닫으면 화면이 내려가 설치가
              주인을 잃고, 부팅에서는 다시 물어도 「설치 중」이라 할 말이 없다 */}
          <button className={css.button} disabled={phase === 'installing'} onClick={leave}>
            {from === 'boot' ? '설치 상태 다시 확인' : '타이틀로 돌아가기'}
          </button>
        </div>
        {rechecked && (
          <div className={css.body}>
            {`다시 확인했습니다 — 아직 게임을 열 수 없습니다. ${reasonText(why.reason)}`}
          </div>
        )}
      </div>
    </div>
  )
}

/** 접힌 덧붙임. 원문·경로·숫자는 여기로 — 사람이 읽는 문장 옆에 두되 기본으로 닫는다 */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={css.fold}>
      <summary className={css.foldHead}>{label}</summary>
      <div className={css.foldBody}>{children}</div>
    </details>
  )
}

/** 개발판 진단 표의 한 줄 */
function Line({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <>
      <span className={ok ? css.ok : css.bad}>{ok ? '됨' : '안 됨'}</span>
      <span>{label}</span>
      <span className={css.stepNote}>{note ?? ''}</span>
    </>
  )
}
