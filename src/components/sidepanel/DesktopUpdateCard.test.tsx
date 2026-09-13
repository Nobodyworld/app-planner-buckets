import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopUpdateCard } from './DesktopUpdateCard';

afterEach(() => {
  document.getElementById('root')?.remove();
});

const renderInApplicationRoot = (component: React.ReactNode): HTMLElement => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  render(component, { container: root });
  return root;
};

describe('DesktopUpdateCard', () => {
  it('is absent from browser mode', () => {
    const { container } = render(<DesktopUpdateCard runtimeAvailable={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('checks first and requires a separate install action', async () => {
    const checkForUpdate = vi.fn(async () => ({
      configured: true,
      available: true,
      currentVersion: '1.1.0',
      version: '1.2.0',
      notes: 'Signed update available.',
    }));
    const installUpdate = vi.fn(async () => undefined);
    render(
      <DesktopUpdateCard
        runtimeAvailable
        checkForUpdate={checkForUpdate}
        installUpdate={installUpdate}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Install and restart' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Version 1.2.0 is available. Signed update available.');
    expect(installUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Install and restart' }));
    await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
  });

  it('restores interaction and reports an install error when backup or install fails', async () => {
    const checkForUpdate = vi.fn(async () => ({
      configured: true,
      available: true,
      currentVersion: '1.1.0',
      version: '1.2.0',
    }));
    const installUpdate = vi.fn(async () => { throw new Error('Pre-update snapshot failed.'); });
    const root = renderInApplicationRoot(
      <DesktopUpdateCard
        runtimeAvailable
        checkForUpdate={checkForUpdate}
        installUpdate={installUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await screen.findByRole('button', { name: 'Install and restart' });
    fireEvent.click(screen.getByRole('button', { name: 'Install and restart' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pre-update snapshot failed.');
    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-busy');
  });

  it('explains when a development build has no updater key', async () => {
    render(
      <DesktopUpdateCard
        runtimeAvailable
        checkForUpdate={async () => ({
          configured: false,
          available: false,
          currentVersion: '1.1.0',
          message: 'Signed updater is not configured in this build.',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('Signed updater is not configured in this build.')).toBeInTheDocument();
  });
});
