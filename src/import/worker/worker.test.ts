// Import Worker — 진짜 메시지 경계를 지나간다 (IMPORT.md §6 · §14 완료 조건)
//
// ⚠️ **변환 함수를 직접 부르는 시험은 이 경계를 하나도 안 잰다.** 여기서 깨지는
// 것들은 함수 호출로는 절대 안 나온다:
//
//   · `NdsFileSystem`을 그대로 보내려다 `DataCloneError` — 함수는 복제가 안 된다
//   · transferable로 넘긴 뒤 원본 버퍼가 분리(detach)되는 것
//   · 취소한 작업의 늦은 응답이 새 작업 것으로 보이는 것
//
// 그래서 `MessageChannel`의 두 끝에 **진짜 핸들러와 진짜 클라이언트**를 붙인다.
// 스레드는 아니지만 직렬화·전송 목록·비동기 순서는 브라우저와 같은 길이다.
// 스레드 자체(`new Worker(new URL(…), { type: 'module' })`)는 아래 마지막
// describe가 소스로 확인하고, 실제 기동은 `pnpm shot`이 크로미움에서 잰다.
import { describe, expect, it, beforeAll } from 'vitest'
import { openAsBlob } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MessageChannel } from 'node:worker_threads'
import { createImportWorker } from './handler'
import { attachImportClient, WorkerCancelled, type ImportClient } from './client'
import type { Port } from './protocol'
import { DATA, romPath, withRom } from '../../data/romData.testkit'

const SRC = resolve(__dirname)

/**
 * 진짜 포트 한 쌍에 양쪽을 붙인다.
 *
 * ⚠️ 노드의 `MessagePort`는 `addEventListener`를 쓰면 **`start()`를 불러야**
 * 메시지가 흐른다. 안 부르면 시험이 조용히 타임아웃한다
 */
function pair(): { client: ImportClient; close: () => void } {
  const { port1, port2 } = new MessageChannel()
  createImportWorker(port2 as unknown as Port)
  port1.start()
  port2.start()
  const client = attachImportClient(
    port1 as unknown as Parameters<typeof attachImportClient>[0],
    () => { port1.close(); port2.close() },
  )
  return { client, close: () => { client.close() } }
}

withRom('en')('Worker 경계', () => {
  let rom: Blob

  beforeAll(async () => {
    // ⚠️ `readFileSync`로 128MB를 올리지 않는다. `openAsBlob`은 파일을 붙들기만
    // 하고 `slice()`할 때 읽는다 — 브라우저의 `File`과 같은 성질이다
    rom = await openAsBlob(romPath('en')!)
  })

  it('검증 결과가 포트를 건너온다 — fs는 안 건너온다', async () => {
    const { client, close } = pair()
    try {
      const steps: string[] = []
      const report = await client.validate(rom, (s) => steps.push(s))
      expect(report.ok).toBe(true)
      if (!report.ok) return
      expect(report.release.gameCode).toBe('CPUE')
      expect(report.locales).toEqual(['en'])
      expect(report.measured.files).toBe(340)
      // ⚠️ `fs`가 딸려 오면 `DataCloneError`로 여기까지 못 온다. 안 온다는 것이
      // 이 시험의 절반이다
      expect((report as unknown as { fs?: unknown }).fs).toBeUndefined()
      // 진행 단계가 실제로 여러 번 온다
      expect(steps.length).toBeGreaterThan(3)
    } finally { close() }
  })

  it('변환 결과가 transferable로 건너오고 노드 산출물과 같다', async () => {
    const { client, close } = pair()
    try {
      await client.validate(rom)
      const wrote: string[] = []
      let lastTotal = 0
      const produced = await client.convert('moves', {
        onProgress: (_d, t) => { lastTotal = t },
        onWrote: (p) => wrote.push(p),
      })
      expect(wrote).toEqual(['data/moves.json', 'data/names/moves.en.json'])
      expect(lastTotal).toBeGreaterThan(0)
      const bytes = produced.get('data/moves.json')!
      const text = new TextDecoder().decode(bytes)
      // 포트를 건너온 바이트가 노드 산출물과 같다 — 경계가 아무것도 안 바꿨다
      expect(text).toBe(readFileSync(resolve(DATA, 'moves.json'), 'utf8'))
    } finally { close() }
  })

  it('ARM9를 짚는 그룹도 포트를 건너간다', async () => {
    const { client, close } = pair()
    try {
      await client.validate(rom)
      const produced = await client.convert('marts')
      const text = new TextDecoder().decode(produced.get('data/marts.json')!)
      expect(text).toBe(readFileSync(resolve(DATA, 'marts.json'), 'utf8'))
    } finally { close() }
  })

  it('⚠️ 취소는 오류가 아니라 취소다', async () => {
    const { client, close } = pair()
    try {
      await client.validate(rom)
      const running = client.convert('moves', { onProgress: () => { client.cancel() } })
      await expect(running).rejects.toBeInstanceOf(WorkerCancelled)
    } finally { close() }
  })

  it('취소한 뒤에도 다음 작업이 돈다 — 늦은 응답에 안 섞인다', async () => {
    const { client, close } = pair()
    try {
      await client.validate(rom)
      await expect(client.convert('moves', { onProgress: () => { client.cancel() } }))
        .rejects.toBeInstanceOf(WorkerCancelled)
      // 새 작업은 새 번호다. 옛 작업의 늦은 `produced`가 여기 안 들어와야 한다
      const produced = await client.convert('moves')
      expect([...produced.keys()]).toEqual(['data/moves.json', 'data/names/moves.en.json'])
    } finally { close() }
  })

  it('검증 전에 변환하면 이유가 있는 오류다', async () => {
    const { client, close } = pair()
    try {
      await expect(client.convert('moves')).rejects.toThrow(/먼저 Platinum/)
    } finally { close() }
  })

  it('안 옮긴 그룹은 그렇다고 말한다', async () => {
    const { client, close } = pair()
    try {
      await client.validate(rom)
      await expect(client.convert('chunks')).rejects.toThrow(/아직 안 옮긴/)
    } finally { close() }
  })
})

describe('협조하지 않는 스레드', () => {
  // ⚠️ 협조적 취소는 **원리적으로 보장이 아니다.** 숨을 안 쉬는 루프가 하나만
  // 들어와도 취소 버튼이 먹통이 되고, 그때 사용자에게 남는 수단이 탭을 닫는
  // 것뿐이면 안 된다. 그래서 대답 없는 스레드를 끊는 갈래를 따로 잰다.
  //
  // 대답 없는 Worker를 흉내내는 법: 포트 반대쪽에 핸들러를 안 붙인다
  function deaf(): { client: ImportClient; killed: () => number } {
    const { port1, port2 } = new MessageChannel()
    port1.start()
    let kills = 0
    const client = attachImportClient(
      port1 as unknown as Parameters<typeof attachImportClient>[0],
      () => { port1.close(); port2.close() },
      () => { kills += 1; port1.close(); port2.close() },
    )
    return { client, killed: () => kills }
  }

  it('대답이 없으면 스레드를 끊고 취소로 접는다', async () => {
    const { client, killed } = deaf()
    const running = client.convert('moves')
    client.cancel({ hardAfterMs: 10 })
    await expect(running).rejects.toBeInstanceOf(WorkerCancelled)
    expect(killed(), '끊지 않았다').toBe(1)
    expect(client.dead).toBe(true)
  })

  it('끊긴 클라이언트는 그렇다고 말한다 — 조용히 매달리지 않는다', async () => {
    const { client } = deaf()
    const running = client.convert('moves')
    client.cancel({ hardAfterMs: 10 })
    await expect(running).rejects.toBeInstanceOf(WorkerCancelled)
    await expect(client.validate(new Blob([new Uint8Array(4)]))).rejects.toThrow(/다시 골라/)
  })
})

describe('Worker 기동 배선', () => {
  // ⚠️ 여기서 소스를 읽는 것은 **경로가 조용히 썩는 것**을 막으려는 것이다.
  // `importWorker.ts`의 이름을 바꾸면 vite가 청크를 못 만들고, 그 실패는
  // 브라우저를 실제로 열기 전에는 안 보인다
  it('실제 module Worker를 띄운다', () => {
    const text = readFileSync(resolve(SRC, 'client.ts'), 'utf8')
    expect(text).toContain("new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })")
  })

  it('진입점이 핸들러를 self에 붙인다', () => {
    const text = readFileSync(resolve(SRC, 'importWorker.ts'), 'utf8')
    expect(text).toContain('createImportWorker(self')
  })

  it('진입점이 실제로 있다 — 이름이 갈리면 청크가 안 만들어진다', () => {
    expect(() => readFileSync(resolve(SRC, 'importWorker.ts'))).not.toThrow()
  })
})
