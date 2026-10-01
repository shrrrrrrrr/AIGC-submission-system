import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GalaxyInstance, readAsset, assetUrl } from './GalaxyInstance.js';
import approved from './approved.json';
import { planGalaxyLoads } from './loading.js';

export class GalaxyHomepageRenderer {
  constructor(canvas, root, callbacks = {}) {
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:false, alpha:true, powerPreference:'high-performance'});
    const r=this.renderer;
    r.outputColorSpace=THREE.SRGBColorSpace; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.05;
    r.autoClear=false; r.info.autoReset=false; r.debug.checkShaderErrors=true;
    this.assets=new Map(); this.pending=new Map(); this.failed=new Map(); this.desired=new Set(); this.dead=false;
    this.preparing=new Map();this.progress=new Map();this.callbacks=callbacks;this.root=root;this.lifecycle=new AbortController();this.reportedPercent=-1;
    root.dataset.galaxyPrepared='0';
    this.sections=[...root.querySelectorAll('[data-galaxy-section]')].map(element=>{
      const existing=element.querySelector('[data-galaxy-static]');
      const fallback=existing||document.createElement('div');
      if(!existing){fallback.className='chapter-fallback';fallback.setAttribute('aria-hidden','true');fallback.style.backgroundImage=`url("${assetUrl(`galaxies/${element.dataset.galaxySection}/residual.webp`)}")`;element.prepend(fallback);}
      return {element,id:element.dataset.galaxySection,top:0,height:0,fallback,ownsFallback:!existing};
    });
    this.composer=new EffectComposer(r); this.composer.renderToScreen=false;
    this.renderPass=new RenderPass(new THREE.Scene(),new THREE.PerspectiveCamera());
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),approved.bloomStrength,.42,1);
    this.output=new OutputPass();
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(this.output);
    // Grade the finished image after bloom. Lift midtones and saturation without
    // changing bloom strength, radius, threshold or which pixels generate glow.
    this.copyMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},uBrightness:{value:1.2},uSaturation:{value:1.18}},depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;
        uniform float uBrightness;
        uniform float uSaturation;
        varying vec2 vUv;
        void main(){
          vec3 color=texture2D(tDiffuse,vUv).rgb;
          float luminance=dot(color,vec3(.2126,.7152,.0722));
          color=clamp(mix(vec3(luminance),color,uSaturation),0.,1.);
          // Preserve black and white endpoints instead of clipping highlights.
          color=1.-pow(1.-color,vec3(uBrightness));
          gl_FragColor=vec4(color,1.);
        }`});
    this.quad=new FullScreenQuad(this.copyMaterial);
    this.pointer=new THREE.Vector2(); this.pointerCurrent=new THREE.Vector2(); this.scrollY=window.scrollY;
    this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)'); this.reducedMotion=this.motionQuery.matches;
    this.time=0; this.lastTime=0; this.fps=60; this.dirty=true; this.visible=[]; this.frameCalls=0;
    this.onScroll=()=>{this.scrollY=window.scrollY;};
    this.onResize=()=>{this.resize();this.dirty=true;};
    this.onMotion=()=>{this.reducedMotion=this.motionQuery.matches;};
    this.onVisibility=()=>{this.lastTime=0;};
    this.onPointer=e=>{if(e.pointerType==='mouse')this.pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);};
    this.onBlur=()=>this.pointer.set(0,0);
    this.onContextLost=e=>{e.preventDefault();this.contextLost=true;for(const s of this.sections)s.fallback.dataset.ready='false';};
    this.onContextRestored=()=>{this.contextLost=false;this.dirty=true;this.lastTime=0;};
    window.addEventListener('scroll',this.onScroll,{passive:true}); window.addEventListener('resize',this.onResize,{passive:true});
    window.addEventListener('pointermove',this.onPointer,{passive:true}); window.addEventListener('blur',this.onBlur);
    document.addEventListener('visibilitychange',this.onVisibility);this.motionQuery.addEventListener('change',this.onMotion);
    canvas.addEventListener('webglcontextlost',this.onContextLost);canvas.addEventListener('webglcontextrestored',this.onContextRestored);
    this.observer=new ResizeObserver(()=>{this.dirty=true;});this.observer.observe(root);
    document.fonts.ready.then(()=>{if(!this.dead)this.dirty=true;});
    this.resize();this.measure();
  }
  async initialize(){
    try {this.manifest=await readAsset('galaxies/manifest.json',this.lifecycle.signal);if(!this.dead)this.reportProgress();}
    catch(error){if(!this.dead)this.initialError=error.message;}
  }
  reportProgress(){
    if(this.dead||!this.manifest)return;
    const entries=this.manifest.assets;
    const percent=this.assets.size===entries.length?100:Math.min(99,Math.floor(entries.reduce((sum,entry)=>sum+(this.progress.get(entry.assetId)||0),0)/entries.length*100));
    if(percent!==this.reportedPercent){this.reportedPercent=percent;this.callbacks.onProgress?.(percent);}
    this.root.dataset.galaxyPrepared=String(this.assets.size);
  }
  measure(){for(const s of this.sections){const rect=s.element.getBoundingClientRect();s.top=rect.top+window.scrollY;s.height=rect.height;}this.dirty=false;}
  resize(){
    this.width=innerWidth;this.height=innerHeight;this.mobile=innerWidth<700;
    this.dpr=Math.min(devicePixelRatio||1,this.mobile?1:1.5);
    this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(this.width,this.height,false);
    this.composer.setPixelRatio(this.dpr);this.composer.setSize(this.width,this.height);
    // Keep the approved bloom on desktop; phones use the same stars without bloom cost.
    this.bloom.enabled=approved.bloom&&!this.mobile;
    for(const a of this.assets.values())a.resize(this.width,this.height,this.dpr);
  }
  async ensure(id){
    if(this.assets.has(id)||this.pending.has(id)||this.failed.has(id)||!this.manifest||this.dead)return;
    const entry=this.manifest.assets.find(e=>e.assetId===id);if(!entry)return;
    const controller=new AbortController();this.pending.set(id,controller);
    let asset;
    try{
      asset=await GalaxyInstance.load(entry,controller.signal,value=>{if(!this.dead){this.progress.set(id,value);this.reportProgress();}});
      if(this.dead||controller.signal.aborted){asset.dispose();return;}
      this.preparing.set(id,asset);asset.resize(this.width,this.height,this.dpr);
      asset.update(.5,new THREE.Vector2(),0,0,true);
      await this.renderer.compileAsync(asset.scene,asset.camera);
      if(this.dead||controller.signal.aborted){asset.dispose();return;}
      // A resize may have happened while shaders were compiling.
      asset.resize(this.width,this.height,this.dpr);
      // Draw once into the offscreen composer to upload all buffers and prepare
      // postprocessing before revealing it. Existing visual settings are kept.
      this.renderer.setScissorTest(false);this.renderPass.scene=asset.scene;this.renderPass.camera=asset.camera;
      this.bloom.enabled=!this.mobile&&Boolean(asset.params.bloom);this.bloom.strength=Number(asset.params.bloomStrength??.42);
      this.composer.render(0);this.renderer.setRenderTarget(null);asset.localProgress=null;
      this.assets.set(id,asset);this.progress.set(id,1);this.reportProgress();
    }catch(error){asset?.dispose();if(!this.dead&&error.name!=='AbortError')this.failed.set(id,error.message);}
    finally{this.preparing.delete(id);if(this.pending.get(id)===controller)this.pending.delete(id);}
  }
  syncResources(visible){
    const ids=visible.map(s=>s.id);this.desired=new Set(ids);
    const center=this.scrollY+this.height*.5;
    const nearest=this.sections.reduce((best,s)=>Math.abs(s.top+s.height*.5-center)<Math.abs(best.top+best.height*.5-center)?s:best,this.sections[0]);
    if(!ids.length)this.desired.add(nearest.id);
    // Keep all five prepared instances until leaving the homepage. Scrolling
    // back must not download, rebuild or re-upload an already prepared galaxy.
    const order=this.sections.map(s=>s.id);
    for(const id of planGalaxyLoads(order,[...this.desired],this.assets,this.pending,this.failed))this.ensure(id);
  }
  render(now){
    if(this.dead||document.hidden||this.contextLost)return;
    const dt=this.lastTime?Math.min(.05,(now-this.lastTime)/1000):1/60;this.lastTime=now;this.time+=dt;this.fps += (1/dt-this.fps)*(1-Math.exp(-3*dt));
    if(this.dirty)this.measure();
    const followSpeed = this.visible.map(s=>this.assets.get(s.id)?.params?.followSpeed).find(Number.isFinite) ?? 6;
    this.pointerCurrent.lerp(this.pointer,1-Math.exp(-followSpeed*dt));
    const h=this.height,w=this.width,r=this.renderer;
    this.visible=this.sections.filter(s=>s.top<this.scrollY+h&&s.top+s.height>this.scrollY);
    this.syncResources(this.visible);
    r.info.reset();r.setRenderTarget(null);r.setViewport(0,0,w,h);r.setScissorTest(false);r.setClearColor('#02030d',0);r.clear(true,true,true);
    for(const s of this.visible){
      const asset=this.assets.get(s.id);if(!asset)continue;
      const top=Math.max(0,s.top-this.scrollY),bottom=Math.min(h,s.top+s.height-this.scrollY);
      const progress=THREE.MathUtils.clamp((this.scrollY+h*.5-s.top)/s.height,0,1);
      asset.update(progress,this.pointerCurrent,dt,this.time,this.reducedMotion);
      // Always render a FULL viewport. Scissor applies only to final screen-space copy.
      r.setScissorTest(false);this.renderPass.scene=asset.scene;this.renderPass.camera=asset.camera;
      this.bloom.enabled=!this.mobile && Boolean(asset.params.bloom);
      this.bloom.strength=Number(asset.params.bloomStrength ?? .42);
      this.composer.render(dt);
      this.copyMaterial.uniforms.tDiffuse.value=this.composer.readBuffer.texture;
      r.setRenderTarget(null);r.setViewport(0,0,w,h);r.setScissor(0,h-bottom,w,bottom-top);r.setScissorTest(true);
      this.quad.render(r);
      asset.presented=true;
      s.fallback.dataset.ready='true';
      if(s.id==='galaxy-a'&&!this.heroReady){this.heroReady=true;this.callbacks.onHeroReady?.();}
    }
    r.setScissorTest(false);r.setViewport(0,0,w,h);this.frameCalls=r.info.render.calls;
  }
  dispose(){
    this.dead=true;this.lifecycle.abort();for(const c of this.pending.values())c.abort();for(const a of this.preparing.values())a.dispose();this.preparing.clear();for(const a of this.assets.values())a.dispose();this.assets.clear();
    this.observer.disconnect();window.removeEventListener('scroll',this.onScroll);window.removeEventListener('resize',this.onResize);window.removeEventListener('pointermove',this.onPointer);window.removeEventListener('blur',this.onBlur);
    document.removeEventListener('visibilitychange',this.onVisibility);this.motionQuery.removeEventListener('change',this.onMotion);
    for(const s of this.sections){if(s.ownsFallback)s.fallback.remove();else delete s.fallback.dataset.ready;}
    this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);this.renderer.domElement.removeEventListener('webglcontextrestored',this.onContextRestored);
    this.bloom.dispose();this.renderPass.dispose();this.output.dispose();this.composer.dispose();this.copyMaterial.dispose();this.quad.dispose();this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
