"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Editor { id: string; email: string; name: string; }

export default function AdminPage() {
  const [editors, setEditors] = useState<Editor[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/editors");
    if (res.ok) setEditors((await res.json()).editors);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setError(null);
    const res = await fetch("/api/editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: nameInput.trim() }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Failed to add");
    else { setEditors(data.editors); setEmailInput(""); setNameInput(""); }
    setAdding(false);
    emailRef.current?.focus();
  }

  async function handleRemove(editor: Editor) {
    setError(null);
    const res = await fetch("/api/editors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editor.id, email: editor.email }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Failed to remove");
    else setEditors(data.editors);
  }

  return (
    <div className="page">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Editor access</h1>
            <p className="admin-subtitle">These users can edit the Weekly Priorities board. Everyone else sees a read-only view.</p>
          </div>
          <Link href="/" className="btn btn-soft">← Back to board</Link>
        </div>

        <div className="admin-body">
          {loading ? (
            <p className="admin-empty">Loading…</p>
          ) : (
            <ul className="editor-list">
              {editors.map((editor) => (
                <li key={editor.id} className="editor-row">
                  <div className="editor-avatar">
                    {(editor.name || editor.email)[0].toUpperCase()}
                  </div>
                  <div className="editor-info">
                    {editor.name && <span className="editor-name">{editor.name}</span>}
                    <span className="editor-email">{editor.email}</span>
                  </div>
                  <button
                    className="btn danger editor-remove"
                    onClick={() => handleRemove(editor)}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {editors.length === 0 && <li className="admin-empty">No editors yet.</li>}
            </ul>
          )}

          <form className="editor-add-form" onSubmit={handleAdd}>
            <input
              ref={emailRef}
              className="form-input editor-add-input"
              type="email"
              placeholder="email@citystasher.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              disabled={adding}
            />
            <input
              className="form-input editor-add-input"
              type="text"
              placeholder="Name (optional)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={adding}
            />
            <button className="btn primary" type="submit" disabled={adding || !emailInput.trim()}>
              {adding ? "Adding…" : "Add editor"}
            </button>
          </form>

          {error && <p className="admin-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
