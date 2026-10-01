import { useEffect, useRef, useState } from "react";
import { GalaxyOpening, GalaxyStaticBackground } from "./GalaxyOpening";

type GalaxyHomeProps = { onNavigate: (href: string) => void };

export function GalaxyHome({ onNavigate }: GalaxyHomeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("./galaxy/runtime.js").then(({ mountGalaxyHome }) => {
      if (!disposed) cleanup = mountGalaxyHome(root, {
        onProgress: value => { if (!disposed) setPercent(value); },
        onHeroReady: () => { if (!disposed) setReady(true); },
      });
    }).catch((error: unknown) => {
      if (!disposed) console.error("主页动画模块载入失败", error);
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={rootRef} className="galaxy-homepage">
    <GalaxyOpening percent={percent} ready={ready} />
    <canvas className="homepage-galaxy-canvas" data-galaxy-canvas aria-hidden="true" />
    <div className="galaxy-home-content" id="home-content">
      <div className="galaxy-chapter" data-galaxy-section="galaxy-a" aria-label="Galaxy A 首屏">
        <GalaxyStaticBackground id="galaxy-a" />
        <section className="hero" data-reveal>
          <div className="hero-center" data-reveal-group>
            <div className="hero-ring" aria-hidden="true"><div className="ring-band ring-band-back" /></div>
            <h1 className="hero-a11y-title">生成式 VR 影像单元投稿</h1>
            <p className="hero-lede">第26届中国虚拟现实大会作品征集，欢迎电影人、视觉艺术家、数字媒体团队、技术开发者与学生投稿</p>
            <div className="hero-actions">
              <a className="button-link" href="#submit" onClick={() => onNavigate("#submit")}>进入投稿入口 <span>↗</span></a>
              <a className="text-link" href="#requirements" onClick={() => onNavigate("#requirements")}>查看作品要求 ↓</a>
              <a className="button-link hero-personnel" href="#society" onClick={() => onNavigate("#society")}>人员介绍 <span>↗</span></a>
            </div>
          </div>
        </section>
      </div>

      <section className="chapter-footer-divider" aria-label="页面信息分隔"><span>生成式VR影像投稿主页</span><span>ChinaVR 2026 · 中国广州</span></section>

      <div className="galaxy-chapter" data-galaxy-section="galaxy-e" aria-label="Galaxy E 大会动态">
        <GalaxyStaticBackground id="galaxy-e" />
        <section className="experience" id="news" aria-label="大会资讯胶卷" data-reveal>
          <div className="section-index" />
          <div className="experience-heading"><h2>大会动态<br /><em>主旨报告嘉宾</em></h2><p>移动鼠标或按住拖动胶卷，点击图片阅读详情。</p></div>
          <div className="stage" data-news-stage aria-label="左右移动或按住拖动胶卷旋转；也可使用下方切换按钮"><div className="world" data-news-world><div className="halo" aria-hidden="true" /><svg className="orbit-guide" viewBox="0 0 1100 650" aria-hidden="true"><ellipse cx="550" cy="224" rx="414" ry="92" transform="rotate(-12 550 224)" /><ellipse cx="550" cy="224" rx="424" ry="103" transform="rotate(-12 550 224)" /></svg><img className="portrait" decoding="async" data-news-src="/assets/head.png" alt="蓝色网格构成的数字人物" draggable="false" width="1280" height="1280" /><div data-news-frames /></div></div>
          <div className="interaction-hint"><span aria-hidden="true">↔</span>移动鼠标或按住拖动，查看更多资讯</div>
          <div className="reader"><div className="reader-label"><span>正在展映</span><span data-news-counter>01 / 05</span></div><a data-news-current-link target="_blank" rel="noopener noreferrer" /><div className="controls"><button data-news-previous aria-label="上一条资讯">←</button><button data-news-next aria-label="下一条资讯">→</button></div><p data-news-announcement className="sr-only" aria-live="polite" /></div>
        </section>
      </div>

      <section className="facts-band" data-reveal aria-label="大会关键信息"><div><span>大会时间</span><strong>2026.11.06—11.08</strong><small>中国 · 广州</small></div><div><span>投稿截止</span><strong>2026.10.12</strong><small>23:59:59 前完成提交</small></div><div><span>作品主题</span><strong>AI + VR</strong><small>前沿科技、传统文化、科幻作品</small></div></section>

      <div className="galaxy-chapter" data-galaxy-section="galaxy-b" aria-label="Galaxy B 单元介绍">
        <GalaxyStaticBackground id="galaxy-b" />
        <section className="story-section story-intro" data-reveal data-reveal-group><div className="section-index" /><div className="split-heading"><h2>让影像进入<br /><em>另一个维度</em></h2><div><p className="lead-copy">生成式人工智能正在改变影像的诞生方式，虚拟现实正在改变观众与世界的关系。</p><p>本单元面向电影人、视觉艺术家、数字媒体团队、技术开发者与学生，征集由 AI 驱动、面向沉浸体验的影像作品。</p></div></div></section>
        <section className="story-section themes-section" id="themes" data-reveal data-reveal-group><div className="section-index" /><div className="section-head"><h2>从真实世界，<em>进入想象世界</em></h2><p>二维影像、实时影像、动画、3D VR/MR 与科研可视化，都可以成为生成式 VR 影像。</p></div><div className="theme-grid"><article className="theme-card" data-reveal><span>01</span><h3>前沿科技</h3><p>探索人工智能、虚拟现实与 AIGC 带来的新叙事方式。</p></article><article className="theme-card" data-reveal><span>02</span><h3>传统文化</h3><p>让历史、民俗、传统工艺或地域记忆在新的媒介中获得当代表达。</p></article><article className="theme-card" data-reveal><span>03</span><h3>科幻作品</h3><p>描绘奇幻世界，写就无限可能。</p></article></div></section>
      </div>

      <section className="requirements-divider" id="requirements"><div className="section-index" /><div className="section-head"><h2>提交前，<em>请确认您的作品</em></h2><p>具体细则以组委会正式通知为准</p></div></section>
      <section className="story-section requirements-section requirements-reading" aria-label="作品要求细则" data-reveal data-reveal-group><div className="requirements-grid"><article><h3>作品与链接</h3><ul><li>主体作品时长 2—10 分钟，另附不超过 1 分钟的制作解析。</li><li>主体作品和制作解析须发布在公开视频平台。</li><li>主体作品使用 3 秒统一电子剧场片头，并包含片尾。</li><li>接受叙事片、纪实片、纪录片、科幻片、实验影像、动画、实时影像、科研可视化及 3D VR/MR 等形式。</li></ul></article><article><h3>技术与权利</h3><ul><li>技术规格不低于 1920×1080，建议 16:9 横屏。</li><li>鼓励 AIGC 与传统视频制作方式结合。</li><li>AI 参与核心视听内容原则上不低于 80%。</li><li>音乐、字体、模型、数据与肖像等素材须拥有合法使用权。</li></ul></article><article><h3>投稿事项</h3><ul><li>公开视频平台：抖音、B 站、小红书、视频号。</li><li>不得删除、遮挡或修改模板中的赛事标识。</li><li>提交创作构想、工具、工作流程与人工贡献说明。</li><li>学生参赛者须注明学校、专业及指导教师信息。</li></ul></article></div></section>

      <div className="galaxy-chapter" data-galaxy-section="galaxy-c" aria-label="Galaxy C 时间节点与评审">
        <GalaxyStaticBackground id="galaxy-c" />
        <section className="story-section timeline-section" id="timeline" data-reveal data-reveal-group><div className="section-index" /><div className="section-head"><h2>把想法，<em>送到展映现场</em></h2><p>从提交链接到大会展映，每一步都可以被看见。</p></div><div className="timeline-grid"><article><span>NOW → 10.12</span><h3>作品征集</h3><p>注册账号，填写作品资料，提交公开视频链接与创作说明。</p></article><article><span>10 月</span><h3>核验与评审</h3><p>组委会核验链接与材料，专家从创意、表达和技术完成度进行评审。</p></article><article><span>11.06—11.08</span><h3>大会展映</h3><p>优秀作品在第26届中国虚拟现实大会现场与线上渠道展示。</p></article></div></section>
        <section className="story-section jury-section" data-reveal data-reveal-group><div className="section-index" /><div className="jury-grid"><div><h2>让技术服务于<br /><em>一次真实的观看</em></h2><p>我们关注作品是否建立了独特的视觉语言，也关注 AI 与人的创作关系是否清晰、诚实而有创造力。</p></div><div className="score-list"><div><b>01</b><span><strong>创意与表达</strong><small>主题、叙事、视觉语言与情绪传达</small></span></div><div><b>02</b><span><strong>技术与完成度</strong><small>视听质量、空间体验与整体完成度</small></span></div><div><b>03</b><span><strong>AI 参与与创新</strong><small>生成式工具的使用方式与创作价值</small></span></div></div></div></section>
      </div>

      <section className="source-divider" aria-label="公开视频平台说明"><h2>视频留在公开平台，<br /><em>故事来到这里</em></h2></section>
      <div className="galaxy-chapter" data-galaxy-section="galaxy-d" aria-label="Galaxy D 投稿说明">
        <GalaxyStaticBackground id="galaxy-d" />
        <section className="source-band" data-reveal data-reveal-group><p>本站只接收公开视频链接、投稿说明和必要的作品信息，不托管或下载参赛视频。</p><a className="button-link" href="#submit" onClick={() => onNavigate("#submit")}>查看投稿入口 <span>↗</span></a></section>
        <section className="final-cta" data-reveal data-reveal-group><div className="final-brand"><img loading="lazy" decoding="async" fetchPriority="low" src="/assets/chinavr-2026-wordmark.png" alt="ChinaVR 2026 标志" /><span className="section-index">HERE WE GO!</span></div><div className="final-copy"><h2>你的作品<br /><em>一定能够闪耀！</em></h2></div><a className="button-link" href="#submit" onClick={() => onNavigate("#submit")}>开始投稿 <span>↗</span></a></section>
      </div>
    </div>
  </div>;
}
