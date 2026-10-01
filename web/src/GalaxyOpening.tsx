import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./styles/galaxy-opening.css";

export function GalaxyOpening({ percent, ready }: { percent: number; ready: boolean }) {
  const [phase, setPhase] = useState<"opening" | "leaving" | "closed">("opening");
  const startedAt = useRef(performance.now());
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === "closed") return;
    const shell = document.querySelector<HTMLElement>(".site-shell");
    const wasInert = shell?.inert ?? false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    if (shell) shell.inert = true;
    document.documentElement.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (shell) shell.inert = wasInert;
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [phase === "closed"]);

  useEffect(() => {
    if (phase === "closed") return;
    // Independent deadlines include the fade and leave a scheduling margin.
    // A delayed fade effect must never start another full waiting period.
    const elapsed = performance.now() - startedAt.current;
    const fade = window.setTimeout(() => setPhase(current => current === "opening" ? "leaving" : current), Math.max(0, 4450 - elapsed));
    const close = window.setTimeout(() => setPhase("closed"), Math.max(0, 4750 - elapsed));
    return () => { window.clearTimeout(fade); window.clearTimeout(close); };
  }, [phase === "closed"]);

  useEffect(() => { if (ready) setPhase(current => current === "opening" ? "leaving" : current); }, [ready]);
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("closed"), 250);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "closed") return null;
  return createPortal(<div ref={panel} className={`galaxy-opening ${phase === "leaving" ? "is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="正在准备首页" tabIndex={-1} onKeyDown={event => { if (event.key === "Escape") setPhase("leaving"); }}>
    <img className="galaxy-opening-background" src={`${import.meta.env.BASE_URL}assets/galaxy-opening.png`} alt="" fetchPriority="high" />
    <div className="galaxy-opening-content">
      <div className="galaxy-opening-percent"><span>已加载</span><strong>{percent}<small>%</small></strong></div>
      <div className="galaxy-opening-track" role="progressbar" aria-label="背景资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="galaxy-opening-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="galaxy-opening-label">loading……</p>
    </div>
  </div>, document.body);
}

export function GalaxyStaticBackground({ id }: { id: string }) {
  const path = `${import.meta.env.BASE_URL}galaxy/previews/${id}`;
  return <div className="chapter-fallback" data-galaxy-static aria-hidden="true">
    <picture>
      <source media="(max-width: 699px)" srcSet={`${path}-mobile.webp`} />
      <source media="(min-aspect-ratio: 2/1)" srcSet={`${path}-wide.webp`} />
      <img src={`${path}-desktop.webp`} alt="" decoding="async" fetchPriority={id === "galaxy-a" ? "high" : "auto"} />
    </picture>
  </div>;
}
