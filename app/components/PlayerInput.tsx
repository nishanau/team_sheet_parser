"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GamePlayer } from "@/app/api/game-players/route";
import styles from "./PlayerInput.module.css";

interface Props {
  /** Jumper number value */
  numberValue: string;
  /** Player name value */
  nameValue: string;
  /** Full player list for this team (empty = manual entry) */
  players: GamePlayer[];
  onNumberChange: (num: string) => void;
  onNameChange:   (name: string) => void;
  /** Called when a suggestion is selected — fills both number and name */
  onSelect: (num: string, name: string) => void;
  /** Jumper numbers already selected in other rows — hidden from suggestions */
  excludeNumbers?: Set<string>;
  numberPlaceholder?: string;
  namePlaceholder?: string;
}

export default function PlayerInput({
  numberValue,
  nameValue,
  players,
  onNumberChange,
  onNameChange,
  onSelect,
  excludeNumbers,
  numberPlaceholder = "#",
  namePlaceholder   = "Player name",
}: Props) {
  const [activeField, setActiveField]  = useState<"number" | "name" | null>(null);
  const [highlighted, setHighlighted]  = useState<number>(-1);
  const [dropUp, setDropUp]            = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo<GamePlayer[]>(() => {
    if (!activeField || players.length === 0) return [];
    const q = activeField === "number" ? numberValue.trim() : nameValue.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const filtered = players.filter((p) => {
      // Hide players already selected in other rows
      if (excludeNumbers && p.playerNumber && excludeNumbers.has(p.playerNumber)) return false;

      if (activeField === "number") {
        return (p.playerNumber ?? "").startsWith(ql);
      }
      const full = `${p.firstName} ${p.lastName}`.toLowerCase();
      return full.includes(ql) || p.firstName.toLowerCase().startsWith(ql) || p.lastName.toLowerCase().startsWith(ql);
    });
    return filtered.slice(0, 8);
  }, [numberValue, nameValue, activeField, players, excludeNumbers]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setActiveField(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Flip dropdown upward when there isn't enough room below
  function checkDropDirection() {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 260);
  }

  const pick = (p: GamePlayer) => {
    const num  = p.playerNumber ?? "";
    const name = `${p.firstName} ${p.lastName}`.trim();
    onSelect(num, name);
    setActiveField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setActiveField(null);
    }
  };

  const hasSuggestions = suggestions.length > 0;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <div className={styles.fields}>
        {/* Jumper number */}
        <input
          type="text"
          inputMode="numeric"
          className={styles.numberInput}
          value={numberValue}
          placeholder={numberPlaceholder}
          onChange={(e) => {
            onNumberChange(e.target.value);
            setActiveField("number");
            setHighlighted(-1);
          }}
          onFocus={() => { setActiveField("number"); checkDropDirection(); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {/* Player name */}
        <input
          type="text"
          className={styles.nameInput}
          value={nameValue}
          placeholder={namePlaceholder}
          onChange={(e) => {
            onNameChange(e.target.value);
            setActiveField("name");
            setHighlighted(-1);
          }}
          onFocus={() => { setActiveField("name"); checkDropDirection(); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      {/* Suggestions dropdown */}
      {hasSuggestions && (
        <ul className={`${styles.suggestions} ${dropUp ? styles.suggestionsUp : ""}`} role="listbox">
          {suggestions.map((p, i) => {
            const num  = p.playerNumber ? `#${p.playerNumber}` : "";
            const name = `${p.firstName} ${p.lastName}`.trim();
            return (
              <li
                key={`${p.profileId ?? i}`}
                role="option"
                aria-selected={i === highlighted}
                className={`${styles.suggestion} ${i === highlighted ? styles.suggestionActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur before click registers
                  pick(p);
                }}
              >
                {num && <span className={styles.suggNum}>{num}</span>}
                <span className={styles.suggName}>{name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
