import { flushSync } from 'react-dom';
import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';

export interface QuickAddComboboxOption {
  id: string;
  label: string;
  description?: string;
}

interface QuickAddComboboxProps {
  inputRef: RefObject<HTMLInputElement>;
  label: string;
  value: string;
  selectedId: string | null;
  options: QuickAddComboboxOption[];
  placeholder: string;
  maxLength?: number;
  onValueChange: (value: string) => void;
  onSelectionChange: (option: QuickAddComboboxOption | null) => void;
  onEnter: (acceptedOption: QuickAddComboboxOption | null) => void;
}

const normalizeFilterValue = (value: string): string => value.trim().toLocaleLowerCase();

export function QuickAddCombobox({
  inputRef,
  label,
  value,
  selectedId,
  options,
  placeholder,
  maxLength = 80,
  onValueChange,
  onSelectionChange,
  onEnter,
}: QuickAddComboboxProps) {
  const generatedId = useId().replace(/:/g, '');
  const inputId = `quick-add-${generatedId}-input`;
  const listboxId = `quick-add-${generatedId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [hasNavigated, setHasNavigated] = useState(false);
  const filterValue = normalizeFilterValue(value);
  const filteredOptions = useMemo(() => (
    filterValue
      ? options.filter((option) => option.label.toLocaleLowerCase().includes(filterValue))
      : options
  ), [filterValue, options]);
  const retainedSelectionIndex = selectedId === null
    ? -1
    : filteredOptions.findIndex((option) => option.id === selectedId);
  const preferredFocusIndex = retainedSelectionIndex >= 0 ? retainedSelectionIndex : 0;
  const safeHighlightedIndex = filteredOptions.length === 0
    ? -1
    : Math.min(highlightedIndex, filteredOptions.length - 1);
  const highlightedOption = safeHighlightedIndex >= 0
    ? filteredOptions[safeHighlightedIndex]
    : null;
  const activeDescendantId = isOpen && highlightedOption
    ? `${listboxId}-option-${safeHighlightedIndex}`
    : undefined;

  const acceptOption = (option: QuickAddComboboxOption) => {
    // Enter submits immediately after accepting a suggestion. Flush the parent
    // selection/value updates before onEnter so submission cannot observe stale
    // target state. Tab uses the same acceptance path but does not submit.
    flushSync(() => {
      onValueChange(option.label);
      onSelectionChange(option);
      setHighlightedIndex(0);
      setHasNavigated(false);
      setIsOpen(false);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (filteredOptions.length === 0) return;
      event.preventDefault();
      setIsOpen(true);
      setHasNavigated(true);
      setHighlightedIndex((current) => {
        if (!hasNavigated) {
          return event.key === 'ArrowDown' ? 0 : filteredOptions.length - 1;
        }
        const safeCurrent = Math.min(current, filteredOptions.length - 1);
        if (event.key === 'ArrowDown') {
          return (safeCurrent + 1) % filteredOptions.length;
        }
        return (safeCurrent - 1 + filteredOptions.length) % filteredOptions.length;
      });
      return;
    }

    if (event.key === 'Escape') {
      if (!isOpen) return;
      event.preventDefault();
      setIsOpen(false);
      setHasNavigated(false);
      return;
    }

    if (event.key === 'Tab') {
      if (isOpen && highlightedOption && (filterValue || hasNavigated)) {
        acceptOption(highlightedOption);
      }
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    const acceptedOption = isOpen && highlightedOption && (filterValue || hasNavigated)
      ? highlightedOption
      : null;
    if (acceptedOption) {
      acceptOption(acceptedOption);
    } else {
      setIsOpen(false);
    }
    onEnter(acceptedOption);
  };

  return (
    <div className="quick-add-combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId}
        onFocus={() => {
          // Preserve the explicitly selected entity when duplicate labels filter
          // to more than one option. Keyboard acceptance must follow identity,
          // not silently fall back to the first visible duplicate.
          setHighlightedIndex(preferredFocusIndex);
          setHasNavigated(false);
          setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          setHasNavigated(false);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          onSelectionChange(null);
          setHighlightedIndex(0);
          setHasNavigated(false);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && filteredOptions.length > 0 ? (
        <ul id={listboxId} className="quick-add-options" role="listbox" aria-label={`${label} suggestions`}>
          {filteredOptions.map((option, index) => (
            <li
              key={option.id}
              id={`${listboxId}-option-${index}`}
              className={`quick-add-option${index === safeHighlightedIndex ? ' highlighted' : ''}`}
              role="option"
              aria-selected={option.id === selectedId}
              onMouseDown={(event) => {
                event.preventDefault();
                acceptOption(option);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
