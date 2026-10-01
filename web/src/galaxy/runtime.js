import { GalaxyHomepageRenderer } from './presentation.js';
import { setupHeroRing } from './hero-ring.js';
import { setupNewsReel } from './news-reel.js';

// Every observer, animation and request belongs to this mount, including StrictMode remounts.
export function mountGalaxyHome(root, callbacks = {}) {
  let renderer = null;
  let frame = 0;
  let disposed = false;
  const cleanups = [];
  root.classList.add('reveal-runtime');
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add('is-visible');
  }, { threshold: .08 });
  root.querySelectorAll('[data-reveal], [data-reveal-group]').forEach(element => reveal.observe(element));
  cleanups.push(() => reveal.disconnect());
  for (const setup of [setupHeroRing, setupNewsReel]) {
    try { cleanups.push(setup(root)); }
    catch (error) { console.error('主页交互初始化失败', error); }
  }
  try {
    renderer = new GalaxyHomepageRenderer(root.querySelector('[data-galaxy-canvas]'), root, callbacks);
    void renderer.initialize();
    const tick = time => {
      if (disposed) return;
      renderer.render(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  } catch (error) {
    console.warn('银河使用静态背景：', error);
    // React's static galaxy previews remain usable when WebGL is unavailable.
  }
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach(cleanup => cleanup());
    renderer?.dispose();
    root.classList.remove('reveal-runtime');
  };
}
