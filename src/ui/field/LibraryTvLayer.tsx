// 도서관 텔레비전을 필드 위에 띄운다 (`StartLibraryTV`)
import { useLibraryTvStore } from '../../state/libraryTvStore'
import { LibraryTvScreen } from './LibraryTvScreen'

export function LibraryTvLayer() {
  const on = useLibraryTvStore((s) => s.on)
  const close = useLibraryTvStore((s) => s.close)
  return on ? <LibraryTvScreen onDone={close} /> : null
}
