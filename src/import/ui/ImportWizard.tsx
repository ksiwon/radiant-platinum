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
// ⚠️ **아직 완성되지 않았다.** 옮겨진 변환 그룹이 필수 목록에 한참 못 미치고
// BDSP 변환은 하나도 없다. 그 사실을 첫 화면에 적는다 — 감추면 설치를 끝내고도
// 게임이 안 뜨는 이유를 아무도 모른다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ValidationReport } from '../worker/protocol'
import { spawnImportWorker, WorkerCancelled, type ImportClient } from '../worker/client'
import { explain, SUPPORTED, type Validation } from '../platinum/validate'
import { GROUPS, groupsBlocked, groupsReady } from '../platinum/convert'
import type { BdspScan } from '../bdsp/scan'
import { formatBytes, NEEDED_BYTES, requestPersist, storageState, type StorageState } from '../install/storage'
import { clearAssets, runInstall, type InstallEvent, type InstallStores, type Producer } from '../install/installer'
import { REQUIRED_BDSP_GROUPS, missingRequired } from '../install/required'
import { opfsAvailable, opfsPackStore, OPFS_ASSETS, OPFS_ROOT } from '../../data/providers/packStore'
import { activateInstall } from '../../app/boot'
import * as css from './importWizard.css'

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

type Phase = 'idle' | 'installing' | 'done' | 'cancelled' | 'failed'

function stores(): InstallStores {
  return {
    root: opfsPackStore(OPFS_ROOT),
    assets: opfsPackStore(`${OPFS_ROOT}/${OPFS_ASSETS}`),
  }
}

export function ImportWizard({ onClose, onReady }: {
  onClose: () => void
  /** 설치가 끝나 게임을 열 수 있게 됐다. **다시 켜지 않고** 그대로 넘어간다 */
  onReady?: () => void
}) {
  const [caps] = useState(capabilities)
  const [platinum, setPlatinum] = useState<ValidationReport | null>(null)
  const [checking, setChecking] = useState(false)
  const [bdsp, setBdsp] = useState<BdspScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [storage, setStorage] = useState<StorageState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
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

  // ⚠️ Worker를 화면 수명에 묶는다. 안 끝내면 탭에 스레드가 쌓인다
  const client = useRef<ImportClient | null>(null)
  useEffect(() => {
    if (!caps.worker) return
    client.current = spawnImportWorker()
    return () => { client.current?.close(); client.current = null }
  }, [caps.worker])

  const say = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), line])
  }, [])

  const pickPlatinum = (file: File): void => {
    const worker = client.current
    if (!worker) return
    setChecking(true)
    setPlatinum(null)
    // ⚠️ `File`을 그대로 넘긴다. 바이트를 읽어 넘기면 여기서 128MB가 복사된다 —
    // `File`은 structured clone이 되고 Worker가 필요한 범위만 `slice`한다
    void worker.validate(file, (s) => { say(`Platinum 확인: ${s}`) })
      .then((got) => { setPlatinum(got) })
      .catch((e: unknown) => { say(`Platinum 확인 실패: ${String(e)}`) })
      .finally(() => { setChecking(false) })
  }

  // ⚠️ 이름을 `useDir`로 두면 안 된다 — lint가 훅으로 보고 "콜백 안에서 훅을
  // 부른다"며 선다 (`react-hooks/rules-of-hooks`)
  const scanDir = (input: { handle?: FileSystemDirectoryHandle; files?: File[] }): void => {
    const worker = client.current
    if (!worker) return
    setScanning(true)
    setBdsp(null)
    void worker.scanBdsp(input)
      .then((got) => { setBdsp(got) })
      .catch((e: unknown) => { say(`폴더 확인 실패: ${String(e)}`) })
      .finally(() => { setScanning(false) })
  }

  const pickDirectory = (): void => {
    const open = (window as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker
    if (!open) { dirPicker.current?.click(); return }
    void open()
      .then((handle) => { scanDir({ handle }) })
      // 권한 거부는 오류가 아니라 **취소**다 (IMPORT.md §3)
      .catch(() => { say('폴더 선택을 취소했습니다') })
  }

  const checkStorage = (): void => {
    void storageState().then(async (state) => {
      // 제스처 안에서 요청한다. 승인은 보장이 아니다
      if (!state.persisted) await requestPersist()
      // ⚠️ **요청 뒤에 다시 잰다.** 승인 여부와 할당량이 그 자리에서 바뀐다 —
      // 요청 전 값을 그대로 보여 주면 "안 켜짐"이 계속 떠 있다
      setStorage(await storageState())
    })
  }

  const install = (): void => {
    const worker = client.current
    if (!worker || !platinum?.ok) return
    setPhase('installing')
    setFailure(null)
    setProgress(0)
    setMissing([])
    const signal = { aborted: false }
    abort.current = signal

    // ⚠️ **설치 전에 오래 보관을 청한다.** 이 버튼 클릭이 그 제스처다 — 나중에
    // 부르면 브라우저가 그냥 거절한다. 거절을 실패로 다루지 않는다: 설치는
    // 그대로 하고, 브라우저가 공간을 되찾아 갈 수 있다고 말해 준다
    void requestPersist().then(async () => {
      const got = await storageState()
      setStorage(got)
      say(got.persisted
        ? '오래 보관: 켜졌습니다. 사이트 데이터를 지우기 전에는 설치본이 남습니다'
        : '⚠️ 오래 보관이 안 켜졌습니다. 공간이 모자라면 브라우저가 설치본을 '
          + '되찾아 갈 수 있습니다 — 리포트는 `.rpsave`로 따로 내보내 두세요')
    })

    // Worker가 만들고 메인이 커밋한다 (`worker/client.ts` 머리말)
    const produce: Producer = (spec, hooks) =>
      worker.convert(spec.name, { onProgress: hooks.onProgress })

    void runInstall({
      ...stores(),
      locale: platinum.release.locale,
      groups: GROUPS,
      produce,
      signal,
      onEvent: (e: InstallEvent) => {
        if (e.kind === 'group') { say(`${e.name} (${String(e.index + 1)}/${String(e.total)})`); setProgress(0) }
        if (e.kind === 'progress' && e.total > 0) setProgress(e.done / e.total)
        if (e.kind === 'wrote') say(`  ${e.path} — ${formatBytes(e.bytes)}`)
        if (e.kind === 'resumed') {
          say(`온전한 것 ${String(e.skipped.length)}개는 건너뜁니다`)
          if (e.rebuilt.length > 0) say(`깨진 것 ${String(e.rebuilt.length)}개는 다시 만듭니다: ${e.rebuilt.join(' · ')}`)
        }
        if (e.kind === 'verifying' && e.total > 0) setProgress(e.done / e.total)
        if (e.kind === 'done') setMissing(e.missing)
      },
    })
      .then((manifest) => {
        setPhase('done')
        if (manifest.state === 'ready') {
          say('설치를 마쳤습니다')
          // ⚠️ **다시 켜지 않고** 그 자리에서 OPFS로 갈아 끼운다
          activateInstall(manifest)
          onReady?.()
          return
        }
        say(`설치가 아직 부분입니다 (${manifest.state})`)
      })
      .catch((e: unknown) => {
        // 취소는 오류가 아니다 (IMPORT.md §3)
        if (e instanceof WorkerCancelled || (e as Error).name === 'Cancelled') {
          setPhase('cancelled')
          say('설치를 취소했습니다. 끝난 그룹은 남아 있어 이어서 할 수 있습니다')
          return
        }
        setPhase('failed')
        setFailure(e instanceof Error ? e.message : String(e))
      })
  }

  const wipe = (): void => {
    void clearAssets(stores()).then(() => {
      say('에셋과 설치 기록을 지웠습니다 (리포트는 그대로입니다)')
      setPhase('idle')
      setMissing([])
    })
  }

  const ready = groupsReady()
  const blocked = groupsBlocked()
  const stillMissing = missingRequired(ready.map((g) => g.name))
  // 설치를 시작할 수 있는가. **BDSP와 공간도 조건이다** (§2.3)
  const canInstall = Boolean(
    platinum?.ok && caps.ok && bdsp?.ok && storage?.enough && phase !== 'installing')

  return (
    <div className={css.wrap}>
      <div className={css.sheet}>
        <h1 className={css.title}>에셋 설치</h1>

        <div className={css.banner}>
          {'⚠️ 이 화면은 아직 완성되지 않았습니다.\n'}
          {`Platinum 변환은 ${String(ready.length)}개(${ready.map((g) => g.name).join(' · ')})가 옮겨졌고 `}
          {`${String(blocked.length)}개가 남았습니다. BDSP 변환은 아직 하나도 없습니다.\n`}
          {`게임을 시작하려면 ${String(stillMissing.length)}개가 더 필요합니다 — `}
          {'설치를 끝내도 아직 게임은 시작할 수 없습니다.\n'}
          {'여기서 실제로 도는 것은 입력 검증 · 폴더 판정 · 저장 공간 · '}
          {'Worker 변환 · OPFS 설치와 재개 · 파일별 무결성 검증입니다.'}
        </div>

        <div className={css.body}>
          {'고른 파일은 이 기기 안에서만 읽습니다. 바이트도, 파일 이름도, 폴더 목록도, '}
          {'판정 결과도 서버로 보내지 않습니다. 변환은 전부 브라우저 안에서 일어납니다.\n'}
          {'설치가 끝나면 다음부터는 파일을 다시 고르지 않습니다 — 이 브라우저의 '}
          {'저장 공간에서 바로 엽니다. 원본 파일과 폴더는 설치에 쓰고 놓아 줍니다: '}
          {'경로도 파일 이름도 핸들도 저장하지 않으므로, 설치가 끝난 뒤 원본을 옮기거나 '}
          {'지워도 게임은 그대로 돌아갑니다.\n'}
          {'⚠️ 설치본은 이 브라우저 · 이 기기 · 이 주소에만 있습니다. 다른 브라우저나 '}
          {'다른 기기에서는 다시 설치해야 하고, 주소가 바뀌어도 이어받지 못합니다.\n'}
          {'사이트 데이터를 지우면 설치된 에셋도 함께 사라집니다. 리포트는 '}
          {'`.rpsave` 파일로 따로 내보내 둘 수 있습니다 (타이틀 화면) — 에셋을 다시 '}
          {'설치한 뒤 그 파일로 진행 상태를 되돌립니다.'}
        </div>

        {/* ── 0. 환경 ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>
            환경 확인
            <span className={caps.ok ? css.ok : css.bad}>{caps.ok ? '지원됨' : '지원 안 됨'}</span>
          </div>
          <div className={css.groups}>
            <Line label="보안 컨텍스트 (HTTPS·localhost)" ok={caps.secure} />
            <Line label="OPFS" ok={caps.opfs} />
            <Line label="Worker" ok={caps.worker} note={client.current ? '떠 있음' : ''} />
            <Line
              label="폴더 선택 API"
              ok={caps.directoryPicker}
              note={caps.directoryPicker ? '' : 'webkitdirectory 폴백을 씁니다'}
            />
          </div>
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
              onClick={() => romPicker.current?.click()}
            >
              {checking ? '확인하는 중…' : '이 기기에서 Platinum 선택'}
            </button>
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
              {platinum.ok && `\n설치될 언어: ${platinum.locales.join(' · ')}`
                + `\n파일 ${String(platinum.measured.files)}개 · 오버레이 ${String(platinum.measured.overlays)}개`
                + `\n상점 표: ARM9+${platinum.release.marts.common.arm9RelativeOffset}`
                + ` · ${String(SUPPORTED.martCounts.common)}줄`}
              {!platinum.ok && platinum.detail !== undefined && `\n${platinum.detail}`}
            </div>
          )}
        </section>

        {/* ── 2. BDSP ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>
            ② BDSP 폴더
            <span className={css.stepNote}>이미 추출된 AssetAssistant (또는 그 상위)</span>
          </div>
          <div className={css.row}>
            <button className={css.button} disabled={scanning || !caps.worker} onClick={pickDirectory}>
              {scanning ? '살펴보는 중…' : '이 기기에서 BDSP 폴더 선택'}
            </button>
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
            {'필요합니다 — '}{REQUIRED_BDSP_GROUPS.join(' · ')}
            {'. 폴더를 못 고르면 여기서 멈춥니다. '}
            {'이미 추출된 지원 폴더가 필요합니다.\n'}
            {/* ⚠️ 여기가 사람들이 "그럼 그건 어디서 구하나요"를 묻는 자리다.
                안내하지 않는다는 것을 그 자리에서 말한다 (COPYRIGHT.md §4) */}
            {'파일을 구하는 방법, 콘솔 개조, 키 획득, 복호화, 보호조치 우회는 '}
            {'안내하지 않습니다. 원천 컨테이너나 키를 요구하지도 않습니다.'}
          </div>
          {bdsp && (
            <>
              <div className={`${css.body} ${bdsp.ok ? css.ok : css.bad}`}>
                {bdsp.ok
                  ? `찾았습니다: ${bdsp.root || '(고른 폴더가 뿌리입니다)'}`
                    + `\n파일 ${bdsp.files.toLocaleString()}개 · ${formatBytes(bdsp.bytes)}`
                  : bdsp.why}
              </div>
              {bdsp.groups && (
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
        <section className={css.step}>
          <div className={css.stepHead}>
            ③ 저장 공간
            <span className={css.stepNote}>원본 크기가 아니라 변환 결과 + 임시 여유</span>
          </div>
          <div className={css.row}>
            <button className={css.button} onClick={checkStorage}>공간 확인하고 자리 잡기</button>
          </div>
          {storage && (
            <div className={`${css.body} ${storage.enough ? css.ok : css.bad}`}>
              {storage.measurable
                ? `여유 ${formatBytes(storage.free)} / 전체 ${formatBytes(storage.quota)}`
                  + ` · 필요 ${formatBytes(NEEDED_BYTES)}`
                  + `\n오래 보관: ${storage.persisted ? '켜짐' : '안 켜짐 (브라우저가 정합니다)'}`
                : '이 브라우저는 저장 공간을 알려 주지 않습니다. 설치를 시작하지 않습니다.'}
            </div>
          )}
        </section>

        {/* ── 4. 설치 ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>④ 브라우저 안에서 변환</div>
          <div className={css.row}>
            <button className={css.button} disabled={!canInstall} onClick={install}>
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
            <button className={css.button} disabled={phase === 'installing'} onClick={wipe}>
              에셋 다시 설치 (리포트는 남습니다)
            </button>
          </div>
          {!canInstall && phase !== 'installing' && (
            <div className={css.body}>
              {'설치를 시작하려면 — '}
              {[
                platinum?.ok ? null : 'Platinum 확인',
                bdsp?.ok ? null : 'BDSP 폴더',
                storage?.enough ? null : '저장 공간',
                caps.ok ? null : '브라우저 지원',
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          {phase === 'installing' && (
            <div className={css.bar}>
              <div className={css.barFill} style={{ width: `${String(Math.round(progress * 100))}%` }} />
            </div>
          )}
          {failure !== null && <div className={`${css.body} ${css.bad}`}>{failure}</div>}
          {phase === 'cancelled' && (
            <div className={css.body}>{'취소했습니다. 다시 시작하면 끝난 그룹부터 이어서 합니다.'}</div>
          )}
          {phase === 'done' && missing.length > 0 && (
            <div className={`${css.body} ${css.bad}`}>
              {`옮겨진 그룹은 설치됐지만 ${String(missing.length)}개가 더 필요합니다:\n`}
              {missing.join(' · ')}
            </div>
          )}
          {log.length > 0 && (
            <ul className={css.list}>
              {log.slice(-12).map((line, i) => <li key={`${String(i)}-${line}`}>{line}</li>)}
            </ul>
          )}
        </section>

        {/* ── 남은 일 ─────────────────────────────────────────────── */}
        <section className={css.step}>
          <div className={css.stepHead}>
            아직 안 옮긴 변환
            <span className={css.stepNote}>{`Platinum ${String(blocked.length)}개 · BDSP 전부`}</span>
          </div>
          <ul className={css.list}>
            {blocked.map((g) => <li key={g.name}><b>{g.name}</b> — {g.blockedBy}</li>)}
            <li>
              <b>BDSP {REQUIRED_BDSP_GROUPS.join(' · ')}</b>
              {' — 브라우저에서 Unity 번들을 읽는 코드가 아직 없습니다. '}
              {'개발 추출기는 파이썬(UnityPy·NumPy·Pillow)이라 그대로는 못 부릅니다.'}
            </li>
          </ul>
        </section>

        <div className={css.row}>
          <button className={css.button} onClick={onClose}>타이틀로 돌아가기</button>
        </div>
      </div>
    </div>
  )
}

function Line({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <>
      <span className={ok ? css.ok : css.bad}>{ok ? '●' : '○'}</span>
      <span>{label}</span>
      <span className={css.stepNote}>{note ?? ''}</span>
    </>
  )
}
