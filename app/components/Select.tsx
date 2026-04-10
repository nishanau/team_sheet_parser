"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Select.module.css";

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
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
  className,
  triggerClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const menuRef  = useRef<HTMLUListElement>(null);

  // Scroll the selected option into view whenever the dropdown opens
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const selected = menuRef.current.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  // Normalise options to { label, value } — filter out empty-string entries when a placeholder is used
  const normalised = options
    .map((o) => (typeof o === "string" ? { label: o, value: o } : o))
    .filter((o) => !(placeholder && o.value === ""));

  const isEmpty = value === "" || value === null || value === undefined;
  const selectedLabel = isEmpty && placeholder
    ? placeholder
    : (normalised.find((o) => o.value === value)?.label ?? value);

  // Close on outside click or Escape
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

  function select(val: string) {
    onChange(val);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ""}`}>
      {/* Hidden native select for form validation */}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
      >
        {normalised.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Visible trigger */}
      <button
        type="button"
        id={id ? `${id}-btn` : undefined}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""} ${triggerClassName ?? ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          style={{
            ...(triggerClassName ? {} : { overflow: "hidden", textOverflow: "ellipsis" }),
            ...(isEmpty && placeholder ? { opacity: 0.45 } : {}),
          }}
        >
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

      {/* Dropdown menu */}
      {open && (
        <ul ref={menuRef} className={styles.menu} role="listbox">
          {normalised.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${styles.option} ${o.value === value ? styles.optionSelected : ""}`}
              onMouseDown={() => select(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
