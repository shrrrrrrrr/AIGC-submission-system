import * as THREE from 'three';
import { nebulaVertex, nebulaFragment } from './shaders/index.js';

export class NebulaCloud {
  constructor(data, count, layer, stride = 10) {
    this.count = count;
    this.layer = layer;
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    const density = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const o = i * stride;
      position.set(data.subarray(o, o + 3), i * 3);
      size[i] = data[o + 3];
      color.set(data.subarray(o + 4, o + 7), i * 3);
      alpha[i] = data[o + 7];
      density[i] = data[o + 8];
      seed[i] = data[o + 9];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geometry.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDepthStrength: { value: 1 }, uMorph: { value: 0 }, uSize: { value: 1 }, uProjectionScale: { value: 1000 }, uThickness: { value: 1 }, uCameraProgress: { value: 0 }, uParallax: { value: 1 }, uPointer: { value: new THREE.Vector2() }, uIntensity: { value: 1 }, uPointDensity: { value: 1 } },
      vertexShader: nebulaVertex,
      fragmentShader: nebulaFragment,
      transparent: true,
      depthWrite: false,
      blending: layer === 'mid' ? THREE.AdditiveBlending : THREE.NormalBlending,
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
    u.uSize.value = params.nebulaSize;
    u.uProjectionScale.value = params.projectionScale;
    u.uThickness.value = params.thickness;
    u.uCameraProgress.value = params.cameraProgress;
    u.uParallax.value = params.parallax;
    this.pointerUniform.set(params.pointerX, params.pointerY);
    u.uIntensity.value = params.nebulaIntensity[this.layer];
    u.uPointDensity.value = params.pointDensity;
    this.points.visible = params.mode !== 'original' && params.nebulaVisibility[this.layer] > 0;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
