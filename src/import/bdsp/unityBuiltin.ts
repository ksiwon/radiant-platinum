// `unity default resources`의 기본 메시 — 번들에 없고 PathID가 엔진에 박혀 있다. 이펙트(`fx.ts`)와 지역(`field.ts`)이 같은 표를 본다.
//
// ⚠️ **PathID만으로 고르지 않는다.** 바깥 파일을 가리키는 참조(`m_FileID ≠ 0`)일 때만 기본 메시다 — 번들 안의 객체가 우연히
// 같은 PathID를 가질 수 있다(`isBuiltinRef`)

/** PathID → 기본 메시 이름 */
export const UNITY_BUILTIN_MESH: Readonly<Record<number, string>> = {
  10202: 'Cube', 10206: 'Cylinder', 10207: 'Sphere', 10208: 'Capsule', 10209: 'Plane', 10210: 'Quad',
}

/** 기본 평면(10×10, 11×11 정점) */
export const UNITY_PLANE = 10209

/** 그 참조가 기본 리소스 파일을 가리키는가 — 바깥 파일(`m_FileID ≠ 0`)이고 표에 있는 PathID */
export function isBuiltinRef(fileId: number, pathId: number): boolean {
  return fileId !== 0 && UNITY_BUILTIN_MESH[Math.abs(pathId)] !== undefined
}
