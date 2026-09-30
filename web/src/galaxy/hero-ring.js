export function setupHeroRing(root) {
const hero = root.querySelector('.hero');
const ring = root.querySelector('.hero-ring');
if (hero && ring) {
  let disposed = false;
  const listeners = new AbortController();
  const on = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal: listeners.signal });
  const phrase = '生成式VR单元投稿';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const textures = { front: document.createElement('canvas'), back: document.createElement('canvas') };
  canvas.className = 'hero-cylinder-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  ring.replaceChildren(canvas);
  let angle = 0;
  let speed = 0;
  let activity = 0;
  let pointerActivity = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let pointerCurrentX = 0;
  let pointerCurrentY = 0;
  let scrollTarget = 0;
  let scrollCurrent = 0;
  let lastPointer = null;
  let lastTime = 0;
  let visible = true;
  let raf = 0;
  const baseSpeed = 7;
  const maxSpeed = 72;
  const textureWidth = 4096;
  const textureHeight = 640;

  function makeTexture(target, fill, stroke) {
    target.width = textureWidth;
    target.height = textureHeight;
    const textureContext = target.getContext('2d');
    const fontFamily = getComputedStyle(root).getPropertyValue('--top-display').trim() || 'DeyiHei, sans-serif';
    textureContext.clearRect(0, 0, textureWidth, textureHeight);
    let fontSize = 496;
    textureContext.font = `800 ${fontSize}px ${fontFamily}`;
    const measuredWidth = textureContext.measureText(phrase).width;
    if (measuredWidth > textureWidth * .92) {
      fontSize *= (textureWidth * .92) / measuredWidth;
      textureContext.font = `800 ${fontSize}px ${fontFamily}`;
    }
    textureContext.textAlign = 'center';
    textureContext.textBaseline = 'middle';
    textureContext.lineJoin = 'round';
    textureContext.lineWidth = 20;
    // The border itself supplies the separation from the galaxy. Avoid a
    // glow pass here: it softens the Deyi Hei edges after cylinder sampling.
    textureContext.shadowColor = 'transparent';
    textureContext.shadowBlur = 0;
    textureContext.strokeStyle = stroke;
    textureContext.fillStyle = fill;
    textureContext.strokeText(phrase, textureWidth / 2, textureHeight / 2 + 8);
    textureContext.fillText(phrase, textureWidth / 2, textureHeight / 2 + 8);
  }

  function rebuildTextures() {
    makeTexture(textures.front, '#b5a8d8', '#ffffff');
    makeTexture(textures.back, '#ffffff', '#cbb5ff');
  }

  function drawTextureSlice(texture, slice, x0, x1, y, height, mirrored, alpha) {
    const sliceCount = 512;
    const sourceWidth = texture.width / sliceCount;
    const sourceLeft = mirrored ? texture.width - (slice + 1) * sourceWidth : slice * sourceWidth;
    // Overlap neighboring samples slightly so antialiasing never exposes a
    // vertical seam when the texture is compressed around the cylinder.
    const width = Math.max(1, Math.abs(x1 - x0) + 2.4);
    const left = Math.min(x0, x1) - 1.2;
    const flip = (x1 < x0) !== mirrored;
    context.save();
    context.globalAlpha = alpha;
    if (flip) {
      context.translate(left + width, y);
      context.scale(-1, 1);
      context.drawImage(texture, sourceLeft, 0, sourceWidth, texture.height, 0, 0, width, height);
    } else {
      context.drawImage(texture, sourceLeft, 0, sourceWidth, texture.height, left, y, width, height);
    }
    context.restore();
  }

  function drawCylinder() {
    const width = ring.clientWidth;
    const height = ring.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const motionScroll = reduced.matches ? 0 : scrollCurrent;
    const rotation = -(angle + motionScroll * 72) * Math.PI / 180;
    const centerX = width / 2;
    const centerY = height / 2;
    // Fit the largest readable texture into the current viewport while
    // leaving roughly half to one glyph of breathing room between faces.
    const titleHeight = Math.min(196, Math.max(90, width * .15, height * .30));
    const radiusX = Math.min(width * .47, 560);
    const cameraPitch = 14 * Math.PI / 180;
    const radiusZ = Math.min(520, Math.max(width * .22, titleHeight * .65 / Math.sin(cameraPitch)));
    const pitchOffset = radiusZ * Math.sin(cameraPitch);
    const span = 160 * Math.PI / 180;
    const slices = 512;
    const projected = [];
    for (const [texture, phase] of [[textures.front, 0], [textures.back, Math.PI]]) {
      for (let slice = 0; slice < slices; slice += 1) {
        const start = (slice / slices - .5) * span + rotation + phase;
        const end = ((slice + 1) / slices - .5) * span + rotation + phase;
        const middle = (start + end) / 2;
        const z = Math.cos(middle);
        const depth = (z + 1) * .5;
        const x0 = centerX + Math.sin(start) * radiusX;
        const x1 = centerX + Math.sin(end) * radiusX;
        const scale = (.78 + depth * .25) * (phase ? .9 : 1);
        const sliceHeight = titleHeight * scale;
        // Keep each complete texture visually continuous. Depth is already
        // expressed by the cylinder's scale and horizontal compression; a
        // per-slice alpha ramp would make the border look like broken bands.
        const alpha = phase ? .52 + depth * .18 : .98;
        projected.push({ texture, slice, x0, x1, y: centerY - z * pitchOffset - sliceHeight / 2, sliceHeight, z, alpha });
      }
    }
    projected.sort((a, b) => a.z - b.z);
    for (const item of projected) drawTextureSlice(item.texture, item.slice, item.x0, item.x1, item.y, item.sliceHeight, item.z < 0, item.alpha);
  }

  function updateRing() {
    ring.style.perspective = `${ring.clientWidth * 2.4}px`;
    const motionScroll = reduced.matches ? 0 : scrollCurrent;
    // The CSS transform supplies the small camera motion. The canvas itself
    // is a single texture projection onto one invisible Y-axis cylinder.
    ring.style.transform = `rotateX(${8 + motionScroll * 14}deg) rotateY(${pointerCurrentX * 18}deg) rotateZ(${-5 + motionScroll * 8}deg) scale(${(1 - motionScroll * .5).toFixed(3)})`;
    canvas.style.transform = `rotateX(${pointerCurrentY * 7}deg)`;
    drawCylinder();
  }
  function wake() { if (!disposed && !raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(.05, lastTime ? (now - lastTime) / 1000 : 1 / 60);
    lastTime = now;
    activity *= Math.exp(-4.2 * dt);
    pointerActivity *= Math.exp(-5.4 * dt);
    pointerCurrentX += (pointerTargetX - pointerCurrentX) * (1 - Math.exp(-10 * dt));
    pointerCurrentY += (pointerTargetY - pointerCurrentY) * (1 - Math.exp(-10 * dt));
    scrollCurrent += (scrollTarget - scrollCurrent) * (1 - Math.exp(-8 * dt));
    const target = reduced.matches ? 0 : baseSpeed + activity * (maxSpeed - baseSpeed);
    speed += (target - speed) * (1 - Math.exp(-8 * dt));
    angle += speed * dt;
    updateRing();
    if (visible && !document.hidden && (!reduced.matches || Math.abs(speed) > .01)) wake();
  }
  on(hero, 'pointermove', (event) => {
    if (event.pointerType !== 'mouse' || reduced.matches) return;
    const now = performance.now();
    if (lastPointer) {
      const distance = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
      const velocity = distance / Math.max(8, now - lastPointer.time);
      pointerActivity = Math.min(1, pointerActivity * .54 + Math.min(1, velocity * 4.2) * .46);
      activity = Math.min(1, activity + pointerActivity * .52);
    }
    pointerTargetX = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1));
    pointerTargetY = Math.max(-1, Math.min(1, 1 - event.clientY / innerHeight * 2));
    lastPointer = { x: event.clientX, y: event.clientY, time: now };
    wake();
  });
  on(hero, 'pointerleave', () => { lastPointer = null; pointerTargetX = 0; pointerTargetY = 0; });
  const updateScrollTarget = () => {
    const rect = hero.getBoundingClientRect();
    scrollTarget = Math.max(0, Math.min(1, -rect.top / Math.max(1, hero.offsetHeight * .8)));
    wake();
  };
  on(window, 'scroll', updateScrollTarget, { passive: true });
  on(reduced, 'change', () => { if (reduced.matches) { activity = 0; pointerActivity = 0; speed = 0; scrollCurrent = 0; pointerTargetX = 0; pointerTargetY = 0; } wake(); });
  on(document, 'visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; lastTime = 0; } else { lastTime = 0; wake(); } });
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { lastTime = 0; wake(); } else { cancelAnimationFrame(raf); raf = 0; lastTime = 0; } }, { threshold: .01 });
  intersection.observe(hero);
  const resize = new ResizeObserver(updateRing);
  resize.observe(ring);
  rebuildTextures();
  if (document.fonts?.ready) document.fonts.ready.then(() => { if (!disposed) { rebuildTextures(); updateRing(); } });
  updateScrollTarget();
  updateRing();
  wake();
  return () => { disposed = true; listeners.abort(); cancelAnimationFrame(raf); intersection.disconnect(); resize.disconnect(); canvas.remove(); };
}
return () => {};
}