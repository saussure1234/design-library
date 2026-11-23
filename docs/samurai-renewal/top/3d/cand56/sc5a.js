// 場面5 案A「人の山」（単体確認用）。中身は本線用の部品 3d/b/sc5.js をそのまま使う
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
    s.c = await createScene5({ THREE, scene, center: new THREE.Vector3(0, 0, 0), quality: SP ? 'sp' : 'pc', renderer });
    s.c.setCamera(S.camera);
    s.look = new THREE.Vector3();
  },
  frame(S) {
    const { camera, t, dt, p, SP } = S;
    s.c.update(t, dt, p);
    // カメラ：中心から約17。山を見上げる → 上から輪を見下ろす
    const k = sstep(0.42, 0.8, p);
    const orb = 0.25 + t * 0.03;
    const dist = SP ? lerp(20, 22, k) : 17, h = lerp(3.2, 11, k);
    camera.position.set(Math.sin(orb) * dist, h, Math.cos(orb) * dist);
    s.look.set(0, lerp(3.6, 0.4, k), 0); camera.lookAt(s.look);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lerp(0.2, 0.16, k), innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.17, 0, innerWidth, innerHeight);
  },
  sound: {
    init() {},
    update(S, o) { s.c.audio(o, 1); },
    mute() { s.c.audio(null, 0); },
  },
};
