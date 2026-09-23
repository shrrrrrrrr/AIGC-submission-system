import { StrictMode, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { SubmissionPage } from "./SubmissionPage";
import { AdminPage } from "./AdminPage";

type Route = "home" | "login" | "register" | "submit" | "admin";
type Notice = { tone: "success" | "error" | "info"; text: string };

const navigation = [
  ["#call", "征集说明"],
  ["#themes", "三个方向"],
  ["#requirements", "作品要求"],
  ["#timeline", "重要时间"],
  ["#jury", "评审标准"],
] as const;

const themes = [
  { number: "01", title: "AI、VR与前沿科技", text: "突出前沿科学技术的合理运用，呈现技术解决问题的能力与新的应用可能。" },
  { number: "02", title: "AI、VR与中华优秀传统文化", text: "用数字加工、智能感知与开源硬件等方式，让传统文化在新的观看关系中继续生长。" },
  { number: "03", title: "AI、VR与科学幻想作品", text: "以科学规律为依据展开想象，呈现对科技趋势、未来社会与宇宙万物的艺术表达。" },
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

  return <div className={`site-shell route-${route}`}>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <Header menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} onNavigate={navigate} />
    <main id="main-content">{route === "home" ? <Home onNavigate={navigate} /> : route === "login" ? <LoginPage onNavigate={navigate} /> : route === "register" ? <RegisterPage onNavigate={navigate} /> : route === "admin" ? <AdminPage /> : <SubmissionPage />}</main>
    <Footer onNavigate={navigate} />
  </div>;
}

function readRoute(): Route {
  const hash = window.location.hash.slice(1).split("?")[0];
  return hash === "login" ? "login" : hash === "register" ? "register" : hash === "submit" ? "submit" : hash === "admin" ? "admin" : "home";
}

function Header({ menuOpen, onMenuToggle, onNavigate }: { menuOpen: boolean; onMenuToggle: () => void; onNavigate: (href: string) => void }) {
  return <header className="site-header event-header">
    <div className="header-inner">
      <a className="brand event-brand" href="#home" aria-label="ChinaVR 2026 AI、VR影像单元首页" onClick={() => onNavigate("#home")}><img src="/assets/chinavr-logo-mark.png" alt="ChinaVR 标志" /><span><strong>ChinaVR</strong><b>2026</b></span></a>
      <button className="menu-toggle" type="button" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} aria-controls="primary-nav" onClick={onMenuToggle}><span aria-hidden="true">{menuOpen ? "×" : "☰"}</span></button>
      <nav id="primary-nav" className={`primary-nav ${menuOpen ? "is-open" : ""}`} aria-label="主导航">
        {navigation.map(([href, label]) => <a key={href} href={href} onClick={() => onNavigate(href)}>{label}</a>)}
        <a className="header-login" href="#login" onClick={() => onNavigate("#login")}>登录</a>
        <a className="button button-small button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>立即投稿 <span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </header>;
}

function Home({ onNavigate }: { onNavigate: (href: string) => void }) {
  return <>    <section className="event-hero event-hero-simple" aria-labelledby="event-title">
      <div className="event-hero-simple-inner">
        <div className="event-hero-content">
          <p className="eyebrow event-eyebrow"><span className="eyebrow-dot" /> 中国计算机学会 · ChinaVR 2026</p>
          <h1 id="event-title">AI、VR<br /><em>影像单元</em></h1>
          <p className="event-hero-lede">第26届中国虚拟现实大会作品征集。欢迎电影人、视觉艺术家、数字媒体团队、技术开发者与学生投稿。</p>
          <div className="hero-actions"><a className="button button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>进入投稿入口 <span aria-hidden="true">↗</span></a><a className="text-link light-link" href="#requirements" onClick={() => onNavigate("#requirements")}>查看作品要求 ↓</a></div>
        </div>
        <figure className="event-hero-poster">
          <img src="/assets/chinavr-2026-poster.jpg" alt="ChinaVR 2026 第二十六届中国虚拟现实大会宣传图" />
          <figcaption><img src="/assets/ai-vr-film-mark.png" alt="AI、VR 影像视觉标志" /><span>虚拟现实与人工智能的双向赋能</span></figcaption>
        </figure>
      </div>
    </section>

    <section className="event-facts" aria-label="大会关键信息"><div><span>大会时间</span><strong>2026.11.06—11.08</strong><small>中国 · 广州</small></div><div><span>投稿截止</span><strong>2026.10.12</strong><small>请在截止日前完成提交</small></div><div><span>作品范围</span><strong>AI · VR · XR</strong><small>影像、动画、实时图形与空间体验</small></div></section>

    <section className="event-section event-intro" id="call" aria-labelledby="call-title"><div className="event-section-index">01 / OPEN CALL</div><div className="event-intro-grid"><h2 id="call-title">让技术成为<br /><em>想象力的延伸。</em></h2><div><p className="event-lead">第26届虚拟现实大会 ChinaVR 2026 将于 2026 年 11 月 6 日至 8 日在广州举办。本届大会主题为“虚拟现实与人工智能的双向赋能”，AI、VR 影像单元面向全球征集作品。</p><p>我们邀请创作者把 AI、VR、文化与创意放在一起，提交一份可以被理解、被核验、被记住的影像作品。入选作品将在大会期间的 AI、VR 影像单元展区现场展示。</p><a className="text-link dark-link" href="#submit" onClick={() => onNavigate("#submit")}>开始准备投稿 <span aria-hidden="true">→</span></a></div></div></section>

    <section className="event-section event-themes" id="themes" aria-labelledby="themes-title"><div className="event-section-index">02 / THREE FIELDS</div><div className="event-heading"><h2 id="themes-title">三个方向，<em>三种观看未来的方式。</em></h2><p>方向用于组织评审，不限制作品的媒介组合。选择最能描述作品核心经验的方向。</p></div><div className="theme-grid">{themes.map((theme) => <article className="theme-card" key={theme.number}><span className="theme-number mono">{theme.number}</span><h3>{theme.title}</h3><p>{theme.text}</p></article>)}</div></section>

    <section className="event-section event-requirements" id="requirements" aria-labelledby="requirements-title"><div className="event-section-index">03 / WORK REQUIREMENTS</div><div className="event-heading"><h2 id="requirements-title">提交前，<em>请确认这些材料。</em></h2><p>以下内容整理自 AI、VR 影像单元征集要求，具体细则以组委会正式通知为准。</p></div><div className="requirements-grid"><div><h3>作品与链接</h3><ul><li>主体作品时长 2—10 分钟。</li><li>另附不超过 1 分钟的制作解析。</li><li>主体作品和制作解析须发布在公开视频平台。</li><li>主体作品使用 3 秒统一电子剧场片头，并包含片尾。</li></ul></div><div><h3>技术与权利</h3><ul><li>技术规格不低于 1920×1080，建议 16:9 横屏。</li><li>AI 参与核心视听内容原则上不低于 80%。</li><li>说明创作构想、工具、工作流程与人工贡献。</li><li>画面、音乐、字体、模型、数据与肖像等素材须拥有合法使用权。</li></ul></div><div><h3>适用形式</h3><ul><li>叙事、纪录、科幻、实验影像与动画。</li><li>实时影像、科研可视化、3D、VR、MR 与交互作品。</li><li>VR、交互与实时作品另交 1—5 分钟录屏或导览视频。</li><li>学生参赛者须注明学校、专业及指导教师信息。</li></ul></div></div></section>

    <section className="event-section event-timeline" id="timeline" aria-labelledby="timeline-title"><div className="event-section-index">04 / KEY DATES</div><div className="event-heading"><h2 id="timeline-title">从作品征集，<em>到大会展映。</em></h2></div><div className="date-grid"><div><span className="date-big">10.12</span><strong>作品征稿截止</strong><p>提交完整作品信息及公开视频链接。</p></div><div><span className="date-big">10.30</span><strong>录用通知</strong><p>组委会完成资格审查与作品评审。</p></div><div><span className="date-big">11.06—08</span><strong>公布与展映</strong><p>入围及获奖作品在大会期间集中展映。</p></div></div></section>

    <section className="event-section event-jury" id="jury" aria-labelledby="jury-title"><div className="event-section-index">05 / REVIEW</div><div className="event-jury-grid"><div><h2 id="jury-title">四个维度，<br /><em>共计 100 分。</em></h2><p>资格审查重点核验时长、AI 参与说明、生成内容标识、权利声明与作品价值观导向；专业初评和终评按统一评分表进行。</p></div><div className="score-list"><div><b>20</b><span><strong>主题契合度</strong><small>回应总命题与所选方向</small></span></div><div><b>30</b><span><strong>视觉表现力</strong><small>画面、镜头、声音与技术完成度</small></span></div><div><b>20</b><span><strong>技术创新性</strong><small>AIGC、CG 工具的复杂度与可控性</small></span></div><div><b>30</b><span><strong>叙事 / 概念深度</strong><small>结构、情感、视觉逻辑与启发性</small></span></div></div></div></section>

    <section className="event-source" aria-labelledby="source-title"><div><span className="event-section-index">06 / OFFICIAL SOURCES</span><h2 id="source-title">关注大会官方信息，<em>以最新通知为准。</em></h2><p>大会时间、征集细则和展映安排以中国计算机学会、CCF 虚拟现实与可视化技术专委会及其公众号发布的正式通知为准。</p></div><a className="button button-outline" href="https://www.ccf.org.cn/Chapters/TC/TC_Listing/TCVRV/" target="_blank" rel="noreferrer">查看 CCF 专委会 <span aria-hidden="true">↗</span></a></section>

    <section className="event-cta" aria-labelledby="cta-title"><img src="/assets/chinavr-logo-mark.png" alt="ChinaVR 标志" /><div><span className="event-section-index">READY WHEN YOU ARE</span><h2 id="cta-title">让作品先进入<br /><em>被看见的现场。</em></h2></div><a className="button button-cinnabar" href="#submit" onClick={() => onNavigate("#submit")}>开始投稿 <span aria-hidden="true">↗</span></a></section>
  </>;
}

function LoginPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const localPreview = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port === "5173";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...(mfaCode ? { mfaCode } : {}) }) });
      const body = await response.json().catch(() => ({})) as { message?: string; code?: string; user?: { roles?: string[] } };
      if (!response.ok) throw new Error(body.message || "登录暂时不可用，请稍后再试");
      const destination = body.user?.roles?.some((role) => role === "event_admin" || role === "super_admin") ? "#admin" : "#submit";
      setNotice({ tone: "success", text: destination === "#admin" ? "登录成功，正在进入管理工作台。" : "登录成功，正在进入投稿工作台。" });
      window.setTimeout(() => onNavigate(destination), 450);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "登录暂时不可用，请稍后再试" });
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="auth-page section-pad" aria-labelledby="login-title"><div className="auth-layout"><div className="auth-intro"><div className="section-kicker inverse"><span>ACCOUNT / 01</span><span>SECURE ENTRY</span></div><h1 id="login-title">把下一步<br /><em>交给作品。</em></h1><p>登录后可以继续草稿、检测公开视频链接，并查看投稿状态。登录失败时我们不会透露邮箱是否已注册。</p><a className="text-link light-link" href="#home" onClick={() => onNavigate("#home")}>返回公开站 <span aria-hidden="true">↗</span></a></div><form className="auth-card" onSubmit={submit}><div className="card-topline"><span>CHINAVR 2026</span><span className="mono">AUTH / 01</span></div><label htmlFor="email">邮箱地址<span className="required">*</span></label><input id="email" name="email" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /><label htmlFor="password">密码<span className="required">*</span></label><input id="password" name="password" type="password" autoComplete="current-password" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="至少 6 个字符" /><label htmlFor="mfa-code">管理员验证码<span className="optional">（需要时填写）</span></label><input id="mfa-code" name="mfaCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位验证码" />{localPreview && <div className="form-notice info" role="note">本地预览账号：preview@example.com　密码：123456</div>}<div className="form-meta"><a href="#register" onClick={(event) => { event.preventDefault(); onNavigate("#register"); }}>还没有账号？注册</a><a href="#reset" onClick={(event) => { event.preventDefault(); setNotice({ tone: "info", text: "重置密码会通过邮箱发送一次性链接。" }); }}>忘记密码</a></div>{notice && <div className={`form-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}<button className="button button-cinnabar button-full" type="submit" disabled={submitting}>{submitting ? "正在验证…" : "安全登录"} <span aria-hidden="true">↗</span></button><p className="auth-footnote">会话使用安全 Cookie 保存；请勿在公共设备上保存密码。</p></form></div></section>;
}

function RegisterPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setNotice({ tone: "error", text: "两次输入的密码不一致。" });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message || "注册暂时不可用，请稍后再试");
      setNotice({ tone: "success", text: "注册请求已提交，请查收邮箱并点击验证链接。部署后请使用网站正式域名打开邮件链接。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "注册暂时不可用，请稍后再试" });
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="auth-page section-pad" aria-labelledby="register-title"><div className="auth-layout"><div className="auth-intro"><div className="section-kicker inverse"><span>ACCOUNT / 02</span><span>CREATE ACCESS</span></div><h1 id="register-title">先建立<br /><em>你的投稿身份。</em></h1><p>注册后通过邮箱验证账号，再登录投稿工作台保存作品信息与公开视频链接。</p><a className="text-link light-link" href="#home" onClick={() => onNavigate("#home")}>返回公开站 <span aria-hidden="true">↗</span></a></div><form className="auth-card" onSubmit={submit}><div className="card-topline"><span>CHINAVR 2026</span><span className="mono">AUTH / 02</span></div><label htmlFor="register-email">邮箱地址<span className="required">*</span></label><input id="register-email" name="email" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /><label htmlFor="register-password">设置密码<span className="required">*</span></label><input id="register-password" name="password" type="password" autoComplete="new-password" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="至少 6 个字符" /><label htmlFor="register-password-confirm">确认密码<span className="required">*</span></label><input id="register-password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" spellCheck={false} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} placeholder="再次输入密码" />{notice && <div className={`form-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}<button className="button button-cinnabar button-full" type="submit" disabled={submitting}>{submitting ? "正在创建…" : "创建账号"} <span aria-hidden="true">↗</span></button><div className="form-meta"><a href="#login" onClick={(event) => { event.preventDefault(); onNavigate("#login"); }}>已有账号？登录</a></div><p className="auth-footnote">我们不会在页面上显示或透露账号是否已存在。</p></form></div></section>;
}

function Footer({ onNavigate }: { onNavigate: (href: string) => void }) { return <footer className="site-footer event-footer"><div className="footer-brand"><img src="/assets/chinavr-logo-mark.png" alt="ChinaVR 标志" /><span>ChinaVR <em>2026</em></span></div><p>AI、VR 影像单元<br /><span>第26届中国虚拟现实大会 · 中国广州</span></p><div className="footer-links"><a href="#requirements" onClick={() => onNavigate("#requirements")}>作品要求</a><a href="#timeline" onClick={() => onNavigate("#timeline")}>重要时间</a><a href="#login" onClick={() => onNavigate("#login")}>登录</a></div><small>© 2026 ChinaVR · 具体细则以组委会正式通知为准</small></footer>; }

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);