import * as THREE from 'three';
import { StarCloud } from './StarCloud.js';
import { NebulaCloud } from './NebulaCloud.js';
import { ForegroundDust } from './ForegroundDust.js';
import sharedApproved from './approved.json';
const approved={...sharedApproved,manualMorph:sharedApproved.morph,fixedMorph:Math.min(1,sharedApproved.morph+.85)};

export const assetUrl = (path) => new URL(`${import.meta.env.BASE_URL}galaxy/${path.replace(/^\//, '')}`, document.baseURI).href;
export async function readAsset(path, signal, binary = false) {
  const response = await fetch(assetUrl(path), { signal });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return binary ? response.arrayBuffer() : response.json();
}
const rad = THREE.MathUtils.degToRad;
export class GalaxyInstance {
  static async load(entry, signal) {
    const base = entry.directory;
    const metadata = await readAsset(`${base}/metadata.json`, signal);
    // Keep the homepage layer set identical to the tuning page. The residual
    // image remains a debug-only backdrop; all point layers are available so
    // saved visibility and size/intensity settings apply consistently.
    const specs = [
      metadata.stars.layers.bright,
      metadata.stars.layers.medium,
      metadata.stars.layers.dust,
      metadata.nebula.layers.front,
      metadata.nebula.layers.mid,
      metadata.nebula.layers.back,
      metadata.foreground
    ];
    const buffers = await Promise.all(specs.map(s => readAsset(`${base}/${s.file}`, signal, true)));
    signal.throwIfAborted();
    const preset = await readAsset(entry.preset.replace(/^\//, ''), signal);
    signal.throwIfAborted();
    return new GalaxyInstance(entry, metadata, specs, buffers, preset);
  }
  constructor(entry, metadata, specs, buffers, runtimePreset = null, revision = null) {
    this.entry = entry; this.metadata = metadata; this.revision = revision; this.runtimePreset = runtimePreset;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#02030d');
    this.camera = new THREE.PerspectiveCamera(46, 1, .1, 240);
    this.clouds = [];
    this.rollDegrees = Number(metadata.config?.camera?.rollDegrees ?? 0);
    this.activeRollDegrees = this.rollDegrees;
    try {
      this.clouds.push(new StarCloud(new Float32Array(buffers[0]), specs[0].count, 'bright', specs[0].stride));
      this.clouds.push(new StarCloud(new Float32Array(buffers[1]), specs[1].count, 'medium', specs[1].stride));
      this.clouds.push(new StarCloud(new Float32Array(buffers[2]), specs[2].count, 'dust', specs[2].stride));
      this.clouds.push(new NebulaCloud(new Float32Array(buffers[3]), specs[3].count, 'front', specs[3].stride));
      this.clouds.push(new NebulaCloud(new Float32Array(buffers[4]), specs[4].count, 'mid', specs[4].stride));
      this.clouds.push(new NebulaCloud(new Float32Array(buffers[5]), specs[5].count, 'back', specs[5].stride));
      this.clouds.push(new ForegroundDust(new Float32Array(buffers[6]), specs[6].count, specs[6].stride));
    } catch (error) { this.dispose(); throw error; }
    this.scene.add(...this.clouds.map(c => c.points));
    const saved = runtimePreset || approved;
    this.params = { ...structuredClone(approved), ...structuredClone(saved), mode: 'pointcloud', foregroundSize: 1,
      // Homepage pins the approved expanded state; scroll never drives morph or camera distance.
      morph: saved.morph ?? saved.manualMorph ?? approved.manualMorph, cameraProgress: 1, pointerX: 0, pointerY: 0, projectionScale: 1 };
    const config = metadata.config?.camera || {};
    this.target = new THREE.Vector3(config.focalX || 0, config.focalY || 0, config.targetZEnd ?? -35);
    const dz = (config.endZ ?? 12) - this.target.z;
    const dy = Math.sin(Math.PI * .9) * Math.tan(rad(config.pitchDegrees ?? 5)) * dz * .12;
    this.radius = Math.hypot(dz, dy); this.basePitch = Math.atan2(dy, dz);
    this.localProgress = null; this.pitch = 0; this.yaw = 0;
    this.enabledPoints = specs.reduce((n, s) => n + s.count, 0);
    this.totalPoints = entry.pointCounts.total;
    this.densityRetainedPoints = specs[0].count + specs[1].count + specs[2].count + specs[6].count;
    for (const layerIndex of [3, 4, 5]) {
      const nebulaRaw = new Float32Array(buffers[layerIndex]);
      for (let i = 0; i < specs[layerIndex].count; i++) if (nebulaRaw[i * specs[layerIndex].stride + 8] <= approved.pointDensity) this.densityRetainedPoints++;
    }
    this.bounds = this.measureComposition();
  }
  measureComposition() {
    // Match the actual vertex shader's image->volume morph and Z expansion.
    // Retain 98% of the mid-nebula composition, excluding only sparse outliers.
    const compositionCloud = this.clouds.find((cloud) => cloud.layer === 'mid') || this.clouds[1];
    if (!compositionCloud) return { left: -.25, right: .25, bottom: -.25, top: .25 };
    const data = compositionCloud.geometry.attributes.position;
    const xs = [], ys = [];
    for (let i = 0; i < data.count; i++) {
      const z = data.getZ(i), scale = 50 / Math.max(1, 28 - z);
      const xyScale = scale * (1 - Math.min(1,this.params.morph+.85)) + Math.min(1,this.params.morph+.85);
      const finalZ = -22 + (z + 22) * Math.min(1,this.params.morph+.85) * this.params.depthStrength;
      const distance = this.target.z + this.radius - finalZ;
      const rawX = data.getX(i) * xyScale - this.target.x;
      const rawY = data.getY(i) * xyScale - this.target.y;
      const roll = rad(this.activeRollDegrees || 0);
      const x = rawX * Math.cos(roll) - rawY * Math.sin(roll);
      const y = rawX * Math.sin(roll) + rawY * Math.cos(roll);
      xs.push(x / distance);
      ys.push(y / distance);
    }
    xs.sort((a,b)=>a-b); ys.sort((a,b)=>a-b);
    const q = (a,p) => a[Math.floor((a.length - 1) * p)];
    return { left:q(xs,.01), right:q(xs,.99), bottom:q(ys,.01), top:q(ys,.99) };
  }
  resize(width, height, dpr) {
    this.width = width; this.height = height; this.dpr = dpr;
    const landscape = width > height;
    this.activeRollDegrees = landscape ? this.rollDegrees : 0;
    for (const cloud of this.clouds) cloud.points.rotation.z = rad(this.activeRollDegrees);
    this.bounds = this.measureComposition();
    const aspect = width / height, b = this.bounds;
    // Wider fixed layout framing. Orbiting the focus cancels most rigid camera rotation;
    // reserve a depth-parallax margin plus breathing, with no scroll-dependent zoom.
    this.scrollPitchMax = rad(THREE.MathUtils.clamp(Number(this.params.scrollPitchDegrees ?? 6), 0, 8));
    this.pointerPitchMax = rad(THREE.MathUtils.clamp(Number(this.params.pointerPitchDegrees ?? 3), 0, 4));
    this.pointerYawMax = rad(THREE.MathUtils.clamp(Number(this.params.pointerYawDegrees ?? 5), 0, 7));
    const safeOverscan = THREE.MathUtils.clamp(Number(this.params.safeOverscan ?? 1.12), 1, 1.4);
    const safeX = Math.max(.04, Math.min(-b.left,b.right) - Math.tan(this.pointerYawMax) * .65 - .008);
    const safeY = Math.max(.04, Math.min(-b.bottom,b.top) - Math.tan(this.scrollPitchMax + this.pointerPitchMax + Math.abs(this.basePitch)) * .65 - .008);
    // Fit the complete composition in both axes. The previous min() selected
    // the narrowest axis, which made tall galaxies look heavily cropped on
    // the homepage. Presentation framing is allowed to open the FOV so the
    // approved point-cloud composition remains visible with deep-space margin.
    const configuredScale = Number(this.presentationScale ?? this.metadata?.config?.camera?.presentationScale ?? 1);
    const isGalaxyE = this.entry.assetId === 'galaxy-e';
    const isNarrowGalaxyE = isGalaxyE && width < 700;
    // E is the tall source rolled for landscape presentation. Open its
    // framing further on desktop, while keeping a slightly wider mobile
    // safety margin so the portrait composition remains readable.
    const minimumScale = isGalaxyE ? (isNarrowGalaxyE ? .68 : .64) : .72;
    const presentationScale = THREE.MathUtils.clamp(isGalaxyE ? Math.min(configuredScale, minimumScale) : configuredScale, minimumScale, 1.2);
    const requiredTanHalf = Math.max(safeX / aspect, safeY) * presentationScale / safeOverscan;
    const minimumFovHalf = isGalaxyE ? (isNarrowGalaxyE ? 13 : 12) : 18;
    const tanHalf = Math.min(Math.tan(rad(42)), Math.max(Math.tan(rad(minimumFovHalf)), requiredTanHalf));
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.params.projectionScale = height * dpr / (2 * tanHalf);
    this.framing = { aspect, fov:this.camera.fov, overscan:safeOverscan, presentationScale, radius:this.radius, safeX, safeY, scrollPitchDegrees:THREE.MathUtils.radToDeg(this.scrollPitchMax), pointerYawDegrees:THREE.MathUtils.radToDeg(this.pointerYawMax), pointerPitchDegrees:THREE.MathUtils.radToDeg(this.pointerPitchMax) };
  }
  update(progress, pointer, dt, time, reducedMotion) {
    if (this.localProgress === null || reducedMotion) this.localProgress = progress;
    else this.localProgress = THREE.MathUtils.damp(this.localProgress, progress, THREE.MathUtils.clamp(Number(this.params.followSpeed ?? 6), 2, 14), dt);
    this.pitch = this.basePitch + (reducedMotion ? 0 : (this.localProgress * 2 - 1) * this.scrollPitchMax + pointer.y * this.pointerPitchMax);
    this.yaw = reducedMotion ? 0 : pointer.x * this.pointerYawMax;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(this.target.x + Math.sin(this.yaw)*cp*this.radius, this.target.y + Math.sin(this.pitch)*this.radius, this.target.z + Math.cos(this.yaw)*cp*this.radius);
    this.camera.lookAt(this.target); // No roll, no distance interpolation, no group transforms.
    for (const cloud of this.clouds) cloud.update(reducedMotion ? 0 : time, this.params);
  }
  dispose() { for (const cloud of this.clouds) cloud.dispose(); this.clouds.length = 0; }
}
