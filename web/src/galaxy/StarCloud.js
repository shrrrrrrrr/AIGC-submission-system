import * as THREE from 'three';
import { starVertex, starFragment } from './shaders/index.js';

export class StarCloud {
  constructor(data, count, layer, stride = 8) {
    this.count = count;
    this.layer = layer;
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const emissive = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const o = i * stride;
      const p = i * 3;
      position[p] = data[o]; position[p + 1] = data[o + 1]; position[p + 2] = data[o + 2];
      size[i] = data[o + 3];
      color[p] = data[o + 4]; color[p + 1] = data[o + 5]; color[p + 2] = data[o + 6];
      emissive[i] = data[o + 7];
      seed[i] = ((i * 1664525 + 1013904223) >>> 0) / 4294967296;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aEmissive', new THREE.BufferAttribute(emissive, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDepthStrength: { value: 1 }, uMorph: { value: 0 }, uSize: { value: 1 }, uProjectionScale: { value: 1000 }, uCameraProgress: { value: 0 }, uParallax: { value: 1 }, uPointer: { value: new THREE.Vector2() }, uIntensity: { value: 1 } },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.material = material;
    this.geometry = geometry;
    this.pointerUniform = material.uniforms.uPointer.value;
  }
  update(time, params) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uDepthStrength.value = params.depthStrength;
    u.uMorph.value = params.morph + params.cameraProgress * 0.85;
    u.uSize.value = params.starSize;
    u.uProjectionScale.value = params.projectionScale;
    u.uCameraProgress.value = params.cameraProgress;
    u.uParallax.value = params.parallax;
    this.pointerUniform.set(params.pointerX, params.pointerY);
    u.uIntensity.value = params.starIntensity * params.starLayers[this.layer];
    this.points.visible = params.mode !== 'original' && params.starVisibility[this.layer] > 0;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
