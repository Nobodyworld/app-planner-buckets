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

const duplicateOptions: QuickAddComboboxOption[] = [
  {
    id: 'shared-first',
    label: 'Shared',
    description: 'Project 1 of 2 with this name',
  },
  {
    id: 'shared-second',
    label: 'Shared',
    description: 'Project 2 of 2 with this name',
  },
];

function Harness({
  onEnter = () => undefined,
  comboboxOptions = options,
  initialValue = '',
  initialSelectedId = null,
}: {
  onEnter?: (option: QuickAddComboboxOption | null) => void;
  comboboxOptions?: QuickAddComboboxOption[];
  initialValue?: string;
  initialSelectedId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  return (
    <>
      <QuickAddCombobox
        inputRef={inputRef}
        label="Project"
        value={value}
        selectedId={selectedId}
        options={comboboxOptions}
        placeholder="Current project"
        onValueChange={setValue}
        onSelectionChange={(option) => setSelectedId(option?.id ?? null)}
        onEnter={onEnter}
      />
      <output data-testid="selected-option-id">{selectedId ?? ''}</output>
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

  it('submits on blank Enter without accepting the first option', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<Harness onEnter={onEnter} />);

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('');
    expect(onEnter).toHaveBeenCalledWith(null);
  });

  it('highlights and submits the retained duplicate identity after refocus', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(
      <Harness
        onEnter={onEnter}
        comboboxOptions={duplicateOptions}
        initialValue="Shared"
        initialSelectedId="shared-second"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.click(input);

    const renderedOptions = screen.getAllByRole('option');
    expect(renderedOptions[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', renderedOptions[1].id);

    await user.keyboard('{Enter}');

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(duplicateOptions[1]);
    expect(screen.getByTestId('selected-option-id')).toHaveTextContent('shared-second');
  });

  it('preserves the retained duplicate identity when Tab accepts and advances', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(
      <Harness
        onEnter={onEnter}
        comboboxOptions={duplicateOptions}
        initialValue="Shared"
        initialSelectedId="shared-second"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Project' });
    await user.click(input);
    await user.tab();

    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected-option-id')).toHaveTextContent('shared-second');
    expect(screen.getByLabelText('Next field')).toHaveFocus();
  });
});
