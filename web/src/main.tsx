import { StrictMode, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Route = "home" | "login" | "submit";
type Notice = { tone: "success" | "error" | "info"; text: string };

const navigation = [
  ["#about", "赛事介绍"],
  ["#tracks", "投稿方向"],
  ["#rules", "参赛规则"],
  ["#review", "评审标准"],
  ["#timeline", "时间安排"],
  ["#notices", "通知"],
] as const;

const tracks = [
  { number: "01", title: "前沿科技", english: "FRONTIER TECHNOLOGY", text: "探索计算、感知与空间媒介的新表达。" },
  { number: "02", title: "传统文化", english: "LIVING HERITAGE", text: "让文化记忆在新的观看方式中继续生长。" },
  { number: "03", title: "科学幻想", english: "SPECULATIVE FUTURES", text: "以想象回应未知，建立可进入的未来场景。" },
] as const;

const steps = [
  ["01", "准备材料", "确认作品信息、创作者资料与公开链接。"],
  ["02", "逐条预检", "平台、可见性、时长和分辨率由服务端校验。"],
  ["03", "确认提交", "确认声明后生成不可变的投稿版本。"],
  ["04", "等待审查", "组委会完成资格审查后进入评审流程。"],
] as const;

function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (route === "home" && window.location.hash && document.getElementById(window.location.hash.slice(1))) {
      window.requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else if (route !== "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [route]);

  const navigate = (href: string) => {
    setMenuOpen(false);
    window.location.hash = href.replace("#", "");
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <Header menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} onNavigate={navigate} />
      <main id="main-content">
        {route === "home" ? <Home onNavigate={navigate} /> : route === "login" ? <LoginPage onNavigate={navigate} /> : <SubmissionPage onNavigate={navigate} />}
      </main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

function readRoute(): Route {
  const hash = window.location.hash.slice(1);
  return hash === "login" ? "login" : hash === "submit" ? "submit" : "home";
}

function Header({ menuOpen, onMenuToggle, onNavigate }: { menuOpen: boolean; onMenuToggle: () => void; onNavigate: (href: string) => void }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#home" aria-label="CHINAVR 2026 首页" onClick={() => onNavigate("#home")}>
          <BrandMark />
          <span className="brand-wordmark"><strong>CHINAVR</strong><em>2026</em></span>
        </a>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} aria-controls="primary-nav" onClick={onMenuToggle}>
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
        <nav id="primary-nav" className={`primary-nav ${menuOpen ? "is-open" : ""}`} aria-label="主导航">
          {navigation.map(([href, label]) => <a key={href} href={href} onClick={() => onNavigate(href)}>{label}</a>)}
          <a className="header-login" href="#login" onClick={() => onNavigate("#login")}>登录</a>
          <a className="button button-small button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>立即投稿 <span aria-hidden="true">↗</span></a>
        </nav>
      </div>
    </header>
  );
}

function Home({ onNavigate }: { onNavigate: (href: string) => void }) {
  return (
    <>
      <section className="hero" id="home" aria-labelledby="hero-title">
        <div className="hero-grid">
          <div className="hero-copy reveal reveal-one">
            <p className="eyebrow"><span className="eyebrow-dot" /> 第二十六届中国虚拟现实大会 · 影像单元</p>
            <h1 id="hero-title">让作品进入<br /><span>新的观看现场</span></h1>
            <p className="hero-lede">面向 AI、VR 与空间影像创作者的公开征集。用一份清晰、可追踪的投稿，开启作品的下一次展映。</p>
            <div className="hero-actions">
              <a className="button button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>开始准备投稿 <span aria-hidden="true">↗</span></a>
              <a className="text-link light-link" href="#rules" onClick={() => onNavigate("#rules")}>先看参赛规则 <span aria-hidden="true">↓</span></a>
            </div>
            <dl className="hero-facts" aria-label="投稿关键信息">
              <div><dt>截止时间</dt><dd>以官方公告为准</dd></div>
              <div><dt>作品时长</dt><dd><span className="mono">02:00—10:00</span></dd></div>
              <div><dt>交付方式</dt><dd>公开视频链接</dd></div>
            </dl>
          </div>
          <LightField />
        </div>
        <div className="hero-foot"><span>OPEN CALL / 2026</span><span className="scroll-cue"><i /> 向下探索</span></div>
      </section>

      <section className="intro-section section-pad" id="about" aria-labelledby="intro-title">
        <div className="section-kicker"><span>01</span><span>THE OPEN CALL</span></div>
        <div className="intro-grid">
          <h2 id="intro-title">一场关于<br /><em>未来影像</em>的<br />公开对话。</h2>
          <div className="intro-body"><p className="lead-paragraph">我们相信，技术不是作品的终点，而是新的观看关系。ChinaVR 2026 AI、VR 影像单元，邀请创作者把算法、空间与叙事放在一起，提交一份可以被理解、被核验、被记住的作品。</p><p>本站只接收经认可的视频平台公开链接，不上传、不托管原始视频。每条链接都会经过服务端安全预检，提交后由组委会完成资格审查与专业评审。</p><a className="text-link dark-link" href="#tracks" onClick={() => onNavigate("#tracks")}>浏览三个投稿方向 <span aria-hidden="true">→</span></a></div>
        </div>
      </section>

      <section className="tracks-section section-pad" id="tracks" aria-labelledby="tracks-title">
        <div className="section-heading"><div><div className="section-kicker"><span>02</span><span>CHOOSE YOUR FIELD</span></div><h2 id="tracks-title">你的作品，<em>从哪里出发？</em></h2></div><p>选择最能描述作品核心经验的方向。方向用于组织评审，不限制作品的媒介组合。</p></div>
        <div className="track-grid">{tracks.map((track) => <article className="track-card" key={track.number}><span className="track-number mono">{track.number}</span><div className="track-line" /><h3>{track.title}</h3><p className="track-english">{track.english}</p><p>{track.text}</p><a className="track-arrow" href="#submit" onClick={() => onNavigate("#submit")} aria-label={`选择${track.title}方向`}>↗</a></article>)}</div>
      </section>

      <section className="rules-section section-pad" id="rules" aria-labelledby="rules-title">
        <div className="section-heading"><div><div className="section-kicker"><span>03</span><span>PREPARE WITH CONFIDENCE</span></div><h2 id="rules-title">先准备好，<em>再开始。</em></h2></div><a className="text-link dark-link" href="#submit" onClick={() => onNavigate("#submit")}>查看投稿入口 <span aria-hidden="true">↗</span></a></div>
        <div className="prep-grid"><div className="prep-statement"><span className="quote-mark">“</span><p>把创作时间留给作品，把流程交给系统。</p><span className="statement-note">一份材料清晰、链接可访问、声明完整的投稿，会更快进入审查。</span></div><div className="prep-list"><PrepItem number="A" title="作品链接" text="主体作品与制作解析发布在认可的公共视频平台。" /><PrepItem number="B" title="公开可见" text="无需登录即可访问，服务端会进行安全预检。" /><PrepItem number="C" title="创作声明" text="完成 AI 使用、版权与原创性等必要声明。" /></div></div>
      </section>

      <section className="review-section section-pad" id="review" aria-labelledby="review-title"><div className="review-layout"><div><div className="section-kicker inverse"><span>04</span><span>HOW IT MOVES</span></div><h2 id="review-title">从链接到<br /><em>展映现场。</em></h2></div><div className="process-grid">{steps.map(([number, title, text]) => <div className="process-step" key={number}><span className="process-number mono">{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>

      <section className="timeline-section section-pad" id="timeline" aria-labelledby="timeline-title"><div className="section-heading"><div><div className="section-kicker"><span>05</span><span>KEY MOMENTS</span></div><h2 id="timeline-title">重要节点，<em>以官方公告为准。</em></h2></div><p className="timeline-note">赛事日期、场地与通知节点将在配置确认后同步更新。</p></div><div className="timeline-line"><div className="timeline-point is-active"><span className="timeline-dot" /><span className="timeline-date mono">NOW</span><strong>开放准备</strong><small>注册账号，整理材料</small></div><div className="timeline-point"><span className="timeline-dot" /><span className="timeline-date mono">TBD</span><strong>投稿截止</strong><small>以官方公告为准</small></div><div className="timeline-point"><span className="timeline-dot" /><span className="timeline-date mono">TBD</span><strong>结果通知</strong><small>以官方公告为准</small></div><div className="timeline-point"><span className="timeline-dot" /><span className="timeline-date mono">TBD</span><strong>展映归档</strong><small>以官方公告为准</small></div></div></section>

      <section className="notice-section section-pad" id="notices" aria-labelledby="notice-title"><div className="notice-panel"><div><div className="section-kicker"><span>06</span><span>NOTICE BOARD</span></div><h2 id="notice-title">准备好让作品<br /><em>被看见了吗？</em></h2></div><div className="notice-action"><p>创建账号后，你可以保存草稿、逐条检测链接，并在提交后查看审查进度。</p><a className="button button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>进入投稿系统 <span aria-hidden="true">↗</span></a></div></div></section>
    </>
  );
}

function LightField() {
  return <div className="light-field" aria-label="抽象光场坐标装饰" role="img"><div className="field-noise" /><div className="field-orbit orbit-one" /><div className="field-orbit orbit-two" /><div className="field-frame frame-one"><span /><span /><span /><span /></div><div className="field-frame frame-two"><span /><span /><span /><span /></div><div className="field-core"><i /><b /><strong /></div><div className="field-coordinates mono"><span>VR / 26.00</span><span>光场档案 · 01</span><span>34° 12′ 08″ N</span></div><div className="field-caption">IMAGE / SPACE / MEMORY</div></div>;
}

function PrepItem({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="prep-item"><span className="prep-number mono">{number}</span><div><h3>{title}</h3><p>{text}</p></div><span className="prep-check" aria-hidden="true">✓</span></div>;
}

function LoginPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
      if (!response.ok) throw new Error(body.message || "登录暂时不可用，请稍后再试");
      setNotice({ tone: "success", text: "登录成功，正在进入投稿工作台。" });
      window.setTimeout(() => onNavigate("#submit"), 450);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "登录暂时不可用，请稍后再试" });
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="auth-page section-pad" aria-labelledby="login-title"><div className="auth-layout"><div className="auth-intro"><div className="section-kicker inverse"><span>ACCOUNT / 01</span><span>SECURE ENTRY</span></div><h1 id="login-title">把下一步<br /><em>交给作品。</em></h1><p>登录后可以继续草稿、检测公开视频链接，并查看投稿状态。登录失败时我们不会透露邮箱是否已注册。</p><a className="text-link light-link" href="#home" onClick={() => onNavigate("#home")}>返回公开站 <span aria-hidden="true">↗</span></a></div><form className="auth-card" onSubmit={submit}><div className="card-topline"><span>CHINAVR 2026</span><span className="mono">AUTH / 01</span></div><label htmlFor="email">邮箱地址<span className="required">*</span></label><input id="email" name="email" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /><label htmlFor="password">密码<span className="required">*</span></label><input id="password" name="password" type="password" autoComplete="current-password" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={15} placeholder="至少 15 个字符" /><div className="form-meta"><a href="#register" onClick={(event) => { event.preventDefault(); setNotice({ tone: "info", text: "注册页面将在账号接口完成后接入。" }); }}>还没有账号？注册</a><a href="#reset" onClick={(event) => { event.preventDefault(); setNotice({ tone: "info", text: "重置密码会通过邮箱发送一次性链接。" }); }}>忘记密码</a></div>{notice && <div className={`form-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}<button className="button button-cinnabar button-full" type="submit" disabled={submitting}>{submitting ? "正在验证…" : "安全登录"} <span aria-hidden="true">↗</span></button><p className="auth-footnote">会话使用安全 Cookie 保存；请勿在公共设备上保存密码。</p></form></div></section>;
}

function SubmissionPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const formSteps = ["方向与形式", "主体作品链接", "制作解析链接", "导览与体验", "权利与 AI 披露", "确认提交"];
  return <section className="submission-page section-pad" aria-labelledby="submission-title"><div className="submission-head"><div><div className="section-kicker"><span>SUBMISSION / 01</span><span>DRAFT WORKSPACE</span></div><h1 id="submission-title">准备一份<br /><em>完整的投稿。</em></h1></div><button className="text-button" type="button" onClick={() => onNavigate("#home")}>返回公开站 <span aria-hidden="true">↗</span></button></div><div className="submission-layout"><aside className="step-rail" aria-label="投稿步骤"><div className="rail-status"><span className="status-dot" /> 草稿 · 未提交</div>{formSteps.map((step, index) => <button className={`step-button ${index === activeStep ? "is-active" : ""} ${index < activeStep ? "is-done" : ""}`} type="button" key={step} onClick={() => setActiveStep(index)}><span className="step-index mono">0{index + 1}</span><span>{step}</span>{index < activeStep && <span className="step-done" aria-label="已完成">✓</span>}</button>)}<div className="rail-help"><span className="mono">TIP / 01</span><p>每一步只处理一类材料。离开页面前，系统会提示未保存内容。</p></div></aside><div className="submission-card"><div className="submission-card-head"><div><span className="mono">STEP 0{activeStep + 1} / 06</span><h2>{formSteps[activeStep]}</h2></div><span className="save-status" aria-live="polite">{saved ? "已保存于刚刚" : "尚未保存"}</span></div>{activeStep === 0 ? <><p className="step-lead">先告诉我们作品属于哪个方向，以及它如何被观看。</p><div className="field-grid"><Field name="title" label="作品名称" placeholder="请输入正式作品名" /><Field name="track" label="投稿方向" placeholder="请选择作品方向" select /><Field name="format" label="作品形式" placeholder="请选择作品形式" select /><Field name="creator" label="创作者 / 团队" placeholder="请输入创作者或团队名称" /></div></> : activeStep < 4 ? <LinkStep step={activeStep} /> : activeStep === 4 ? <DisclosureStep /> : <ReviewStep />}{activeStep < 5 && <div className="submission-actions"><button className="button button-outline" type="button" onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}>保存草稿</button><button className="button button-cinnabar" type="button" onClick={() => setActiveStep((step) => Math.min(step + 1, 5))}>保存并继续 <span aria-hidden="true">→</span></button></div>}{activeStep === 5 && <div className="submission-actions"><button className="button button-outline" type="button" onClick={() => setActiveStep(4)}>返回修改</button><button className="button button-cinnabar" type="button" onClick={() => setSaved(true)}>确认提交 <span aria-hidden="true">↗</span></button></div>}</div></div></section>;
}

function Field({ name, label, placeholder, select = false }: { name: string; label: string; placeholder: string; select?: boolean }) {
  return <label className="field">{label}<span className="required">*</span>{select ? <select name={name} defaultValue=""><option value="" disabled>{placeholder}</option><option>前沿科技</option><option>传统文化</option><option>科学幻想</option></select> : <input name={name} type="text" placeholder={placeholder} autoComplete="off" />}</label>;
}

function LinkStep({ step }: { step: number }) {
  const labels = ["主体作品链接", "制作解析链接", "导览 / 体验视频链接"];
  return <div className="link-step"><p className="step-lead">提交公开视频平台链接，服务端会在保存后执行安全预检。</p><label className="field">{labels[step - 1]}<span className="required">*</span><input name={`link-${step}`} type="url" inputMode="url" spellCheck={false} placeholder="https://…" /></label><div className="check-card pending"><span className="check-icon">◌</span><div><strong>等待检测</strong><p>保存链接后，系统会检查平台白名单、公开可访问性、时长与分辨率。</p></div></div><p className="field-help">本站不接收、托管或下载参赛视频。请确认链接无需登录即可访问。</p></div>;
}

function DisclosureStep() {
  return <div className="disclosure-step"><p className="step-lead">这些声明将随投稿版本保存，供资格审查时核对。</p><label className="check-row"><input name="rights-confirmed" type="checkbox" /> <span>我确认已获得作品中使用素材、声音和肖像的必要授权。</span></label><label className="check-row"><input name="ai-disclosed" type="checkbox" /> <span>我已如实说明 AI 工具在创作流程中的使用情况。</span></label><label className="check-row"><input name="version-understood" type="checkbox" /> <span>我理解提交后该版本不可直接覆盖，补充材料将产生新版本。</span></label><div className="declaration-note"><span aria-hidden="true">i</span><p>自动预检通过不代表资格审查通过，组委会仍会进行人工核验。</p></div></div>;
}

function ReviewStep() {
  return <div className="review-step"><p className="step-lead">提交前请逐项确认材料。未通过预检的链接不能进入正式提交。</p><div className="review-list"><ReviewRow label="方向与形式" value="待填写" /><ReviewRow label="主体作品链接" value="待检测" /><ReviewRow label="制作解析链接" value="待检测" /><ReviewRow label="权利与 AI 披露" value="待确认" /></div><div className="declaration-note warning"><span aria-hidden="true">!</span><p>当前仍有材料未完成，确认提交按钮会在全部必填项通过后启用。</p></div></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="review-row"><span>{label}</span><span className="review-value">{value}<b aria-hidden="true">›</b></span></div>; }

function Footer({ onNavigate }: { onNavigate: (href: string) => void }) { return <footer className="site-footer"><div className="footer-brand"><BrandMark /><span>CHINAVR <em>2026</em></span></div><p>AI、VR 影像单元投稿系统<br /><span>PUBLIC VIDEO LINK SUBMISSION PLATFORM</span></p><div className="footer-links"><a href="#rules" onClick={() => onNavigate("#rules")}>参赛规则</a><a href="#notices" onClick={() => onNavigate("#notices")}>通知</a><a href="#login" onClick={() => onNavigate("#login")}>登录</a></div><small>© 2026 ChinaVR · 官方赛事信息以公告为准</small></footer>; }

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
