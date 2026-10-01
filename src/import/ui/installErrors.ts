// 설치 화면이 받은 예외를 사람 말로 (IMPORT.md §3 · §8)
//
// ⚠️ **브라우저가 준 말을 그대로 내지 않는다.** 할당량이 차면 화면에
// `QuotaExceededError: The quota has been exceeded.`가 영어로 떴고, 롬을 다시
// 못 읽으면 `Error: NotReadableError …`가 떴다. 사람에게 필요한 것은 무슨 일이
// 났고 **다음에 무엇을 하면 되는가**다. 원문은 버리지 않는다 — 접힌 「자세히」로
// 보낸다. 지원 문의에는 그쪽이 필요하다.
//
// 가르는 열쇠는 `DOMException.name`이다. 메시지는 브라우저와 언어마다 다르지만
// 이름은 표준이 정한다.
import { formatBytes } from '../install/storage'

export interface ExplainedError {
  /** 화면에 보이는 한 문장. 합니다체다 */
  text: string
  /** 원문. 접힌 「자세히」에만 둔다 */
  raw: string
}

function nameOf(e: unknown): string {
  const name = (e as { name?: unknown } | null)?.name
  return typeof name === 'string' ? name : ''
}

function rawOf(e: unknown): string {
  if (e instanceof Error) return e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message
  return String(e)
}

/**
 * 예외 하나를 화면 문장과 원문으로 가른다.
 *
 * `space`를 주면 할당량이 찼을 때 얼마가 더 필요한지 적는다 — 설치 화면이 잰
 * 그 값이다(`storageState`). `during`은 무엇을 하다 멈췄는가다: 설치 중이면
 * 끝난 그룹이 남아 이어서 할 수 있고, 파일을 읽던 중이면 다시 고르면 된다
 */
export function explainInstallError(
  e: unknown,
  { space, during = 'install' }: {
    space?: { need: number; free: number }
    during?: 'install' | 'read'
  } = {},
): ExplainedError {
  const raw = rawOf(e)
  switch (nameOf(e)) {
    case 'QuotaExceededError': {
      const short = space && space.need > space.free
        ? ` (${formatBytes(space.need - space.free)}가 더 필요합니다)`
        : ''
      return {
        text: `저장 공간이 모자라 멈췄습니다${short}. 끝난 그룹은 남아 있습니다 — `
          + '디스크를 비운 뒤 다시 누르면 이어서 합니다.',
        raw,
      }
    }
    // 고른 파일·폴더를 브라우저가 더 못 읽는다 — 옮겨졌거나, 권한이 풀렸거나,
    // 창을 닫았다 열어 손잡이가 낡았다. 할 일은 하나다: 다시 고른다
    case 'NotAllowedError':
    case 'SecurityError':
    case 'NotReadableError':
    case 'NotFoundError':
      return {
        text: '브라우저가 고른 파일이나 폴더를 더 읽지 못합니다. 파일과 폴더를 다시 골라 주세요.',
        raw,
      }
    // 변환 스레드가 끊겼다 (`worker/client.ts`의 `WorkerFailed('Terminated')`)
    case 'Terminated':
      return {
        text: during === 'install'
          ? '변환 작업이 멈췄습니다. 탭을 새로 고친 뒤 다시 누르면 끝난 그룹부터 이어서 합니다.'
          : '변환 작업이 멈췄습니다. 탭을 새로 고친 뒤 다시 골라 주세요.',
        raw,
      }
    default:
      return {
        text: during === 'install'
          ? '알 수 없는 문제로 멈췄습니다. 다시 누르면 끝난 그룹은 건너뛰고 이어서 합니다.'
          : '파일을 읽다가 알 수 없는 문제로 멈췄습니다. 다시 골라 주세요.',
        raw,
      }
  }
}
