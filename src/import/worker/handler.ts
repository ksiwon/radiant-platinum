// Worker가 실제로 하는 일 (IMPORT.md §6)
//
// 스레드에 묶여 있지 않다 — `Port` 하나만 받는다. `importWorker.ts`가 그것을
// `self`에 붙이고, 시험은 `MessageChannel`의 두 끝에 붙인다. **같은 코드가
// 진짜 structured clone과 진짜 transferable을 지나간다** — 변환 함수를 직접
// 부르는 시험은 그 경계를 하나도 안 재기 때문에 이렇게 나눴다.
import { blobSource, type NdsFileSystem } from '../platinum/nds'
import { validatePlatinum, type Release } from '../platinum/validate'
import { Cancelled, type BdspSource, type ConvertContext } from '../platinum/convert'
import { groupSpec } from '../groups'
import { fileListDirSource, handleDirSource, scanBdsp, type DirSource } from '../bdsp/scan'
import { describeError, type FromWorker, type JobId, type Port, type ToWorker } from './protocol'

interface Held {
  fs: NdsFileSystem
  release: Release
  locale: string
}

/**
 * 고른 BDSP 폴더를 뿌리 기준으로 다시 재는 껍데기.
 *
 * ⚠️ **뿌리 차이를 그룹마다 다루게 두지 않는다.** 사용자는 `AssetAssistant`를
 * 직접 고를 수도, 그 위 아무 폴더를 고를 수도 있다 (`scan.ts`). 그 차이는
 * 여기서 한 번만 흡수한다
 */
export function rootedBdspSource(dir: DirSource, root: string): BdspSource {
  const prefix = root === '' ? '' : `${root}/`
  return {
    async list() {
      const out: string[] = []
      for (const e of await dir.list()) {
        if (prefix === '') { out.push(e.path); continue }
        if (e.path.startsWith(prefix)) out.push(e.path.slice(prefix.length))
      }
      return out
    },
    read: (path) => dir.read(prefix + path),
  }
}

export function createImportWorker(port: Port): void {
  /** 검증이 만든 파일시스템. 함수를 품고 있어서 못 보낸다 — 여기 남는다 */
  let held: Held | null = null
  /** 판정을 지난 BDSP 폴더. 스캔이 성공했을 때만 남는다 */
  let bdsp: BdspSource | null = null
  /** 취소된 작업. 늦게 도착한 명령이 이걸 본다 */
  const cancelled = new Set<JobId>()

  const send = (msg: FromWorker, transfer?: Transferable[]): void => {
    port.postMessage(msg, transfer)
  }

  const signalFor = (job: JobId) => ({ get aborted() { return cancelled.has(job) } })

  async function validate(job: JobId, file: Blob): Promise<void> {
    // ⚠️ 파일을 통째로 안 읽는다. `blobSource`가 필요한 범위만 `slice`한다 —
    // 128MB를 메모리에 올리면 Worker 하나가 그만큼 물고 시작한다
    const got = await validatePlatinum(blobSource(file), (step) => { send({ kind: 'step', job, step }) })
    if (!got.ok) { held = null; send({ kind: 'validated', job, report: got }); return }
    held = { fs: got.fs, release: got.release, locale: got.release.locale }
    send({
      kind: 'validated',
      job,
      // `fs`를 뺀다. 함수는 clone이 안 된다
      report: { ok: true, release: got.release, locales: got.locales, measured: got.measured },
    })
  }

  async function convert(job: JobId, group: string): Promise<void> {
    if (!held) throw new Error('먼저 Platinum을 확인해야 합니다')
    const spec = groupSpec(group)
    // ⚠️ **모르는 이름과 안 옮긴 그룹을 갈라 말한다.** 한때 둘이 같은 문장이었고,
    // 그래서 그룹 이름을 오타 낸 것과 아직 못 만드는 것이 화면에서 구별이 안 됐다
    if (!spec) throw new Error(`${group}: 그런 그룹이 없습니다`)
    if (!spec.convert) throw new Error(`${group}: 아직 안 옮긴 변환입니다 — ${spec.blockedBy ?? ''}`)

    // ⚠️ **전송 뒤 이 버퍼는 분리된다.** 그래서 자기 몫만 잘라 새 버퍼로
    // 만들어 넘긴다 — 여러 산출물이 한 버퍼를 나눠 쓰는 날 첫 전송이 나머지를
    // 다 죽인다
    const emit = (path: string, data: Uint8Array): void => {
      const owned = new Uint8Array(data).buffer
      send({ kind: 'produced', job, group, path, bytes: owned }, [owned])
    }

    const ctx: ConvertContext = {
      fs: held.fs,
      locale: held.locale,
      release: held.release,
      bdsp: bdsp ?? undefined,
      // 모델 그룹은 580MB를 만든다. 모아 뒀다가 넘기면 탭이 죽는다
      emit,
      signal: signalFor(job),
      onProgress: (done, total) => { send({ kind: 'progress', job, done, total }) },
    }
    const produced = await spec.convert(ctx)

    // `emit`을 안 쓴 그룹(플래티넘 쪽)은 Map으로 돌려준다
    for (const [path, data] of produced) emit(path, data)
    send({ kind: 'converted', job, group })
  }

  port.addEventListener('message', (e) => {
    const msg = e.data as ToWorker
    if (msg.kind === 'cancel') { cancelled.add(msg.job); return }
    // 이미 취소된 작업의 늦은 명령은 무시한다
    if (cancelled.has(msg.job)) return

    const run = async (): Promise<void> => {
      switch (msg.kind) {
        case 'validate': return validate(msg.job, msg.file)
        case 'scanBdsp': {
          const dir = msg.handle
            ? handleDirSource(msg.handle)
            : fileListDirSource(msg.files ?? [])
          const scan = await scanBdsp(dir)
          // ⚠️ **판정을 지난 폴더만 들고 있는다.** 못 지난 것을 남겨 두면
          // 다음 `convert`가 그 폴더로 돌다가 한참 뒤에 죽는다
          bdsp = scan.ok ? rootedBdspSource(dir, scan.root) : null
          send({ kind: 'scanned', job: msg.job, scan })
          return
        }
        case 'convert': return convert(msg.job, msg.group)
      }
    }

    void run().catch((err: unknown) => {
      if (err instanceof Cancelled || cancelled.has(msg.job)) {
        send({ kind: 'cancelled', job: msg.job })
        return
      }
      send({ kind: 'failed', job: msg.job, ...describeError(err) })
    })
  })
}
