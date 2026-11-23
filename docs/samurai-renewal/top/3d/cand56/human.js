// 人の形（MPFB で作った1体）を複製し、骨を「向き」で決めて姿勢を付ける
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const loadHuman = (url = './3d/cand56/human.glb') => new GLTFLoader().loadAsync(url);

export function makeBody(g, mat) {
  const o = SkeletonUtils.clone(g.scene);
  const bones = {}; let mesh = null;
  o.traverse((c) => {
    if (c.isBone) bones[c.name] = c;
    if (c.isSkinnedMesh) { mesh = c; c.material = mat; c.frustumCulled = false; c.castShadow = true; c.receiveShadow = true; }
  });
  const rest = {}; for (const k in bones) rest[k] = bones[k].quaternion.clone();
  const root = new THREE.Group(); root.add(o);
  return { root, o, bones, rest, mesh };
}

const I = new THREE.Quaternion(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
export const ORDER = ['spine03', 'spine01', 'neck01', 'head', 'upperarm01L', 'lowerarm01L', 'upperarm01R', 'lowerarm01R', 'upperleg01L', 'lowerleg01L', 'upperleg01R', 'lowerleg01R'];

export function resetPose(b) { for (const k in b.rest) b.bones[k].quaternion.copy(b.rest[k]); b.root.updateMatrixWorld(true); }

// 骨の Y 軸（根元→先）を、体の座標（+Y 上・+Z 前・+X 本人の左）の向き d へ向ける
export function aim(b, name, d) {
  const bone = b.bones[name]; if (!bone || !d) return;
  bone.getWorldQuaternion(_q);
  _v.set(0, 1, 0).applyQuaternion(_q);
  b.o.getWorldQuaternion(_rq);
  _d.copy(d).normalize().applyQuaternion(_rq);
  _q2.setFromUnitVectors(_v, _d).multiply(_q);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q2));
  bone.updateMatrixWorld(true);
}

// 2つの姿勢（{骨名: Vector3}）を k で混ぜて付ける
const _m = new THREE.Vector3();
export function pose(b, A, B, k = 0) {
  resetPose(b);
  for (const n of ORDER) {
    const a = A[n], c = B ? B[n] : null;
    if (!a && !c) continue;
    if (a && c) _m.copy(a).normalize().lerp(_m.clone().copy(c).normalize(), k); else _m.copy(a || c);
    aim(b, n, _m);
  }
}
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export { I };
