"use client";
import { signIn } from "next-auth/react";
import { useState, FormEvent } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showPass, setShowPass]   = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      username: form.get("username"),
      password: form.get("password"),
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid username or password.");
    } else {
      window.location.assign("/admin/leaderboard");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>SFL Admin</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input name="username" type="text" className={styles.input} required autoFocus />
          </label>
          <label className={styles.label}>
            Password
            <div className={styles.passwordWrap}>
              <input
                name="password"
                type={showPass ? "text" : "password"}
                className={styles.input}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
