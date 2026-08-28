import { useId, useState, type ReactNode } from 'react';

interface SidebarDisclosureProps {
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SidebarDisclosure({
  title,
  meta,
  className = '',
  children,
}: SidebarDisclosureProps) {
  const generatedId = useId().replace(/:/g, '');
  const buttonId = `sidebar-disclosure-${generatedId}-button`;
  const regionId = `sidebar-disclosure-${generatedId}-region`;
  const [expanded, setExpanded] = useState(false);

  return (
    <section className={`panel-card sidebar-disclosure${className ? ` ${className}` : ''}`}>
      <button
        id={buttonId}
        type="button"
        className="sidebar-disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="sidebar-disclosure-chevron" aria-hidden="true">▸</span>
        <span className="sidebar-disclosure-title">{title}</span>
        {meta ? <span className="toolbar-meta">{meta}</span> : null}
      </button>
      <div
        id={regionId}
        className="sidebar-disclosure-region"
        role="region"
        aria-label={title}
        aria-labelledby={buttonId}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}
