// 사용자가 고른 Platinum이 우리가 아는 판인가 (IMPORT.md §5)
//
// 검증 순서가 규칙이다. 싸고 확실한 것부터 본다 — 128MB 파일을 상대로 하는
// 일이라, 아닌 것을 늦게 알수록 사용자가 오래 기다린다:
//
//   ① 크기와 최소 헤더    파일을 한 조각도 안 읽고 걸러지는 것들
//   ② 헤더·FNT·FAT 범위   0x200바이트만 읽으면 안다
//   ③ 지역판 지문         헤더 필드 셋
//   ④ 필수 엔트리         FNT를 걸어야 하니 여기부터 몇 KB
//   ⑤ 표본 NARC 엔트리 수 컨테이너 머리만 읽는다 — 통째로 펴지 않는다
//   ⑥ 만들 수 있는 언어   판정 결과를 그대로 옮긴다
//
// ⚠️ **지문과 파일 목록은 서버로 안 보낸다** (COPYRIGHT.md §2). 판정은 전부
// 이 함수 안에서 끝나고, 화면에 남는 것도 "지원됨/안 됨"과 감지한 지역판뿐이다.
// 지원되지 않는다고 해서 "잘못된 소유권"이라고 말하지 않는다 — 우리가 아는
// 판이 아닐 뿐이다 (IMPORT.md §5 끝).
import table from './supported.json'
import { narcCount, openNds, type ByteSource, type NdsFileSystem } from './nds'

export interface Release {
  gameCode: string
  locale: string
  label: string
  fileCount: number
  messageBanks: number
}

export const SUPPORTED = table as unknown as {
  contractVersion: number
  title: string
  makerCode: string
  sizeBytes: number
  requiredFiles: string[]
  sampleCounts: Record<string, number>
  releases: Release[]
}

export type ValidationStep =
  | 'size' | 'header' | 'release' | 'files' | 'samples'

export type Validation =
  | {
      ok: true
      release: Release
      /** 이 롬으로 만들 수 있는 언어. **하나뿐이다** (IMPORT.md §5) */
      locales: string[]
      fs: NdsFileSystem
      /** 화면에 보여 줄 실측 — 파일 수, 오버레이 수, 표본 엔트리 수 */
      measured: { files: number; overlays: number; samples: Record<string, number> }
    }
  | { ok: false; step: ValidationStep; why: string; detail?: string }

/** 사람이 읽을 안내. 다음에 무엇을 하라는 것까지 적는다 */
export function explain(v: Validation): string {
  if (v.ok) return `${v.release.label} — 지원됩니다`
  switch (v.step) {
    case 'size': return `${v.why} 다른 파일을 선택해 주세요.`
    case 'header': return `${v.why} Pokémon Platinum의 \`.nds\` 파일이 필요합니다.`
    case 'release': return `${v.why} 지원하는 지역판인지 확인해 주세요.`
    case 'files':
    case 'samples': return `${v.why} 지원 계약 ${String(SUPPORTED.contractVersion)}판과 다릅니다.`
  }
}

/**
 * 파일 하나를 검증한다.
 *
 * `onStep`은 진행 표시용이다. 128MB를 상대로 하는 일이라 "지금 무엇을 보고
 * 있는지"가 안 보이면 멈춘 것처럼 느껴진다
 */
export async function validatePlatinum(
  src: ByteSource,
  onStep?: (step: ValidationStep) => void,
): Promise<Validation> {
  onStep?.('size')
  // ① 크기. 롬 하나가 정확히 128MB다 — 잘린 파일과 엉뚱한 파일이 여기서 걸린다
  if (src.size !== SUPPORTED.sizeBytes) {
    return {
      ok: false, step: 'size',
      why: `크기가 다릅니다 (${mb(src.size)} · 필요 ${mb(SUPPORTED.sizeBytes)}).`,
    }
  }

  onStep?.('header')
  const fs = await openNds(src)
  // ② 헤더·FNT·FAT가 파일 안에 있는가
  if (!fs) return { ok: false, step: 'header', why: '헤더나 파일시스템 표가 깨져 있습니다.' }
  if (fs.header.title !== SUPPORTED.title || fs.header.makerCode !== SUPPORTED.makerCode) {
    return {
      ok: false, step: 'header',
      why: '다른 게임입니다.',
      detail: `title=${fs.header.title} maker=${fs.header.makerCode}`,
    }
  }
  if (fs.overlays === 0) {
    return { ok: false, step: 'header', why: '오버레이 표가 없습니다.' }
  }

  onStep?.('release')
  // ③ 지역판 지문
  const release = SUPPORTED.releases.find((r) => r.gameCode === fs.header.gameCode)
  if (!release) {
    return {
      ok: false, step: 'release',
      why: `아직 지원하지 않는 지역판입니다 (${fs.header.gameCode}).`,
    }
  }
  if (fs.files.size !== release.fileCount) {
    return {
      ok: false, step: 'release',
      why: `파일 수가 다릅니다 (${String(fs.files.size)} · 필요 ${String(release.fileCount)}).`,
      detail: '리비전이 다르거나 손댄 롬일 수 있습니다.',
    }
  }

  onStep?.('files')
  // ④ 필수 엔트리
  const missing = SUPPORTED.requiredFiles.filter((p) => !fs.files.has(p))
  if (missing.length > 0) {
    return {
      ok: false, step: 'files',
      why: `있어야 할 파일이 ${String(missing.length)}개 없습니다.`,
      detail: missing.slice(0, 5).join(' · '),
    }
  }

  onStep?.('samples')
  // ⑤ 표본 NARC. **통째로 안 편다** — 머리의 카운트만 본다
  const samples: Record<string, number> = {}
  for (const [path, want] of Object.entries(SUPPORTED.sampleCounts)) {
    const bytes = await fs.read(path)
    const got = bytes ? narcCount(bytes) : null
    if (got === null) {
      return { ok: false, step: 'samples', why: `${path}을(를) 못 읽었습니다.` }
    }
    samples[path] = got
    if (got !== want) {
      return {
        ok: false, step: 'samples',
        why: `${path}의 엔트리 수가 다릅니다 (${String(got)} · 필요 ${String(want)}).`,
      }
    }
  }
  // 지역판마다 다른 것 하나 — 대사 뱅크 수 (DATA.md §4.2.1)
  const msg = await fs.read('/msgdata/pl_msg.narc')
  const banks = msg ? narcCount(msg) : null
  if (banks !== release.messageBanks) {
    return {
      ok: false, step: 'samples',
      why: `대사 뱅크 수가 다릅니다 (${String(banks)} · ${release.locale}는 ${String(release.messageBanks)}).`,
    }
  }
  samples['/msgdata/pl_msg.narc'] = banks

  return {
    ok: true,
    release,
    // ⑥ **이 롬으로 만들 수 있는 언어는 하나다.** 개발 모드에 세 벌이 있다는
    // 이유로 공개판이 세 언어를 기본 제공해서는 안 된다 (IMPORT.md §5)
    locales: [release.locale],
    fs,
    measured: { files: fs.files.size, overlays: fs.overlays, samples },
  }
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(0)}MB`
