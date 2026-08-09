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
// ⚠️ **지금 판은 변환 그룹 하나만 옮겨져 있다** (`platinum/convert.ts`의 표).
// 그 사실을 첫 화면에 적는다 — 감추면 설치를 끝내고도 게임이 안 뜨는 이유를
// 아무도 모른다.
import { useCallback, useRef, useState } from 'react'
import { blobSource } from '../platinum/nds'
import { explain, validatePlatinum, type Validation } from '../platinum/validate'
import { GROUPS, groupsBlocked, groupsReady } from '../platinum/convert'
import {
  fileListDirSource, handleDirSource, scanBdsp, type BdspScan, type DirSource,
} from '../bdsp/scan'
import { formatBytes, NEEDED_BYTES, requestPersist, storageState, type StorageState } from '../install/storage'
import { clearAssets, runInstall, type InstallEvent } from '../install/installer'
import { opfsAvailable, opfsPackStore, OPFS_ROOT } from '../../data/providers/packStore'
import * as css from './importWizard.css'

interface Capability {
  ok: boolean
  secure: boolean
  opfs: boolean
  worker: boolean
  picker: boolean
  directoryPicker: boolean
}

function capabilities(): Capability {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const opfs = opfsAvailable()
  const worker = typeof Worker === 'function'
  const directoryPicker = typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  // 디렉터리 API가 없어도 `<input webkitdirectory>` 폴백이 있다 (IMPORT.md §3)
  return { ok: secure && opfs && worker, secure, opfs, worker, picker: true, directoryPicker }
}

type Phase = 'idle' | 'installing' | 'done' | 'failed'

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const [caps] = useState(capabilities)
  const [platinum, setPlatinum] = useState<Validation | null>(null)
  const [checking, setChecking] = useState(false)
  const [bdsp, setBdsp] = useState<BdspScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [storage, setStorage] = useState<StorageState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const romPicker = useRef<HTMLInputElement>(null)
  const dirPicker = useRef<HTMLInputElement>(null)
  const abort = useRef({ aborted: false })

  const say = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), line])
  }, [])

  const pickPlatinum = (file: File): void => {
    setChecking(true)
    setPlatinum(null)
    void validatePlatinum(blobSource(file), (s) => { say(`Platinum 확인: ${s}`) })
      .then((got) => { setPlatinum(got) })
      .catch((e: unknown) => { say(`Platinum 확인 실패: ${String(e)}`) })
      .finally(() => { setChecking(false) })
  }

  // ⚠️ 이름을 `useDir`로 두면 안 된다 — lint가 훅으로 보고 "콜백 안에서 훅을
  // 부른다"며 선다 (`react-hooks/rules-of-hooks`)
  const scanDir = (dir: DirSource): void => {
    setScanning(true)
    setBdsp(null)
    void scanBdsp(dir)
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
      .then((handle) => { scanDir(handleDirSource(handle)) })
      // 권한 거부는 오류가 아니라 **취소**다 (IMPORT.md §3)
      .catch(() => { say('폴더 선택을 취소했습니다') })
  }

  const checkStorage = (): void => {
    void storageState().then(async (state) => {
      setStorage(state)
      // 제스처 안에서 요청한다. 승인은 보장이 아니다
      if (!state.persisted) await requestPersist()
    })
  }

  const install = (): void => {
    if (!platinum?.ok) return
    abort.current = { aborted: false }
    setPhase('installing')
    setFailure(null)
    setProgress(0)

    const store = opfsPackStore(OPFS_ROOT)
    void runInstall({
      store,
      fs: platinum.fs,
      locale: platinum.release.locale,
      groups: GROUPS,
      signal: abort.current,
      onEvent: (e: InstallEvent) => {
        if (e.kind === 'group') { say(`${e.name} (${String(e.index + 1)}/${String(e.total)})`); setProgress(0) }
        if (e.kind === 'progress' && e.total > 0) setProgress(e.done / e.total)
        if (e.kind === 'wrote') say(`  ${e.path} — ${formatBytes(e.bytes)}`)
        if (e.kind === 'resumed') say(`이미 끝난 것 ${String(e.skipped.length)}개는 건너뜁니다`)
        if (e.kind === 'verifying') say('검증하는 중…')
      },
    })
      .then(() => { setPhase('done'); say('설치를 마쳤습니다') })
      .catch((e: unknown) => {
        setPhase('failed')
        setFailure(e instanceof Error ? e.message : String(e))
      })
  }

  const wipe = (): void => {
    void clearAssets(opfsPackStore(OPFS_ROOT)).then(() => {
      say('에셋과 설치 저널을 지웠습니다 (리포트는 그대로입니다)')
      setPhase('idle')
    })
  }

  const ready = groupsReady()
  const blocked = groupsBlocked()

  return (
    <div className={css.wrap}>
      <div className={css.sheet}>
        <h1 className={css.title}>에셋 설치</h1>

        <div className={css.banner}>
          {'⚠️ 이 화면은 아직 완성되지 않았습니다.\n'}
          {`변환이 옮겨진 그룹은 ${String(ready.length)}개(${ready.map((g) => g.name).join(' · ')})이고, `}
          {`${String(blocked.length)}개가 남아 있습니다. 설치를 끝내도 게임은 아직 시작할 수 없습니다.\n`}
          {'여기서 실제로 도는 것은 입력 검증 · 폴더 판정 · 저장 공간 · OPFS 설치와 재개입니다.'}
        </div>

        <div className={css.body}>
          {'고른 파일은 이 기기 안에서만 읽습니다. 바이트도, 파일 이름도, 폴더 목록도, '}
          {'판정 결과도 서버로 보내지 않습니다. 변환은 전부 브라우저 안에서 일어납니다.'}
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
            <Line label="Worker" ok={caps.worker} />
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
              disabled={checking}
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
              {explain(platinum)}
              {platinum.ok && `\n설치될 언어: ${platinum.locales.join(' · ')}`
                + `\n파일 ${String(platinum.measured.files)}개 · 오버레이 ${String(platinum.measured.overlays)}개`}
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
            <button className={css.button} disabled={scanning} onClick={pickDirectory}>
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
                if (files.length > 0) scanDir(fileListDirSource(files))
              }}
            />
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
            <button
              className={css.button}
              disabled={!platinum?.ok || !caps.ok || phase === 'installing'}
              onClick={install}
            >
              {phase === 'installing' ? '변환하는 중…' : '설치 시작'}
            </button>
            <button
              className={css.button}
              disabled={phase !== 'installing'}
              onClick={() => { abort.current.aborted = true }}
            >
              취소
            </button>
            <button className={css.button} onClick={wipe}>
              에셋 다시 설치 (리포트는 남습니다)
            </button>
          </div>
          {phase === 'installing' && (
            <div className={css.bar}>
              <div className={css.barFill} style={{ width: `${String(Math.round(progress * 100))}%` }} />
            </div>
          )}
          {failure !== null && <div className={`${css.body} ${css.bad}`}>{failure}</div>}
          {phase === 'done' && (
            <div className={`${css.body} ${css.ok}`}>
              {'옮겨진 그룹은 설치됐습니다. 남은 그룹이 끝나야 게임을 시작할 수 있습니다.'}
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
            <span className={css.stepNote}>{`${String(blocked.length)}개`}</span>
          </div>
          <ul className={css.list}>
            {blocked.map((g) => <li key={g.name}><b>{g.name}</b> — {g.blockedBy}</li>)}
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
