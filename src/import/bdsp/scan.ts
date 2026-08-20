// BDSP 폴더 검증 (IMPORT.md §5 "BDSP" · §13-6)
//
// 사용자가 고르는 것은 `AssetAssistant/`이거나 그 위 어딘가다. 앱이 아래로
// 내려가 찾는다. 다만 **이름 하나로 통과시키지 않는다**:
//
// ⚠️ 실측한 구조가 이렇다 (개발 기계 덤프의 `fstree.txt`) — 그룹마다 **색인
// 파일 하나와 같은 이름의 폴더**가 짝을 이룬다:
//
//     AssetAssistant/
//       Battle.bin            ← 색인
//       Battle/               ← 번들이 든 폴더
//         Battle
//         battle_masterdatas
//         btlv/waza/camera/…
//       Pokemon Database.bin
//       Pokemon Database/
//         pokemons/battle/pm0001_00_00 …
//
// 색인만 있고 폴더가 비어 있는 덤프가 실제로 흔하다(중간에 끊긴 추출). 그걸
// 통과시키면 설치를 한참 돌린 뒤에야 "번들이 없다"가 나온다.
//
// ⚠️ **파일 목록과 지문을 서버로 보내지 않는다** (COPYRIGHT.md §2). 판정은 전부
// 여기서 끝나고, 화면에 남는 것은 찾은 상대 경로와 그룹별 있음/없음이다.

/** 폴더 하나를 읽는 길. 핸들이든 `webkitdirectory`든 이 모양으로 감싼다 */
export interface DirEntry {
  /** 고른 폴더 기준 상대 경로 (POSIX) */
  path: string
  size: number
}

export interface DirSource {
  readonly label: string
  list(): Promise<DirEntry[]>
  read(path: string): Promise<Uint8Array | null>
}

/** 필수 논리 그룹 (IMPORT.md §5의 표) */
export const REQUIRED_GROUPS = [
  { name: 'Dpr', why: '맵·게임 설정·모델 연결 표' },
  { name: 'Battle', why: '배틀 표와 모션 타이밍' },
  { name: 'Characters', why: '주인공·NPC·자전거' },
  { name: 'Environments', why: '배틀 무대와 하늘' },
  { name: 'Pokemon Database', why: '포켓몬 배틀 프리팹·메시·텍스처' },
] as const

/**
 * 표본 종. **파일 하나의 존재만 보고 통과시키지 않는다** (IMPORT.md §5 끝).
 *
 * 포켓몬은 프리팹·공용 메시·폼별 텍스처가 여러 번들에 나뉜다. 실측 이름이
 * `pm<종4자리>_<폼2자리>_<번호2자리>`라 종 하나에 최소 두 벌이 있어야 한다
 */
export const SAMPLE_SPECIES = ['pm0387', 'pm0001'] as const

interface GroupState {
  name: string
  why: string
  /** `<그룹>.bin` 색인이 있는가 */
  index: boolean
  /** `<그룹>/` 아래 번들 수 */
  bundles: number
}

export type BdspScan =
  | {
      ok: true
      /** 고른 폴더 기준, 찾은 `AssetAssistant`의 상대 경로 (뿌리면 빈 글자) */
      root: string
      groups: GroupState[]
      /** 표본 종마다 찾은 번들 수 */
      samples: Record<string, number>
      files: number
      bytes: number
    }
  | {
      ok: false
      reason: 'no-root' | 'missing-groups' | 'empty-groups' | 'no-samples'
      why: string
      /** 찾았다면 어디서 찾았는지. 화면이 이걸 보여 준다 */
      root?: string
      groups?: GroupState[]
    }

const ASSET_ASSISTANT = 'assetassistant'

/**
 * 고른 폴더 아래에서 `AssetAssistant`를 찾는다.
 *
 * ⚠️ **이름으로 찾지 않는다.** 한때 경로에 `AssetAssistant`가 들어 있는지만 봤는데,
 * 사용자가 그 폴더를 **직접** 고르면 상대 경로에 그 이름이 안 나온다 — 제대로 된
 * 덤프를 골라 놓고 "AssetAssistant를 못 찾았습니다"가 떴다. 그래서 **내용**으로
 * 찾는다: 그룹 색인 `<이름>.bin`이 전부 한 폴더에 모여 있으면 거기가 뿌리다.
 * 이름이 무엇이든, 몇 겹 아래에 있든, 뿌리 자신이든 같은 길로 잡힌다.
 *
 * 덤으로 **재배치한 폴더가 저절로 걸러진다** — 필요한 것만 골라 다른 이름으로
 * 옮겨 둔 사본에는 색인이 없다.
 *
 * 여럿이면 얕은 쪽, 같은 깊이면 이름이 `AssetAssistant`인 쪽이다. 덤프를 두 번
 * 겹쳐 둔 폴더에서 깊은 쪽을 잡으면 사용자가 왜 그게 골라졌는지 알 수 없다
 */
export function findRoot(entries: readonly DirEntry[]): string | null {
  const need = REQUIRED_GROUPS.map((g) => `${g.name.toLowerCase()}.bin`)
  const byDir = new Map<string, Set<string>>()
  for (const e of entries) {
    const cut = e.path.lastIndexOf('/')
    const name = e.path.slice(cut + 1).toLowerCase()
    if (!need.includes(name)) continue
    const dir = cut < 0 ? '' : e.path.slice(0, cut)
    let has = byDir.get(dir)
    if (!has) { has = new Set(); byDir.set(dir, has) }
    has.add(name)
  }
  if (byDir.size === 0) return null
  // 하나라도 빠진 덤프도 뿌리로는 잡는다 — 무엇이 빠졌는지 이름으로 말해 주려는
  // 것이다. 색인이 아예 없으면 뿌리가 아니다
  const best = Math.max(...[...byDir.values()].map((s) => s.size))
  const roots = [...byDir].filter(([, has]) => has.size === best).map(([dir]) => dir)
  const depth = (p: string): number => (p === '' ? 0 : p.split('/').length)
  const named = (p: string): number => (p.split('/').pop()?.toLowerCase() === ASSET_ASSISTANT ? 0 : 1)
  return roots.sort((a, b) => depth(a) - depth(b) || named(a) - named(b) || a.localeCompare(b))[0]!
}

const under = (path: string, root: string): string | null => {
  if (root === '') return path
  const prefix = `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : null
}

export async function scanBdsp(dir: DirSource): Promise<BdspScan> {
  const entries = await dir.list()

  // 뿌리를 못 찾으면 **원천 컨테이너나 키를 요구하지 않는다** — "이미 추출된
  // 지원 폴더가 필요하다"에서 멈춘다 (COPYRIGHT.md §4)
  const root = findRoot(entries)
  if (root === null) {
    return {
      ok: false, reason: 'no-root',
      why: '이 폴더 아래에서 AssetAssistant를 못 찾았습니다. '
        + '이미 추출된 지원 폴더가 필요합니다. '
        + 'AssetAssistant 폴더 자체를 골라도 되고, 그 위 아무 폴더를 골라도 됩니다.',
    }
  }

  const inside: DirEntry[] = []
  for (const e of entries) {
    const rel = under(e.path, root)
    if (rel !== null && rel !== '') inside.push({ path: rel, size: e.size })
  }

  const groups: GroupState[] = REQUIRED_GROUPS.map(({ name, why }) => {
    const lower = name.toLowerCase()
    const index = inside.some((e) => e.path.toLowerCase() === `${lower}.bin`)
    const bundles = inside.filter((e) => e.path.toLowerCase().startsWith(`${lower}/`)).length
    return { name, why, index, bundles }
  })

  const noIndex = groups.filter((g) => !g.index)
  if (noIndex.length > 0) {
    return {
      ok: false, reason: 'missing-groups', root, groups,
      why: `필요한 묶음이 ${String(noIndex.length)}개 없습니다 — `
        + noIndex.map((g) => `${g.name}.bin`).join(' · '),
    }
  }

  // ⚠️ 색인만 있고 폴더가 빈 덤프가 흔하다(중간에 끊긴 추출). 통과시키면
  // 설치를 한참 돌린 뒤에야 "번들이 없다"가 나온다
  const empty = groups.filter((g) => g.bundles === 0)
  if (empty.length > 0) {
    return {
      ok: false, reason: 'empty-groups', root, groups,
      why: `색인은 있는데 번들이 없는 묶음이 있습니다 — ${empty.map((g) => g.name).join(' · ')}. `
        + '추출이 중간에 끊겼을 수 있습니다.',
    }
  }

  // 표본 종. 프리팹·메시·텍스처가 여러 번들에 나뉘므로 한 종에 여러 벌이 있어야 한다
  const samples: Record<string, number> = {}
  for (const species of SAMPLE_SPECIES) {
    samples[species] = inside.filter((e) => e.path.includes(species)).length
  }
  const thin = Object.entries(samples).filter(([, n]) => n < 2)
  if (thin.length > 0) {
    return {
      ok: false, reason: 'no-samples', root, groups,
      why: `표본 종의 번들이 모자랍니다 — ${thin.map(([s, n]) => `${s}:${String(n)}`).join(' · ')}. `
        + '포켓몬 번들이 빠진 추출로 보입니다.',
    }
  }

  return {
    ok: true,
    root,
    groups,
    samples,
    files: inside.length,
    bytes: inside.reduce((a, e) => a + e.size, 0),
  }
}

// ── 폴더 원본 셋 ─────────────────────────────────────────────────────────────

/**
 * `showDirectoryPicker()`가 준 핸들.
 *
 * ⚠️ 수만 개 엔트리를 걷는다. 목록을 한 번 만들고 들고 있는다 — 그룹마다 다시
 * 걸으면 같은 폴더를 다섯 번 훑는다
 */
export function handleDirSource(handle: FileSystemDirectoryHandle): DirSource {
  let listed: Promise<DirEntry[]> | null = null

  const walk = async (dir: FileSystemDirectoryHandle, at: string): Promise<DirEntry[]> => {
    const out: DirEntry[] = []
    for await (const [name, child] of (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    }).entries()) {
      const rel = at ? `${at}/${name}` : name
      if (child.kind === 'directory') {
        out.push(...await walk(child as FileSystemDirectoryHandle, rel))
        continue
      }
      const file = await (child as FileSystemFileHandle).getFile()
      out.push({ path: rel, size: file.size })
    }
    return out
  }

  return {
    label: handle.name,
    list() { listed ??= walk(handle, ''); return listed },
    async read(path) {
      const parts = path.split('/')
      const name = parts.pop()
      if (name === undefined) return null
      let at = handle
      try {
        for (const part of parts) at = await at.getDirectoryHandle(part)
        const file = await (await at.getFileHandle(name)).getFile()
        return new Uint8Array(await file.arrayBuffer())
      } catch { return null }
    },
  }
}

/**
 * `<input type="file" webkitdirectory>` 폴백.
 *
 * ⚠️ **브라우저를 닫으면 이 핸들은 다시 못 연다.** 중단 후 재개할 때 같은
 * 폴더를 다시 고르게 될 수 있다 (IMPORT.md §3) — 이미 OPFS에 완성된 청크는
 * 다시 만들지 않으므로 손해는 폴더를 한 번 더 고르는 것뿐이다
 */
export function fileListDirSource(files: readonly File[], label = '선택한 폴더'): DirSource {
  const rel = (f: File) => {
    const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name
    // 첫 칸은 고른 폴더 자신이다. 떼면 핸들 쪽과 같은 상대 경로가 된다
    const cut = p.indexOf('/')
    return cut < 0 ? p : p.slice(cut + 1)
  }
  const byPath = new Map(files.map((f) => [rel(f), f]))
  return {
    label,
    list: () => Promise.resolve([...byPath].map(([path, f]) => ({ path, size: f.size }))),
    async read(path) {
      const f = byPath.get(path)
      return f ? new Uint8Array(await f.arrayBuffer()) : null
    },
  }
}

/** 시험·스파이크용 */
export function memoryDirSource(files: Record<string, number>, label = 'memory'): DirSource {
  return {
    label,
    list: () => Promise.resolve(Object.entries(files).map(([path, size]) => ({ path, size }))),
    read: (path) => Promise.resolve(path in files ? new Uint8Array(files[path]!) : null),
  }
}
