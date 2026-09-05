"""번들 → 의존 번들 표를 굽는다 (DATA.md §3.6).

    py -3.13 tools/extract/bundleDeps.py

⚠️ **번들 하나만 열면 재질이 통째로 빈다.** 유니티 번들의 `PPtr`은 `m_FileID`가
0이면 제 파일이고 1부터는 **그 파일의 바깥 참조표**를 가리킨다. 드래곤사역사
(`tr1029_00`)의 재질 아홉 중 아홉이 `objects/ob0204_00`에 있어서, 그 번들을 같이
안 열면 `FileNotFoundError: cab-e7e5e80b…`로 죽고 우리는 캡슐 사람을 세운다.

**어느 번들이 무엇을 가리키는지는 `Characters/Characters`가 안다** — 15KB짜리
`AssetBundleManifest`이고 번들 441개의 `m_Dependencies`를 든다. 그것을 읽어 TS
모듈 하나로 굽는다: **노드 추출기와 브라우저 변환기가 같은 표를 본다**
(「굽는 쪽이 둘이다」).

⚠️ **셰이더 번들은 뺀다.** 우리는 재질을 합성하므로(`import/bdsp/model.ts`)
`shaders`를 열 이유가 없고, 열면 굽는 시간만 는다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import UnityPy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tools.raw.sources import require_dir  # noqa: E402

OUT = ROOT / "src" / "import" / "bdsp" / "bundleDeps.ts"

HEAD = '''// 번들 → 같이 열어야 하는 번들 (DATA.md §3.6).
//
// ⚠️ **손으로 고치지 않는다** — `pnpm gen:bundleDeps`가 BDSP 번들 매니페스트
// (`Characters/Characters`)에서 다시 만든다.
//
// ⚠️ **이 표가 없으면 사람이 캡슐로 선다.** 유니티 `PPtr`의 `m_FileID`가 0이면
// 제 파일이고 1부터는 그 파일의 바깥 참조표다. 드래곤사역사(`tr1029_00`)는
// 재질 아홉이 다 `objects/ob0204_00`에 있어서, 그 번들을 같이 안 열면
// 재질을 못 찾은 껍데기가 통째로 버려진다 (`import/bdsp/model.ts`).
//
// ⚠️ **셰이더 번들은 안 담는다.** 재질은 우리가 합성한다.
//
// 실측 — 번들 %BUNDLES%개 중 %DEPS%개가 딴 번들을 가리킨다
// (배틀 사람 %BATTLE% · 필드 사람 %FIELD% · 그 밖 %OTHER%).

/** 번들 이름 → 같이 열 번들들. `Characters/` 밑의 경로 그대로다 */
const BUNDLE_DEPS: Readonly<Record<string, readonly string[]>> = '''

TAIL = '''

/**
 * 이 번들과 **같이 열어야 하는 것들**. 의존의 의존까지 따라간다.
 *
 * ⚠️ **사슬이 있다** — `pc0002_12`는 `pc0001_12`를 가리키고 그것이 다시
 * `pc0001_00`을 가리킨다. 한 단계만 따라가면 가운데가 빈다
 */
export function bundleDeps(name: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([name])
  const queue = [...(BUNDLE_DEPS[name] ?? [])]
  while (queue.length > 0) {
    const at = queue.shift()!
    if (seen.has(at)) continue
    seen.add(at)
    out.push(at)
    queue.push(...(BUNDLE_DEPS[at] ?? []))
  }
  return out
}
'''


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    manifest = require_dir("bdsp.characters") / "Characters"
    if not manifest.is_file():
        raise SystemExit(f"번들 매니페스트가 없다: {manifest}")

    table: dict[str, list[str]] = {}
    env = UnityPy.load(str(manifest))
    for obj in env.objects:
        if obj.type.name != "AssetBundleManifest":
            continue
        tree = obj.read_typetree()
        names = {i: n for i, n in tree.get("AssetBundleNames", [])}
        for i, info in tree.get("AssetBundleInfos", []):
            deps = [names.get(j) for j in info.get("AssetBundleDependencies", [])]
            keep = sorted(d for d in deps if d and d != "shaders")
            if keep:
                table[names[i]] = keep
    if not table:
        raise SystemExit("매니페스트에서 의존 목록을 하나도 못 읽었다")

    total = len(env.objects)
    battle = sum(1 for k in table if k.startswith("persons/battle/"))
    field = sum(1 for k in table if k.startswith("persons/field/"))
    body = json.dumps({k: table[k] for k in sorted(table)}, ensure_ascii=False, indent=2)
    head = (HEAD
            .replace("%BUNDLES%", str(_bundle_count(env)))
            .replace("%DEPS%", str(len(table)))
            .replace("%BATTLE%", str(battle))
            .replace("%FIELD%", str(field))
            .replace("%OTHER%", str(len(table) - battle - field)))
    OUT.write_text(head + body + "\n" + TAIL, encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)} — 의존 있는 번들 {len(table)}개 "
          f"(배틀 사람 {battle} · 필드 사람 {field}) · 객체 {total}")
    return 0


def _bundle_count(env) -> int:
    for obj in env.objects:
        if obj.type.name == "AssetBundleManifest":
            return len(obj.read_typetree().get("AssetBundleNames", []))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
