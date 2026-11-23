// 場面5 案A「人の塔」（単体確認用）。中身は本線用の部品 3d/b/sc5.js をそのまま使う
import { THREE, sstep, lerp } from './base.js';
import { createScene5 } from '../b/sc5.js';

const s = {};
export default {
  chordAt: (S) => (S.p < 0.5 ? 4 : 7),
  duck: (S) => 1 - sstep(0.5, 0.75, S.p),
  async build(S) {
    const { scene, renderer, SP } = S;
    scene.fog = new THREE.FogExp2(0x020203, 0.03);
    S.bloom.strength = 0.55; S.bloom.threshold = 0.85;
    // 本線の線の向き（T4→T5 付近の向き）。単体では線を薄く描いて見せる
    s.c = await createScene5({ THREE, scene, center: new THREE.Vector3(0, 0, 0), quality: SP ? 'sp' : 'pc', renderer, lineDir: new THREE.Vector3(0.13, 0.05, -0.99), drawLine: true });
    s.c.setCamera(S.camera);
    if (!SP) { S.camera.fov = 46; S.camera.updateProjectionMatrix(); }   // 本線と同じ画角
    s.look = new THREE.Vector3();
  },
  frame(S) {
    const { camera, t, dt, p, SP } = S;
    const v = s.c.update(t, dt, p);
    // カメラ：本線と同じく中心から約16.5。高さと注視点は部品が返す目安（輪の段で輪が画面の中ほどに来る）
    const k = sstep(0.5, 0.85, p);
    const orb = 0.25 + t * 0.03;
    const dist = SP ? lerp(19.5, 21, k) : 16.5;
    camera.position.set(Math.sin(orb) * dist, v.camHeight, Math.cos(orb) * dist);
    s.look.set(0, v.lookY, 0); camera.lookAt(s.look);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * lerp(0.17, 0.14, k), 0, innerWidth, innerHeight);
  },
  sound: {
    init() {},
    update(S, o) { s.c.audio(o, 1); },
    mute() { s.c.audio(null, 0); },
  },
};
