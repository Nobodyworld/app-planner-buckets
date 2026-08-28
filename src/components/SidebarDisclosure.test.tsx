import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SidebarDisclosure } from './SidebarDisclosure';

describe('SidebarDisclosure', () => {
  it('starts collapsed with an associated hidden region', () => {
    render(
      <SidebarDisclosure title="Projects" meta="2">
        <button type="button">Project action</button>
      </SidebarDisclosure>,
    );

    const toggle = screen.getByRole('button', { name: /Projects/ });
    const region = document.getElementById(toggle.getAttribute('aria-controls') ?? '');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(region).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-controls', region?.id);
    expect(region).toHaveAttribute('hidden');
  });

  it('toggles independently while preserving focus on each disclosure button', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SidebarDisclosure title="Projects">
          <button type="button">Project action</button>
        </SidebarDisclosure>
        <SidebarDisclosure title="Data">
          <button type="button">Data action</button>
        </SidebarDisclosure>
      </>,
    );

    const projectsToggle = screen.getByRole('button', { name: 'Projects' });
    const dataToggle = screen.getByRole('button', { name: 'Data' });

    await user.click(projectsToggle);
    expect(projectsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(projectsToggle).toHaveFocus();
    expect(within(screen.getByRole('region', { name: 'Projects' })).getByRole('button')).toBeVisible();
    expect(dataToggle).toHaveAttribute('aria-expanded', 'false');

    dataToggle.focus();
    await user.keyboard('{Enter}');
    expect(dataToggle).toHaveAttribute('aria-expanded', 'true');
    expect(dataToggle).toHaveFocus();
    expect(projectsToggle).toHaveAttribute('aria-expanded', 'true');
  });
});
