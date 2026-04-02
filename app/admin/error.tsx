"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "32px",
      maxWidth: 480,
    }}>
      <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>
        An unexpected error occurred on this page.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: "8px",
          padding: "7px 18px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}
        onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.18)")}
        onBlur={(e) => (e.currentTarget.style.boxShadow = "")}
      >
        Try again
      </button>
    </div>
  );
}
