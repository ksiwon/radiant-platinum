// Unity 타입 트리 — 브라우저에서 (IMPORT.md §12)
//
// spike가 멈췄던 첫 문턱이다. `SerializedFile`의 오브젝트는 **자기 설명이 없다** —
// 바이트가 그냥 이어 붙어 있고, 어느 자리가 무슨 필드인지는 파일 앞쪽 타입 표에
// 실린 **트리**가 말한다.
//
// 다행히 BDSP 번들은 타입 트리를 싣고 있다(`hasTypeTree`). 그래서 클래스별
// 하드코딩이 필요 없다 — 트리를 걸어 필드를 읽는 해석기 **하나**면 Mesh든
// Texture2D든 Material이든 다 읽힌다. 클래스마다 구조체를 손으로 적는 길은
// Unity 판이 바뀔 때마다 조용히 깨진다.
//
// ⚠️ **정렬을 빠뜨리면 그 뒤가 전부 밀린다.** `metaFlag & 0x4000`이면 그 필드를
// 읽은 뒤 4바이트 경계로 맞춘다. 이걸 안 하면 값이 그럴듯하게 나오다가 어느
// 필드부터 쓰레기가 되는데, 어디서부터인지 보이지 않는다.

/**
 * Unity가 자주 쓰는 이름을 파일마다 안 적으려고 두는 공용 문자열표.
 *
 * 문자열 오프셋의 최상위 비트가 서면 이 표를 가리킨다. 표는 이름들을 NUL로
 * 이어 붙인 것이고 **오프셋은 그 바이트 자리**다 — 순서가 곧 자리라서 하나만
 * 빠져도 그 뒤 이름이 전부 어긋난다
 */
const COMMON_STRINGS = [
  'AABB', 'AnimationClip', 'AnimationCurve', 'AnimationState', 'Array', 'Base', 'BitField',
  'bitset', 'bool', 'char', 'ColorRGBA', 'Component', 'data', 'deque', 'double', 'dynamic_array',
  'FastPropertyName', 'first', 'float', 'Font', 'GameObject', 'Generic Mono', 'GradientNEW',
  'GUID', 'GUIStyle', 'int', 'list', 'long long', 'map', 'Matrix4x4f', 'MdFour', 'MonoBehaviour',
  'MonoScript', 'm_ByteSize', 'm_Curve', 'm_EditorClassIdentifier', 'm_EditorHideFlags',
  'm_Enabled', 'm_ExtensionPtr', 'm_GameObject', 'm_Index', 'm_IsArray', 'm_IsStatic',
  'm_MetaFlag', 'm_Name', 'm_ObjectHideFlags', 'm_PrefabInternal', 'm_PrefabParentObject',
  'm_Script', 'm_StaticEditorFlags', 'm_Type', 'm_Version', 'Object', 'pair', 'PPtr<Component>',
  'PPtr<GameObject>', 'PPtr<Material>', 'PPtr<MonoBehaviour>', 'PPtr<MonoScript>', 'PPtr<Object>',
  'PPtr<Prefab>', 'PPtr<Sprite>', 'PPtr<TextAsset>', 'PPtr<Texture>', 'PPtr<Texture2D>',
  'PPtr<Transform>', 'Prefab', 'Quaternionf', 'Rectf', 'RectInt', 'RectOffset', 'second', 'set',
  'short', 'size', 'SInt16', 'SInt32', 'SInt64', 'SInt8', 'staticvector', 'string', 'TextAsset',
  'TextMesh', 'Texture', 'Texture2D', 'Transform', 'TypelessData', 'UInt16', 'UInt32', 'UInt64',
  'UInt8', 'unsigned int', 'unsigned long long', 'unsigned short', 'vector', 'Vector2f',
  'Vector3f', 'Vector4f', 'm_ScriptingClassIdentifier', 'Gradient', 'Type*', 'int2_storage',
  'int3_storage', 'BoundsInt', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset',
  'FileSize', 'Hash128',
]

const commonAt = ((): ReadonlyMap<number, string> => {
  const out = new Map<number, string>()
  let at = 0
  for (const s of COMMON_STRINGS) {
    out.set(at, s)
    at += s.length + 1
  }
  return out
})()

export interface TypeNode {
  /** `int`·`float`·`string`·`vector`·`PPtr<Texture2D>` 같은 타입 이름 */
  type: string
  /** 필드 이름. 루트는 `Base` */
  name: string
  byteSize: number
  index: number
  typeFlags: number
  metaFlag: number
  level: number
  children: TypeNode[]
}

/** 이 필드를 읽고 나서 4바이트로 맞춰야 하는가 */
const ALIGN = 0x4000

/** 트리를 평평한 노드 목록에서 세운다 — `level`이 곧 깊이다 */
export function buildTree(flat: readonly Omit<TypeNode, 'children'>[]): TypeNode | null {
  if (flat.length === 0) return null
  const root: TypeNode = { ...flat[0]!, children: [] }
  const stack: TypeNode[] = [root]
  for (let i = 1; i < flat.length; i++) {
    const n: TypeNode = { ...flat[i]!, children: [] }
    while (stack.length > n.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (!parent) throw new Error(`타입 트리 깊이가 어긋난다 (${n.name})`)
    parent.children.push(n)
    stack.push(n)
  }
  return root
}

/** 문자열 자리 → 이름. 최상위 비트가 서면 공용 표다 */
export function stringAt(offset: number, local: Uint8Array): string {
  if (offset & 0x80000000) {
    return commonAt.get(offset & 0x7fffffff) ?? `[common:${String(offset & 0x7fffffff)}]`
  }
  let end = offset
  while (end < local.byteLength && local[end] !== 0) end++
  let s = ''
  for (let i = offset; i < end; i++) s += String.fromCharCode(local[i]!)
  return s
}

/** 노드 하나를 읽는다 (블롭 배치, `SerializedFile` 판 12 이상) */
export function readNodes(
  bytes: Uint8Array, at: number, count: number, strings: Uint8Array,
  little: boolean, withRefHash: boolean,
): Omit<TypeNode, 'children'>[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const stride = withRefHash ? 32 : 24
  const out: Omit<TypeNode, 'children'>[] = []
  for (let i = 0; i < count; i++) {
    const o = at + i * stride
    out.push({
      // +0 u16 version — 우리가 안 본다
      level: view.getUint8(o + 2),
      typeFlags: view.getUint8(o + 3),
      type: stringAt(view.getUint32(o + 4, little), strings),
      name: stringAt(view.getUint32(o + 8, little), strings),
      byteSize: view.getInt32(o + 12, little),
      index: view.getInt32(o + 16, little),
      metaFlag: view.getInt32(o + 20, little),
    })
  }
  return out
}

// ── 값 읽기 ──────────────────────────────────────────────────────────────────

interface PPtr { fileId: number, pathId: number }

export type UnityValue =
  | number | boolean | string | Uint8Array | PPtr
  | UnityValue[] | { [k: string]: UnityValue }

/** 값 하나를 읽는 커서. 정렬이 상태라서 클래스로 든다 */
export class TreeReader {
  at = 0
  private readonly view: DataView

  private readonly bytes: Uint8Array
  private readonly little: boolean
  constructor(bytes: Uint8Array, little = true) {
    this.bytes = bytes
    this.little = little
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  private align(): void { this.at = (this.at + 3) & ~3 }

  private primitive(type: string): UnityValue | undefined {
    const v = this.view
    switch (type) {
      case 'SInt8': case 'char': { const x = v.getInt8(this.at); this.at += 1; return x }
      case 'UInt8': { const x = v.getUint8(this.at); this.at += 1; return x }
      case 'bool': { const x = v.getUint8(this.at) !== 0; this.at += 1; return x }
      case 'SInt16': case 'short': { const x = v.getInt16(this.at, this.little); this.at += 2; return x }
      case 'UInt16': case 'unsigned short': {
        const x = v.getUint16(this.at, this.little); this.at += 2; return x
      }
      case 'SInt32': case 'int': case 'Type*': {
        const x = v.getInt32(this.at, this.little); this.at += 4; return x
      }
      case 'UInt32': case 'unsigned int': {
        const x = v.getUint32(this.at, this.little); this.at += 4; return x
      }
      case 'SInt64': case 'long long': {
        const x = Number(v.getBigInt64(this.at, this.little)); this.at += 8; return x
      }
      case 'UInt64': case 'unsigned long long': case 'FileSize': {
        const x = Number(v.getBigUint64(this.at, this.little)); this.at += 8; return x
      }
      case 'float': { const x = v.getFloat32(this.at, this.little); this.at += 4; return x }
      case 'double': { const x = v.getFloat64(this.at, this.little); this.at += 8; return x }
      default: return undefined
    }
  }

  /** 길이 붙은 바이트 뭉치. `string`과 `TypelessData`가 같은 모양이다 */
  private byteArray(): Uint8Array {
    const n = this.view.getInt32(this.at, this.little)
    this.at += 4
    if (n < 0 || this.at + n > this.bytes.byteLength) {
      throw new Error(`바이트 배열 길이가 ${String(n)}이다 — 자리를 잘못 짚었다`)
    }
    const raw = this.bytes.subarray(this.at, this.at + n)
    this.at += n
    return raw
  }

  /**
   * 노드 하나를 값으로. UnityPy의 `read_value`와 **같은 규칙**이다.
   *
   * 규칙 셋이 전부다:
   *
   *   ① 이름이 아는 타입이면 그 폭만큼 읽는다. `string`은 길이+바이트+정렬,
   *      `TypelessData`는 길이+바이트 (정렬은 노드 깃발이 정한다)
   *   ② 첫 자식의 타입이 `Array`면 이 노드는 벡터다. **정렬 깃발은 그 자식 것**을
   *      본다 — 벡터 자신에는 안 붙어 있다
   *   ③ 나머지는 구조체다. 자식을 차례로 읽는다 (`PPtr<T>`도 그냥 구조체다)
   *
   * ⚠️ **②를 `typeFlags`로 판정하면 안 된다.** `TypelessData`가 `typeFlags & 1`을
   * 갖고 있지만 벡터가 아니다 — 그렇게 읽으면 정점 자료(600KB)를 1바이트로 읽고
   * 그 뒤가 전부 밀린다. 실제로 그 버그를 만났고, 증상은 "배열 길이가 −10억"이었다
   */
  read(node: TypeNode): UnityValue {
    let align = (node.metaFlag & ALIGN) !== 0
    let value: UnityValue

    const prim = this.primitive(node.type)
    if (prim !== undefined) {
      value = prim
    } else if (node.type === 'string') {
      value = new TextDecoder().decode(this.byteArray())
      this.align()
    } else if (node.type === 'TypelessData') {
      value = this.byteArray().slice()
    } else if (node.type === 'pair' && node.children.length === 2) {
      value = [this.read(node.children[0]!), this.read(node.children[1]!)]
    } else if (node.children[0]?.type === 'Array') {
      const arrayNode = node.children[0]
      if (arrayNode.metaFlag & ALIGN) align = true
      value = this.readArray(arrayNode)
    } else {
      const out: Record<string, UnityValue> = {}
      for (const child of node.children) out[child.name] = this.read(child)
      value = out
    }

    if (align) this.align()
    return value
  }

  private readArray(arrayNode: TypeNode): UnityValue {
    const item = arrayNode.children[1]
    if (!item) throw new Error(`배열 ${arrayNode.name}에 원소 타입이 없다`)
    const n = this.view.getInt32(this.at, this.little)
    this.at += 4
    if (n < 0 || n > this.bytes.byteLength) {
      throw new Error(`배열 ${arrayNode.name}의 길이가 ${String(n)}이다 — 자리를 잘못 짚었다`)
    }
    // ⚠️ 바이트 배열은 원소마다 읽으면 안 된다. 색인 자료가 수십 KB라 원소
    // 루프로 읽으면 브라우저가 눈에 띄게 멈춘다
    if (item.type === 'UInt8' || item.type === 'SInt8' || item.type === 'char') {
      const raw = this.bytes.slice(this.at, this.at + n)
      this.at += n
      return raw
    }
    const out: UnityValue[] = []
    for (let i = 0; i < n; i++) out.push(this.read(item))
    return out
  }
}

/** 오브젝트 하나를 트리대로 읽는다 */
export function readObject(bytes: Uint8Array, tree: TypeNode, little = true): UnityValue {
  const r = new TreeReader(bytes, little)
  const out: Record<string, UnityValue> = {}
  for (const child of tree.children) out[child.name] = r.read(child)
  return out
}
