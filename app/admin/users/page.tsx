"use client";
import { useState, useEffect } from "react";
import styles from "./users.module.css";

type UserRow = {
  id: number;
  username: string;
  role: string;
  clubId: number | null;
  clubName: string | null;
};

type ClubRow = { id: number; name: string };

type FormMode = "create" | "edit";

const EMPTY_FORM = { username: "", password: "", clubId: "" };

export default function UsersPage() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [clubs,   setClubs]   = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode,    setMode]    = useState<FormMode>("create");
  const [editId,  setEditId]  = useState<number | null>(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/clubs").then((r) => r.json()),
    ]).then(([u, c]) => { setUsers(u); setClubs(c); }).finally(() => setLoading(false));
  }, []);

  function startEdit(user: UserRow) {
    setMode("edit");
    setEditId(user.id);
    setForm({ username: user.username, password: "", clubId: String(user.clubId ?? "") });
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function cancelEdit() {
    setMode("create");
    setEditId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const body =
        mode === "create"
          ? { username: form.username, password: form.password, clubId: Number(form.clubId) }
          : { id: editId, ...(form.username ? { username: form.username } : {}), ...(form.password ? { password: form.password } : {}), ...(form.clubId ? { clubId: Number(form.clubId) } : {}) };

      const res = await fetch("/api/admin/users", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as UserRow & { error?: string };
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }

      if (mode === "create") {
        // Find club name for the new user
        const club = clubs.find((c) => c.id === data.clubId);
        setUsers((prev) => [...prev, { ...data, clubName: club?.name ?? null }]);
        setForm(EMPTY_FORM);
        setSuccess(`Club admin "${data.username}" created.`);
      } else {
        const club = clubs.find((c) => c.id === data.clubId);
        setUsers((prev) => prev.map((u) => u.id === data.id ? { ...data, clubName: club?.name ?? null } : u));
        cancelEdit();
        setSuccess(`User updated.`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`Delete admin "${user.username}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      alert(data.error ?? "Failed to delete.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    if (editId === user.id) cancelEdit();
  }

  // Clubs that already have an admin (for UI hint), excluding the one being edited
  const clubsWithAdmin = new Set(
    users.filter((u) => u.role === "club_admin" && u.id !== editId).map((u) => u.clubId).filter(Boolean)
  );

  const clubAdmins = users.filter((u) => u.role === "club_admin");
  const superadmins = users.filter((u) => u.role === "superadmin");

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div>
      <h1 className={styles.title}>Admin Users</h1>

      {/* Superadmins (read-only) */}
      {superadmins.length > 0 && (
        <>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>SUPERADMINS</p>
          <table className={styles.table} style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th className={styles.th}>Username</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Club</th>
              </tr>
            </thead>
            <tbody>
              {superadmins.map((u) => (
                <tr key={u.id} className={styles.tr}>
                  <td className={styles.td}>{u.username}</td>
                  <td className={styles.td} style={{ color: "var(--accent)" }}>{u.role}</td>
                  <td className={styles.td} style={{ color: "var(--muted)" }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Club admins */}
      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>CLUB ADMINS</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Username</th>
            <th className={styles.th}>Club</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {clubAdmins.length === 0 && (
            <tr>
              <td className={styles.td} colSpan={3} style={{ color: "var(--muted)" }}>
                No club admins yet.
              </td>
            </tr>
          )}
          {clubAdmins.map((u) => (
            <tr key={u.id} className={styles.tr}>
              <td className={styles.td}>{u.username}</td>
              <td className={styles.td}>{u.clubName ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <button className={styles.btn} onClick={() => startEdit(u)}>Edit</button>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleDelete(u)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Create / Edit form */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>
          {mode === "create" ? "Create Club Admin" : `Edit "${users.find((u) => u.id === editId)?.username}"`}
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Username</label>
            <input
              className={styles.input}
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder={mode === "edit" ? "Leave blank to keep current" : "e.g. glenorchy_admin"}
              required={mode === "create"}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Password{mode === "edit" && <span style={{ fontWeight: 400, color: "var(--muted)" }}> (leave blank to keep current)</span>}
            </label>
            <input
              className={styles.input}
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={mode === "edit" ? "Leave blank to keep current" : "Min 8 characters"}
              required={mode === "create"}
              minLength={mode === "create" ? 8 : undefined}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Club</label>
            <select
              className={styles.select}
              value={form.clubId}
              onChange={(e) => setForm((f) => ({ ...f, clubId: e.target.value }))}
              required
            >
              <option value="">Select a club…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id} disabled={clubsWithAdmin.has(c.id)}>
                  {c.name}{clubsWithAdmin.has(c.id) ? " (has admin)" : ""}
                </option>
              ))}
            </select>
          </div>

          {error   && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}

          <div className={styles.formRow}>
            <button type="submit" className={styles.submitBtn} disabled={saving}>
              {saving ? "Saving…" : mode === "create" ? "Create Admin" : "Save Changes"}
            </button>
            {mode === "edit" && (
              <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
