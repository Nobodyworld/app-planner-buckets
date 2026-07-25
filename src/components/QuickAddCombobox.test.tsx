import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  QuickAddCombobox,
  type QuickAddComboboxOption,
} from './QuickAddCombobox';

const options: QuickAddComboboxOption[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
];

function Harness({
  onEnter = () => undefined,
}: {
  onEnter?: (option: QuickAddComboboxOption | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <QuickAddCombobox
        inputRef={inputRef}
        label="Project"
        value={value}
        selectedId={selectedId}
        options={options}
        placeholder="Current project"
        onValueChange={setValue}
        onSelectionChange={(option) => setSelectedId(option?.id ?? null)}
        onEnter={onEnter}
      />
      <input aria-label="Next field" />
    </>
  );
}

describe('QuickAddCombobox', () => {
  it('exposes a filtered listbox and active option through the combobox contract', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.type(input, 'mm');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: 'Project suggestions' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Gamma' })).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id);
  });

  it('moves through filtered suggestions with arrows and accepts one with Enter', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Harness onEnter={onEnter} />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.type(input, 'a');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(input).toHaveValue('Alpha');
    expect(onEnter).toHaveBeenCalledWith(options[0]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('makes the first ArrowUp highlight the last filtered option', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Harness onEnter={onEnter} />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.type(input, 'a');
    await user.keyboard('{ArrowUp}{Enter}');

    expect(input).toHaveValue('Gamma');
    expect(onEnter).toHaveBeenCalledWith(options[2]);
  });

  it('accepts the highlighted autocomplete option on Tab and advances focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.type(input, 'Al');
    await user.tab();

    expect(input).toHaveValue('Alpha');
    expect(screen.getByLabelText('Next field')).toHaveFocus();
  });

  it('leaves unmatched text intact when Tab advances', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.type(input, 'New project');
    await user.tab();

    expect(input).toHaveValue('New project');
    expect(screen.getByLabelText('Next field')).toHaveFocus();
  });

  it('advances on blank Enter without accepting the first option', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Harness onEnter={onEnter} />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('');
    expect(onEnter).toHaveBeenCalledWith(null);
  });
});
