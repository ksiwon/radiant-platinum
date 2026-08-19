"""치비 동작을 등신 몸으로 옮긴다 (PLAN §4.3 · §16.9).

BDSP 인물은 두 벌이다. **등신**(`battle/tr####`·`pc####`)에 붙은 클립은 전부
제자리 배틀 동작이고, 걷기·낚시·폭포·물주기 같은 필드 동작은 **치비**
(`field/fc####`)에만 있다. 우리는 등신을 쓰기로 했으므로(§4.3) 옮겨 온다.

⚠️ **두 리그는 다르다.** 뼈 이름이 절반쯤만 겹치고, 같은 이름이라도 쉬는
자세의 방향이 서로 다르다 — 로컬 회전을 복사한 순간 팔이 엉뚱한 데를 본다.

대신 **쉬는 자세에서 얼마나 돌았는가**를 옮긴다. 월드 기준으로:

    D  = 지금소스전역 · 소스쉼전역⁻¹        (쉼에서 벗어난 만큼)
    지금타깃전역 = D · 타깃쉼전역
    타깃로컬 = 부모의 지금타깃전역⁻¹ · 지금타깃전역

이러면 두 리그의 쉬는 자세가 달라도 "얼마나 돌았나"만 건너온다.

**자리 옮김은 안 옮긴다.** 뼈 길이가 다르므로 그대로 옮기면 팔다리가 늘어난다.

⚠️ 실측: `walk_f`가 움직이는 뼈 34개 중 **23개가 등신에 있고, 없는 11개는
전부 가방끈과 목도리**다. 뼈대는 하나도 안 빠진다.

⚠️ **굽는 쪽이 둘이다.** 브라우저 변환기의 같은 것이
`src/import/bdsp/retarget.ts`에 있다. 한쪽만 고치면 개발 서버와 설치본이 다른
몸을 굽는다 — 두 산출물이 5.7e-14 안에서 같은 것을 실측으로 확인한다.
"""
from __future__ import annotations

import numpy as np


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """(x, y, z, w) 두 개를 곱한다. `a·b`는 b를 먼저 돌리고 a를 돌린 것이다."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ], dtype=np.float64)


def quat_conj(q: np.ndarray) -> np.ndarray:
    """단위 사원수의 역. 켤레와 같다."""
    return np.array([-q[0], -q[1], -q[2], q[3]], dtype=np.float64)


def quat_norm(q: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(q))
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])


class Rig:
    """뼈 경로 → 부모·쉬는 자세. FK를 돌리는 데 필요한 최소한만 든다."""

    def __init__(self, parent: dict[str, str | None], rest: dict[str, np.ndarray],
                 offset: dict[str, np.ndarray]) -> None:
        self.parent = parent
        self.rest = rest
        self.offset = offset
        self._global: dict[str, np.ndarray] = {}
        for path in parent:
            self._global[path] = self._rest_global(path)

    def _rest_global(self, path: str) -> np.ndarray:
        q = np.array([0.0, 0.0, 0.0, 1.0])
        chain = []
        at: str | None = path
        seen = set()
        while at is not None and at in self.rest and at not in seen:
            seen.add(at)
            chain.append(at)
            at = self.parent.get(at)
        for b in reversed(chain):
            q = quat_mul(q, self.rest[b])
        return quat_norm(q)

    def rest_global(self, path: str) -> np.ndarray:
        return self._global[path]

    def order(self) -> list[str]:
        """부모가 늘 자식보다 먼저 오는 차례. FK가 한 번에 돈다."""
        done: list[str] = []
        seen: set[str] = set()

        def visit(path: str) -> None:
            if path in seen or path not in self.rest:
                return
            seen.add(path)
            p = self.parent.get(path)
            if p is not None:
                visit(p)
            done.append(path)

        for path in self.rest:
            visit(path)
        return done


def forward(rig: Rig, local: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """로컬 회전들로 전역 회전을 구한다. 없는 뼈는 쉬는 자세를 쓴다."""
    out: dict[str, np.ndarray] = {}
    for path in rig.order():
        q = local.get(path, rig.rest[path])
        p = rig.parent.get(path)
        out[path] = quat_norm(quat_mul(out[p], q) if p in out else q)
    return out


def retarget(
    source: Rig, target: Rig, pairs: dict[str, str],
    frames: list[dict[str, np.ndarray]],
) -> tuple[list[dict[str, np.ndarray]], list[str]]:
    """
    소스의 프레임별 로컬 회전을 타깃의 로컬 회전으로 옮긴다.

    옮기는 것은 `pairs`(타깃 경로 → 소스 경로)에 적힌 짝뿐이다. 나머지는
    타깃의 쉬는 자세로 남는다 — **지어내지 않는다.**
    """
    shared = [b for b in target.order() if b in pairs]
    out: list[dict[str, np.ndarray]] = []
    for local in frames:
        src = forward(source, local)
        want: dict[str, np.ndarray] = {}
        got: dict[str, np.ndarray] = {}
        for path in target.order():
            p = target.parent.get(path)
            parent_global = got.get(p, np.array([0.0, 0.0, 0.0, 1.0])) if p else None
            frm = pairs.get(path)
            if frm is not None:
                delta = quat_mul(src[frm], quat_conj(source.rest_global(frm)))
                here = quat_norm(quat_mul(delta, target.rest_global(path)))
            else:
                # 짝이 없는 뼈는 부모를 따라가되 제 쉬는 자세를 지킨다
                here = quat_norm(
                    quat_mul(parent_global, target.rest[path]) if parent_global is not None
                    else target.rest[path]
                )
            got[path] = here
            want[path] = quat_norm(
                quat_mul(quat_conj(parent_global), here) if parent_global is not None else here
            )
        out.append(want)
    return out, shared


def round_trip_error(
    source: Rig, target: Rig, pairs: dict[str, str],
    frames: list[dict[str, np.ndarray]],
) -> float:
    """
    ⚠️ **이 파일에서 가장 중요한 자다.**

    소스 → 타깃 → 소스로 되돌렸을 때 원래 회전이 나와야 한다. 켤레를 한 번
    잘못 걸거나 곱하는 차례를 바꾸면 여기서 바로 벌어진다 — 화면을 못 보는
    상태에서 이 수식이 맞는지 확인할 수 있는 거의 유일한 방법이다.
    """
    back = {frm: to for to, frm in pairs.items()}
    there, _ = retarget(source, target, pairs, frames)
    home, _ = retarget(target, source, back, there)
    worst = 0.0
    for before, after in zip(frames, home):
        for frm in back:
            a = quat_norm(before.get(frm, source.rest[frm]))
            b = quat_norm(after[frm])
            # 사원수는 부호가 반대여도 같은 회전이다
            worst = max(worst, float(min(np.abs(a - b).max(), np.abs(a + b).max())))
    return worst


def leaf_of(path: str) -> str:
    """경로의 마지막 칸. 짝을 짓는 이름이다."""
    return path.rsplit("/", 1)[-1]


def top_of(path: str) -> str:
    """경로의 첫 칸. 클립이 어느 갈래를 모는지 가른다."""
    return path.split("/", 1)[0]


def pair_by_name(
    source: Rig, target: Rig, branches: set[str],
) -> tuple[dict[str, str], int]:
    """
    타깃 경로 → 소스 경로. 이름이 같은 뼈만 짝짓는다.

    ⚠️ **클립이 실제로 모는 갈래로 좁힌다.** 치비 번들은 자전거·낚싯대·탈것이
    제 안에 사람 뼈대를 한 벌씩 더 들고 있어서, 이름만 보면 `RItem1`처럼 쉬는
    자세까지 다른 뼈를 집는다 (실측: 겹치는 117쌍 중 116쌍은 자세가 같고 한
    쌍이 1.0000 다르다). 클립 56개의 바인딩 16,305건이 전부 `Origin` 갈래
    하나에 떨어지고 그 안에서는 이름이 126종에 126개라, 그 갈래로 좁히면
    짝짓기가 확정된다. 그래도 겹치면 **짐작하지 않고 뺀다.**
    """
    by_name: dict[str, str | None] = {}
    for path in source.rest:
        if path == "" or top_of(path) not in branches:
            continue
        leaf = leaf_of(path)
        by_name[leaf] = None if leaf in by_name else path
    target_by_name: dict[str, str] = {}
    for path in target.rest:
        if path == "":
            continue
        target_by_name.setdefault(leaf_of(path), path)
    pairs, ambiguous = {}, 0
    for leaf, frm in by_name.items():
        if frm is None:
            ambiguous += 1
            continue
        to = target_by_name.get(leaf)
        if to is not None:
            pairs[to] = frm
    return pairs, ambiguous


def build_rig(env, bone_name, transform_paths):
    """번들에서 리그와 (경로해시 → 경로) 표를 뽑는다.

    ⚠️ **경로로 색인한다. 이름이 아니다.** 이름을 열쇠로 쓰면 겹치는 이름에서
    **읽는 차례에 따라** 어느 뼈를 집는지가 바뀐다. 짝짓기는 `pair_by_name`이
    갈래를 좁혀 따로 한다.
    """
    import zlib

    tr = {o.path_id: o.read() for o in env.objects if o.type.name == "Transform"}
    parent = {}
    for pid, t in tr.items():
        for c in t.m_Children:
            parent[c.m_PathID] = pid
    paths = transform_paths(env)
    par, rest, off = {}, {}, {}
    for pid, t in tr.items():
        path = paths.get(pid)
        if path is None:
            continue
        up = parent.get(pid)
        par[path] = paths.get(up) if up is not None else None
        q, p = t.m_LocalRotation, t.m_LocalPosition
        rest[path] = np.array([q.x, q.y, q.z, q.w], dtype=np.float64)
        off[path] = np.array([p.x, p.y, p.z], dtype=np.float64)
    hashes = {zlib.crc32(p.encode()) & 0xFFFFFFFF: p for p in paths.values()}
    return Rig(par, rest, off), hashes
