"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { managerLogin } from "@/actions/manager";
import { Btn, inputCls } from "./ui";

export function ManagerLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b0a09] px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await managerLogin(password);
            if (r.ok) window.location.reload();
            else setError(r.error);
          });
        }}
        className="w-full max-w-sm rounded-3xl border border-gold/25 bg-[#141210] p-8 text-center"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-gold/40 text-gold">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-5 font-serif text-3xl">Painel do Studio</h1>
        <p className="mt-1 font-label text-[10px] tracking-[0.3em] text-gold uppercase">Acesso privado</p>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          aria-label="Senha"
          className={`${inputCls} mt-8 text-center`}
        />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <Btn type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
        </Btn>
      </form>
    </main>
  );
}
