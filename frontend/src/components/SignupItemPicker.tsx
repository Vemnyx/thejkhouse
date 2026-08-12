import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { availableSignupSuggestions } from "../lib/signupItems";

type SignupItemPickerProps = {
  value: string;
  usedLabels: string[];
  disabled?: boolean;
  autoOpen?: boolean;
  placeholder?: string;
  onChange: (label: string) => void;
};

export default function SignupItemPicker({
  value,
  usedLabels,
  disabled = false,
  autoOpen = false,
  placeholder = "Select an item",
  onChange,
}: SignupItemPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(autoOpen);
  const [customValue, setCustomValue] = useState("");

  const suggestions = useMemo(() => {
    const groups = availableSignupSuggestions(usedLabels);
    const query = customValue.trim().toLowerCase();
    if (!query) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [customValue, usedLabels]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCustomValue("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const selectItem = (label: string) => {
    const next = label.trim();
    if (!next) {
      return;
    }
    onChange(next);
    setCustomValue("");
    setOpen(false);
  };

  const handleCustomSubmit = (event: FormEvent) => {
    event.preventDefault();
    selectItem(customValue);
  };

  if (disabled) {
    return <span className="party-signup-item-locked">{value || "—"}</span>;
  }

  return (
    <div className="party-signup-picker" ref={rootRef}>
      <button
        className={value ? "party-signup-picker-trigger" : "party-signup-picker-trigger placeholder"}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setCustomValue("");
        }}
      >
        {value || placeholder}
      </button>
      {open ? (
        <div className="party-signup-picker-menu" role="listbox">
          <form className="party-signup-picker-custom" onSubmit={handleCustomSubmit}>
            <input
              ref={inputRef}
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              placeholder="Add a custom item"
              maxLength={120}
              aria-label="Add a custom item"
            />
            <button className="auth-secondary" type="submit" disabled={!customValue.trim()}>
              Add
            </button>
          </form>
          {suggestions.length === 0 ? (
            <p className="party-signup-picker-empty">No suggested items left.</p>
          ) : (
            suggestions.map((group) => (
              <div className="party-signup-picker-group" key={group.label}>
                <p className="party-signup-picker-group-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    className="party-signup-picker-option"
                    type="button"
                    key={item}
                    onClick={() => selectItem(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
