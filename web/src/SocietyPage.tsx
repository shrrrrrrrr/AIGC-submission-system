type SocietyPageProps = { onNavigate: (href: string) => void };

export function SocietyPage({ onNavigate }: SocietyPageProps) {
  return <div className="society-page">
    <section className="society-hero" aria-labelledby="society-title">
      <img className="society-watermark" src="/assets/ai-vr-hero-mark.png" alt="" aria-hidden="true" />
      <div className="society-shell society-hero-inner">
        <div className="society-kicker"><span>CCF / CHINAVR 2026</span><span>PEOPLE &amp; ORGANIZATION</span></div>
        <h1 id="society-title">中国计算机学会<br /><em>相关人员信息</em></h1>
        <p>这里将展示中国计算机学会、相关专委会与大会工作人员信息。页面框架已准备完成，具体名单与职责说明待后续补充。</p>
        <div className="society-actions"><a className="button button-cinnabar" href="#home" onClick={() => onNavigate("#home")}>我要投稿 <span aria-hidden="true">↗</span></a></div>
      </div>
    </section>
    <section className="society-section" aria-labelledby="society-overview-title"><div className="society-shell"><div className="society-section-index">01 / ORGANIZATION</div><div className="society-heading"><h2 id="society-overview-title">学会与大会<br /><em>相关信息</em></h2><p>页面采用分区式信息框架，便于后续录入组织架构、专家名单、工作人员和联系方式。</p></div><div className="society-card-grid"><article className="society-card"><span>01</span><h3>主办单位</h3><p>信息待补充</p></article><article className="society-card"><span>02</span><h3>承办与协办</h3><p>信息待补充</p></article><article className="society-card"><span>03</span><h3>相关人员</h3><p>信息待补充</p></article></div></div></section>
    <section className="society-section society-section-muted" aria-labelledby="society-list-title"><div className="society-shell"><div className="society-section-index">02 / DIRECTORY</div><div className="society-heading"><h2 id="society-list-title">人员信息<br /><em>即将补充</em></h2><p>后续可在这里增加姓名、职务、所属机构、研究方向和公开联系方式等内容。</p></div><div className="society-placeholder"><div><strong>姓名 / 职务</strong><span>待补充</span></div><div><strong>所属机构</strong><span>待补充</span></div><div><strong>研究方向与职责</strong><span>待补充</span></div></div></div></section>
  </div>;
}
