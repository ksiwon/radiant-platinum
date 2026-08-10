// 한 번 설치하면 다시 안 고른다 (IMPORT.md §15)
//
// 재는 것은 셋이다: **판이 서로 안 얽히는가**, **도장 없이는 완료가 아닌가**,
// **낡아도 낡은 그룹만 다시 만드는가**.
import { describe, it, expect } from 'vitest'
import {
  ASSET_FORMAT, MIGRATIONS, groupFormat, migrationFor, needsSource, planAssets,
} from './assetFormat'
import { CONTRACT_VERSION, InstallManifestSchema } from './manifestSchema'
import { installReady, runInstall, INSTALL_FILE, type InstallStores } from './installer'
import { memoryPackStore } from '../../data/providers/packStore'
import { REQUIRED_GROUPS } from './required'
import type { GroupSpec } from '../platinum/convert'

const encoder = new TextEncoder()

function stores(): InstallStores {
  return { root: memoryPackStore(), assets: memoryPackStore() }
}

/** 필수 그룹을 전부 굽는 인공 변환기 */
function allGroups(): GroupSpec[] {
  return REQUIRED_GROUPS.map((name) => ({
    name,
    outputs: [`data/${name}.json`],
    converter: 1,
    convert: () => Promise.resolve(new Map([[`data/${name}.json`, encoder.encode(`{"g":"${name}"}`)]])),
  }))
}

async function install(): Promise<InstallStores> {
  const s = stores()
  const groups = allGroups()
  await runInstall({
    ...s, locale: 'ko', groups, produce: (spec, hooks) => spec.convert!({
      fs: null as never, release: null as never, locale: 'ko', onProgress: hooks.onProgress,
    }),
  })
  return s
}

const read = async (s: InstallStores) =>
  InstallManifestSchema.parse(JSON.parse(new TextDecoder().decode((await s.root.read(INSTALL_FILE))!)))

describe('판이 넷이고 서로 안 얽힌다', () => {
  it('기록의 모양과 산출물의 모양은 다른 판이다', () => {
    // 하나로 뭉치면 기록에 필드 하나 늘 때마다 사용자의 600MB가 날아간다
    expect(CONTRACT_VERSION).toBe(3)
    expect(ASSET_FORMAT).toBe(1)
  })

  it('앱 판·빌드 신원은 기록만 하고 호환 판정에 안 쓴다', async () => {
    const s = await install()
    const manifest = await read(s)
    expect(manifest.commit?.appVersion).toBeTruthy()
    expect(manifest.commit?.buildId).toBeTruthy()

    // 빌드가 바뀐 척해도 설치는 그대로 쓴다
    const moved = { ...manifest, commit: { ...manifest.commit!, buildId: '다른커밋', appVersion: '9.9.9' } }
    await s.root.write(INSTALL_FILE, encoder.encode(JSON.stringify(moved)))
    expect(await installReady(s.root)).not.toBeNull()
  })
})

describe('도장', () => {
  it('설치가 끝나면 찍힌다', async () => {
    const manifest = await read(await install())
    expect(manifest.state).toBe('ready')
    expect(manifest.commit?.assetFormat).toBe(ASSET_FORMAT)
    expect(manifest.groups.moves?.format).toBe(groupFormat('moves'))
  })

  it('⚠️ 도장이 없으면 ready라고 적혀 있어도 완료가 아니다', async () => {
    const s = await install()
    const unstamped: Record<string, unknown> = { ...(await read(s)) }
    delete unstamped.commit
    await s.root.write(INSTALL_FILE, encoder.encode(JSON.stringify(unstamped)))
    // 마지막 검증 전에 죽은 설치가 "준비 완료"로 남는 자리를 막는다
    expect(await installReady(s.root)).toBeNull()
  })

  it('다시 설치를 시작하면 도장이 먼저 지워진다', async () => {
    const s = await install()
    // 멀쩡하면 다시 만들 그룹이 없어서 변환기가 아예 안 돈다 — 그것도 계약의
    // 일부다. 도장 지우기를 보려면 다시 만들 것이 하나는 있어야 한다
    await s.assets.write('data/moves.json', new Uint8Array(0))
    let seen: boolean | null = null
    await runInstall({
      ...s, locale: 'ko', groups: allGroups(),
      produce: async (spec, hooks) => {
        // 첫 그룹을 만드는 시점에 이미 도장이 없어야 한다
        seen ??= (await read(s)).commit !== undefined
        return spec.convert!({ fs: null as never, release: null as never, locale: 'ko', onProgress: hooks.onProgress })
      },
    })
    expect(seen).toBe(false)
  })
})

describe('낡으면 낡은 그룹만', () => {
  it('판이 같으면 전부 그대로 쓴다', () => {
    const plan = planAssets({ moves: { format: 1 }, marts: { format: 1 } })
    expect(plan.reuse.sort()).toEqual(['marts', 'moves'])
    expect(needsSource(plan)).toBe(false)
  })

  it('판이 없는 옛 기록은 1로 읽는다', () => {
    expect(planAssets({ moves: {} }).reuse).toEqual(['moves'])
  })

  it('⚠️ 하나가 낡았다고 나머지를 버리지 않는다', () => {
    const plan = planAssets({ moves: { format: 1 }, marts: { format: 99 } })
    expect(plan.reuse).toEqual(['moves'])
    expect(plan.regenerate).toEqual([{ group: 'marts', from: 99, to: 1 }])
    expect(needsSource(plan)).toBe(true)
  })

  it('원본 없이 옮길 길이 있으면 재선택을 안 요구한다', async () => {
    // ⚠️ 지금 진짜 migration은 하나도 없다 — 판을 올린 적이 없으니 옮길 것도
    // 없다. 길이 실제로 도는지만 인공으로 확인한다
    expect(Object.keys(MIGRATIONS)).toEqual([])
    expect(migrationFor('moves', 1)).toBeNull()

    const fake = { moves: { 0: async () => new Map() } }
    const withPath = (installed: Record<string, { format?: number }>) => {
      const plan = { reuse: [] as string[], migrate: [] as { group: string, from: number }[], regenerate: [] as unknown[] }
      for (const [group, r] of Object.entries(installed)) {
        const from = r.format ?? 1
        if (from === groupFormat(group)) plan.reuse.push(group)
        else if (fake[group as 'moves']?.[from as 0]) plan.migrate.push({ group, from })
        else plan.regenerate.push({ group, from })
      }
      return plan
    }
    const plan = withPath({ moves: { format: 0 } })
    expect(plan.migrate).toEqual([{ group: 'moves', from: 0 }])
    expect(plan.regenerate).toEqual([])
  })

  it('낡아서 원본이 필요하면 설치본을 그대로 못 쓴다', async () => {
    const s = await install()
    const manifest = await read(s)
    manifest.groups.moves!.format = 99
    await s.root.write(INSTALL_FILE, encoder.encode(JSON.stringify(manifest)))
    expect(await installReady(s.root)).toBeNull()
  })
})

describe('설치 기록이 원본을 안 기억한다', () => {
  it('파일 이름·경로·핸들을 담을 자리가 없다', async () => {
    const manifest = await read(await install())
    // ⚠️ 필드 목록을 못 박는다. 나중에 누가 `sourceFile`을 넣으면 여기서 걸린다
    expect(Object.keys(manifest).sort()).toEqual([
      'assetFormat', 'availableLocales', 'commit', 'contractVersion', 'finishedAt',
      'groups', 'platinumLocale', 'startedAt', 'state',
    ])
    // 기록 전체를 글자로 훑어도 롬 냄새가 안 나야 한다
    const text = JSON.stringify(manifest)
    expect(text).not.toMatch(/\.nds|romfs|AssetAssistant|FileSystemFileHandle/i)
  })
})
