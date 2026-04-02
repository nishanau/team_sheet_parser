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
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      gap: "16px",
      textAlign: "center",
      padding: "32px",
    }}>
      <h2 style={{ color: "var(--text)", fontSize: "20px", fontWeight: 700, margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0, maxWidth: 360 }}>
        An unexpected error occurred. You can try again or refresh the page.
      </p>
      <button
        onClick={reset}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "8px 20px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
