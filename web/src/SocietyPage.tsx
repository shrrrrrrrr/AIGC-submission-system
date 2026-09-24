import type { CSSProperties, MouseEvent } from "react";
import { societyActions, societyHero, societySections, societySortNote } from "./society";
import type { SocietyPerson, SocietySection } from "./society";

type SocietyPageProps = { onNavigate: (href: string) => void };

/**
 * 学会人员页面。文案与名单全部来自 web/src/society.ts，改文字不需要动这个文件。
 */
export function SocietyPage({ onNavigate }: SocietyPageProps) {
  const go = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith("#")) return;
    event.preventDefault();
    onNavigate(href);
  };

  return <div className="society-page">
    <section className="society-hero" aria-labelledby="society-title">
      {/* 横幅图：组委会提供的 ChinaVR 2026 主视觉，图上文字保持完整不被遮挡。 */}
      <div className="society-hero-media">
        <img
          className="society-hero-banner"
          src={societyHero.banner.src}
          alt={societyHero.banner.alt}
          width={societyHero.banner.width}
          height={societyHero.banner.height}
          decoding="async"
        />
      </div>
      <div className="society-hero-body">
        <div className="society-shell">
          <div className="society-kicker">{societyHero.kicker.map((item) => <span key={item}>{item}</span>)}</div>
          <h1 id="society-title">{societyHero.title}<br /><em>{societyHero.titleEm}</em></h1>
          <p>{societyHero.intro}</p>
          <div className="society-actions">
            <a className="button button-cinnabar" href={societyHero.action.href} onClick={go(societyHero.action.href)}>{societyHero.action.label} <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
    </section>

    <div className="society-board">
      <div className="society-shell">
        {societySections.map((section) => <SocietySectionPanel key={section.id} section={section} />)}
        <p className="society-sort-note">{societySortNote}</p>
      </div>
    </div>

    <section className="society-cta" aria-labelledby="society-cta-title">
      <div className="society-shell">
        <h2 id="society-cta-title">{societyActions.title}</h2>
        <p>{societyActions.intro}</p>
        <div className="society-cta-actions">
          {societyActions.buttons.map((button) => button.external
            ? <a key={button.label} className="society-cta-button society-cta-button-light" href={button.href} target="_blank" rel="noopener noreferrer">{button.label} <span aria-hidden="true">↗</span></a>
            : <a key={button.label} className="button button-cinnabar society-cta-button" href={button.href} onClick={go(button.href)}>{button.label} <span aria-hidden="true">↗</span></a>)}
        </div>
      </div>
    </section>
  </div>;
}

function SocietySectionPanel({ section }: { section: SocietySection }) {
  // roster 版式按列排布，行数由人数决定，因此三列宽度一致、分布与设计图相同。
  const rosterRows = Math.ceil(section.people.length / 3);
  return <section className="society-panel" aria-labelledby={`society-${section.id}`}>
    <header className="society-panel-head">
      <span className="society-panel-icon" aria-hidden="true"><SectionIcon kind={section.icon} /></span>
      <h2 id={`society-${section.id}`}>{section.title}</h2>
    </header>
    {section.layout === "cards"
      ? <div className="society-people">{section.people.map((person) => <PersonCard key={person.name} person={person} />)}</div>
      : <ul className="society-roster" style={{ "--roster-rows": rosterRows } as CSSProperties}>
        {section.people.map((person) => <li key={person.name}>{person.name}<span>，{person.affiliation}</span></li>)}
      </ul>}
  </section>;
}

function PersonCard({ person }: { person: SocietyPerson }) {
  return <article className="society-person">
    <div className="society-person-photo">
      {person.photo
        ? <img src={person.photo} alt={`${person.name} 照片`} loading="lazy" decoding="async" />
        : null}
    </div>
    <p className="society-person-name">{person.name}</p>
    <p className="society-person-affiliation">{person.affiliation}</p>
  </article>;
}

function SectionIcon({ kind }: { kind: "grid" | "people" }) {
  if (kind === "people") return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M15.4 4.6a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2Z" />
    <path d="M15.2 12.3c3.4 0 6.1 2.5 6.1 5.6v1.9h-5.2v-1.9c0-2-.7-3.8-1.9-5.1.3-.1.7-.2 1-.2Z" />
    <path d="M8.6 3.4a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
    <path d="M8.6 12.4c3.9 0 7 2.9 7 6.4v2H1.6v-2c0-3.5 3.1-6.4 7-6.4Z" />
  </svg>;
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <rect x="2.8" y="2.8" width="8.4" height="8.4" rx="1.8" />
    <rect x="12.8" y="2.8" width="8.4" height="5.2" rx="1.8" />
    <rect x="2.8" y="12.8" width="8.4" height="8.4" rx="1.8" />
    <rect x="12.8" y="9.6" width="8.4" height="11.6" rx="1.8" />
  </svg>;
}
