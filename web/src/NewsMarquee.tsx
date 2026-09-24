import { useEffect, useRef } from "react";
import { newsItems } from "./news";

type NewsGroupProps = { ariaHidden?: boolean };

function NewsGroup({ ariaHidden = false }: NewsGroupProps) {
  return <div className="news-marquee-group" aria-hidden={ariaHidden}>
    {newsItems.map((item) => <a className="news-card" href={item.href} target="_blank" rel="noopener noreferrer" key={`${ariaHidden ? "duplicate-" : ""}${item.image}`}>
      <span className="news-card-media"><img src={item.image} alt="" loading="lazy" decoding="async" /><span className="news-card-film-edge" aria-hidden="true" /></span>
      <span className="news-card-caption"><span className="news-card-title">{item.title}</span><span className="news-card-read">阅读详情 <span aria-hidden="true">↗</span></span></span>
    </a>)}
  </div>;
}

export function NewsMarquee() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let offset = 0;
    let loopWidth = 0;
    let lastTime = performance.now();

    const measure = () => {
      const groups = Array.from(track.querySelectorAll<HTMLElement>(".news-marquee-group"));
      loopWidth = groups.length > 1 ? groups[1].offsetLeft - groups[0].offsetLeft : 0;
    };

    const render = () => {
      const cards = Array.from(track.querySelectorAll<HTMLElement>(".news-card"));
      const center = viewport.clientWidth / 2;
      const influence = Math.max(viewport.clientWidth * .72, 320);
      for (const card of cards) {
        const group = card.parentElement as HTMLElement | null;
        if (!group) continue;
        let cardCenter = group.offsetLeft + card.offsetLeft - offset + card.offsetWidth / 2;
        if (loopWidth > 0) {
          while (cardCenter - center < -loopWidth / 2) cardCenter += loopWidth;
          while (cardCenter - center > loopWidth / 2) cardCenter -= loopWidth;
        }
        const distance = Math.min(Math.abs(cardCenter - center) / influence, 1);
        const depth = 1 - distance;
        const scale = .74 + depth * .26;
        const rotateY = Math.max(-1, Math.min(1, (cardCenter - center) / influence)) * -16;
        const translateY = (1 - scale) * 26;
        card.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotateY(${rotateY.toFixed(2)}deg)`;
        card.style.opacity = `${(.62 + depth * .38).toFixed(3)}`;
        card.style.zIndex = String(Math.round(scale * 100));
      }
    };

    const resizeObserver = new ResizeObserver(() => { measure(); render(); });
    resizeObserver.observe(viewport);
    resizeObserver.observe(track);
    measure();
    render();

    if (reduceMotion.matches) return () => resizeObserver.disconnect();

    const tick = (time: number) => {
      const elapsed = Math.min(time - lastTime, 80);
      lastTime = time;
      if (!pausedRef.current && loopWidth > 0) {
        offset += elapsed * .032;
        if (offset >= loopWidth) offset -= loopWidth;
        track.style.transform = `translate3d(${-offset.toFixed(2)}px, 0, 0)`;
        render();
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, []);

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return <section className="news-section" aria-labelledby="news-title">
    <div className="news-section-heading">
      <div><span className="event-section-index">02 / NEWS REEL</span><h2 id="news-title">大会动态<br /><em>主旨报告嘉宾</em></h2></div>
      <p>滚动查看大会最新资讯，点击图片或文字阅读完整内容。</p>
    </div>
    <div className="news-marquee" ref={viewportRef} role="region" aria-label="大会动态滚动资讯" onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) resume(); }}>
      <div className="news-marquee-track" ref={trackRef}><NewsGroup /><NewsGroup ariaHidden /></div>
    </div>
  </section>;
}
