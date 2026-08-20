// 파일로 내보내기 (IMPORT.md §10)
//
// ⚠️ **브라우저가 다운로드를 시작했는지까지만 알 수 있다.** 사용자가 받았는지,
// 어디에 저장했는지, 심지어 정말 저장됐는지는 페이지가 알 길이 없다. 그래서
// 이 모듈은 "성공"이 아니라 **"시작했다/못 했다"**를 돌려준다.
//
// 그 구분이 화면 문구를 정한다: 내부 리포트 성공과 파일 백업 성공을 **따로**
// 보여 주고, 못 시작했으면 "백업 파일 받기" 버튼을 남긴다. 둘을 하나로 묶으면
// 다운로드가 막혔을 때 리포트까지 실패한 것처럼 보인다.
import { PORTABLE_EXT, serializePortable, type PortableSave } from './portable'

export type DownloadOutcome =
  | { started: true }
  | { started: false; why: 'no-dom' | 'blocked'; detail?: string }

/**
 * 파일 이름 (IMPORT.md §10).
 *
 *     radiant-platinum_<주인공>_<YYYY-MM-DD_HH-mm-ss>.rpsave
 *
 * ⚠️ 시각은 **그 기계의 시각**이다. UTC로 적으면 사용자가 언제 저장한 것인지
 * 못 알아본다 — 파일을 고르는 사람이 보는 것은 자기 시계다
 */
export function saveFileName(trainer: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${String(at.getFullYear())}-${p(at.getMonth() + 1)}-${p(at.getDate())}`
    + `_${p(at.getHours())}-${p(at.getMinutes())}-${p(at.getSeconds())}`
  return `radiant-platinum_${safeName(trainer)}_${stamp}${PORTABLE_EXT}`
}

/** 경로 구분자와 Windows 예약 문자. 여기 없는 글자는 파일 이름에 남는다 */
const UNSAFE = '\\/:*?"<>|.'

/**
 * 파일 이름으로 쓸 수 없는 글자를 걷어낸다.
 *
 * ⚠️ 한글은 그대로 둔다 — 주인공 이름이 한글인 것이 기본이고, 그걸 지우면
 * 파일이 전부 `radiant-platinum__2026-…`이 되어 서로 구별이 안 된다.
 * 막을 것은 경로 구분자와 Windows 예약 문자뿐이다
 */
function safeName(name: string): string {
  // 정규식 문자 클래스로 쓰면 경계가 범위로 읽히는 자리다 — 실제로 제어문자 두 개가
  // 그렇게 섞여 들어갔다. 글자마다 보는 편이 무엇을 막는지 그대로 보인다
  const cleaned = [...name]
    .filter((c) => (c.codePointAt(0) ?? 0) > 0x1f && !UNSAFE.includes(c) && c.trim() !== '')
    .join('')
  return cleaned.slice(0, 24) || '이름없음'
}

/**
 * 봉투를 파일로 내려 준다.
 *
 * ⚠️ **`URL.revokeObjectURL`을 같은 프레임에 부르면 안 된다.** 클릭이 큐에
 * 들어간 직후 주소를 거두면 브라우저에 따라 빈 파일이 받아진다. 한 박자 뒤에
 * 거둔다
 */
export function downloadPortable(env: PortableSave, fileName: string): DownloadOutcome {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { started: false, why: 'no-dom' }
  }
  try {
    const blob = new Blob([serializePortable(env)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
    return { started: true }
  } catch (e) {
    // 반복 다운로드를 브라우저가 막는 자리가 여기다. 내부 저장은 이미 끝났으므로
    // 이 실패로 리포트를 취소하지 않는다
    return { started: false, why: 'blocked', detail: e instanceof Error ? e.message : String(e) }
  }
}
