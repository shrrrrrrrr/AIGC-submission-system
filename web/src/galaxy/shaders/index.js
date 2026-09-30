export const starVertex = `
uniform float uTime; uniform float uDepthStrength; uniform float uMorph; uniform float uSize; uniform float uProjectionScale; uniform float uCameraProgress; uniform float uParallax; uniform vec2 uPointer; uniform float uIntensity;
attribute float aSize; attribute vec3 aColor; attribute float aEmissive; attribute float aSeed;
varying vec3 vColor; varying float vEmissive; varying float vDepth; varying float vSeed; varying float vIntensity;
void main() {
  vec3 volume = position;
  float referenceScale = 50.0 / max(1.0, 28.0 - volume.z);
  vec3 imagePosition = vec3(volume.xy * referenceScale, -22.0);
  vec3 p = mix(imagePosition, volume, clamp(uMorph, 0.0, 1.0));
  p.z = -22.0 + (p.z + 22.0) * uDepthStrength;
  float depth01 = clamp((-p.z - 5.0) / 85.0, 0.0, 1.0);
  p.xy += uPointer * mix(1.0, 0.1, depth01) * uParallax * 0.08;
  p.x += sin(uTime * 0.18 + aSeed * 6.2831) * 0.018 * uDepthStrength * (1.0 - depth01);
  p.y += cos(uTime * 0.12 + aSeed * 4.1) * 0.010 * uDepthStrength * (1.0 - depth01);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uSize * uProjectionScale / max(1.0, -mv.z), 0.65, 14.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor; vEmissive = aEmissive; vDepth = depth01; vSeed = aSeed; vIntensity = uIntensity;
}
`;
export const starFragment = `
uniform float uTime;
varying vec3 vColor; varying float vEmissive; varying float vDepth; varying float vSeed; varying float vIntensity;
void main() {
  vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard;
  float core = exp(-d * d * 7.5); float halo = exp(-d * d * 2.7);
  float twinkle = 0.88 + 0.12 * sin(uTime * (0.55 + vSeed * 0.7) + vSeed * 17.0);
  float haze = mix(0.42, 1.0, 1.0 - vDepth);
  vec3 color = vColor * (0.45 * halo + (0.85 + vEmissive * 1.7) * core) * twinkle * haze * vIntensity;
  float alpha = (0.20 * halo + 0.92 * core) * mix(0.42, 1.0, 1.0 - vDepth) * vIntensity;
  gl_FragColor = vec4(color, alpha);
}
`;
export const nebulaVertex = `
uniform float uTime; uniform float uDepthStrength; uniform float uMorph; uniform float uSize; uniform float uProjectionScale; uniform float uThickness; uniform float uCameraProgress; uniform float uParallax; uniform vec2 uPointer; uniform float uIntensity;
attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aDensity; attribute float aSeed;
varying vec3 vColor; varying float vAlpha; varying float vDensity; varying float vDepth; varying float vSeed; varying float vIntensity;
void main() {
  vec3 volume = position; float referenceScale = 50.0 / max(1.0, 28.0 - volume.z);
  vec3 imagePosition = vec3(volume.xy * referenceScale, -22.0);
  vec3 p = mix(imagePosition, volume, clamp(uMorph, 0.0, 1.0)); p.z = -22.0 + (p.z + 22.0) * uDepthStrength;
  float depth01 = clamp((-p.z - 5.0) / 85.0, 0.0, 1.0);
  p.xy += uPointer * mix(1.0, 0.1, depth01) * uParallax * 0.045;
  p.z += sin(uTime * 0.06 + aSeed * 31.0) * 0.04 * uDepthStrength * uThickness * (1.0 - depth01 * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uSize * 2.8 * uProjectionScale / max(1.0, -mv.z), 0.6, 18.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor; vAlpha = aAlpha; vDensity = aDensity; vDepth = depth01; vSeed = aSeed; vIntensity = uIntensity;
}
`;
export const nebulaFragment = `
uniform float uPointDensity; varying vec3 vColor; varying float vAlpha; varying float vDensity; varying float vDepth; varying float vSeed; varying float vIntensity;
void main() {
  if (vSeed > uPointDensity) discard;
  vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard;
  float soft = pow(max(0.0, 1.0 - d), 1.55); float depthFade = mix(0.74, 0.15, vDepth);
  float densityLight = 0.38 + vDensity * 0.82;
  gl_FragColor = vec4(vColor * densityLight * vIntensity, soft * vAlpha * depthFade * vIntensity / max(0.2, uPointDensity));
}
`;
export const foregroundVertex = `
uniform float uTime; uniform float uSize; uniform float uProjectionScale; uniform float uCameraProgress; uniform vec2 uPointer;
attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aSeed;
varying vec3 vColor; varying float vAlpha; varying float vDepth;
void main() {
  vec3 p = position; p.xy += uPointer * 0.10;
  p.x += sin(uTime * 0.22 + aSeed * 21.0) * 0.018; p.y += cos(uTime * 0.18 + aSeed * 17.0) * 0.014;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(aSize * uSize * uProjectionScale / max(1.0, -mv.z), 0.55, 8.0); gl_Position = projectionMatrix * mv;
  vColor = aColor; vAlpha = aAlpha; vDepth = clamp((-mv.z - 2.0) / 13.0, 0.0, 1.0);
}
`;
export const foregroundFragment = `
uniform float uCleanup; uniform float uSoftness; varying vec3 vColor; varying float vAlpha; varying float vDepth;
void main() {
  vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard;
  float soft = pow(max(0.0, 1.0 - d), 1.65 + uSoftness * 1.2); float nearFade = smoothstep(0.0, 0.72, vDepth);
  vec3 neutral = mix(vColor, vec3(dot(vColor, vec3(0.30, 0.59, 0.11))), uCleanup * 0.65);
  gl_FragColor = vec4(neutral * 0.42, soft * vAlpha * nearFade * (1.0 - uCleanup * 0.32));
}
`;
export const residualVertex = `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const residualFragment = `uniform sampler2D uTexture; uniform float uOpacity; varying vec2 vUv; void main(){vec4 c=texture2D(uTexture,vUv); gl_FragColor=vec4(c.rgb,uOpacity*c.a);}`;
