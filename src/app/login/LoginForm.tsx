"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/username";
import { ErrorNote } from "@/components/ui";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (authError) {
      setError("Usuario o contrasena incorrectos.");
      setBusy(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card reveal space-y-5 p-8" style={{ ["--index" as string]: 1 }}>
      <div className="space-y-2">
        <label htmlFor="username" className="eyebrow block">
          Usuario
        </label>
        <input
          id="username"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="eyebrow block">
          Contrasena
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <ErrorNote message={error} />

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
