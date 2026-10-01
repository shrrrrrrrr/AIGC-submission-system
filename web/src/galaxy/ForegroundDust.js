import * as THREE from 'three';
import { foregroundVertex, foregroundFragment } from './shaders/index.js';

export class ForegroundDust {
  constructor(data, count, stride = 8) {
    this.count = count;
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const o = i * stride;
      const p = i * 3;
      position[p] = data[o]; position[p + 1] = data[o + 1]; position[p + 2] = data[o + 2];
      size[i] = data[o + 3];
      color[p] = data[o + 4]; color[p + 1] = data[o + 5]; color[p + 2] = data[o + 6];
      alpha[i] = data[o + 7];
      seed[i] = ((i * 1103515245 + 12345) >>> 0) / 4294967296;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 1 }, uProjectionScale: { value: 1000 }, uCameraProgress: { value: 0 }, uCleanup: { value: 0.7 }, uSoftness: { value: 1 }, uPointer: { value: new THREE.Vector2() } },
      vertexShader: foregroundVertex,
      fragmentShader: foregroundFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.geometry = geometry;
    this.pointerUniform = this.material.uniforms.uPointer.value;
  }
  update(time, params) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uSize.value = params.foregroundSize;
    u.uProjectionScale.value = params.projectionScale;
    u.uCameraProgress.value = params.cameraProgress;
    u.uCleanup.value = params.foregroundCleanup;
    u.uSoftness.value = params.foregroundSoftness;
    this.pointerUniform.set(params.pointerX, params.pointerY);
    this.points.visible = params.mode !== 'original' && params.foregroundVisibility > 0;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
