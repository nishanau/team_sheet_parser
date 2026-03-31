"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Select.module.css";

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | { label: string; value: string }[];
  required?: boolean;
  className?: string;
}

export default function Select({
  id,
  value,
  onChange,
  options,
  required,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Normalise options to { label, value }
  const normalised = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );

  const selectedLabel = normalised.find((o) => o.value === value)?.label ?? value;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
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
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{selectedLabel}</span>
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
        <ul className={styles.menu} role="listbox">
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
