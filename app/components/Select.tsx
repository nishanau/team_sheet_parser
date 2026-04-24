"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Select.module.css";

type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export default function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  className,
  triggerClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const selected = menuRef.current.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const normalised = options.map((o) => (typeof o === "string" ? { label: o, value: o } : o));
  const hiddenOptions = placeholder && !normalised.some((o) => o.value === "")
    ? [{ label: placeholder, value: "", disabled: false }, ...normalised]
    : normalised;
  const menuOptions = normalised.filter((o) => !(placeholder && o.value === ""));

  const isEmpty = value === "" || value === null || value === undefined;
  const selectedLabel = isEmpty && placeholder
    ? placeholder
    : (hiddenOptions.find((o) => o.value === value)?.label ?? value);

  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleMouse);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouse);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function select(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ""}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
      >
        {hiddenOptions.map((o) => (
          <option key={`${o.value}-${o.label}`} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        id={id ? `${id}-btn` : undefined}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""} ${disabled ? styles.triggerDisabled : ""} ${triggerClassName ?? ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={`${styles.label} ${isEmpty && placeholder ? styles.placeholder : ""}`}>
          {selectedLabel}
        </span>
        <svg
          className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul ref={menuRef} className={styles.menu} role="listbox">
          {menuOptions.map((o) => (
            <li
              key={`${o.value}-${o.label}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled ? "true" : undefined}
              className={`${styles.option} ${o.value === value ? styles.optionSelected : ""} ${o.disabled ? styles.optionDisabled : ""}`}
              onMouseDown={() => select(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
