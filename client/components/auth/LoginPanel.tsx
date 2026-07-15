"use client";

import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { GoogleIcon } from "./GoogleIcon";

interface LoginPanelProps {
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  onGoogle: () => void;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
}

export function LoginPanel({
  onSignIn,
  onSignUp,
  onGoogle,
  busy = false,
  error,
  notice,
}: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSignIn(email, password);
  };

  return (
    <section
      aria-label="Sign in"
      className="ui-panel-frame relative isolate flex w-full flex-col gap-5 overflow-hidden px-7 py-8 font-tibia text-ui-text sm:px-9"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 -z-10 h-32 bg-radial from-ui-accent/15 to-transparent blur-2xl"
      />
      <header className="flex flex-col items-center gap-2 text-center">
        <div
          aria-hidden
          className="mb-1 flex size-11 rotate-45 items-center justify-center border border-ui-gold/35 bg-black/45 shadow-[0_0_24px_rgba(143,30,22,0.22)]"
        >
          <span className="size-3 border border-ui-accent-light/70 bg-ui-accent-deep shadow-[0_0_12px_rgba(189,59,46,0.42)]" />
        </div>
        <p className="text-[10px] tracking-[0.34em] text-ui-gold uppercase">
          Welcome back
        </p>
        <h1 className="font-display text-3xl tracking-[0.12em] text-ui-text-bright uppercase [text-shadow:0_2px_12px_rgba(0,0,0,0.9)] sm:text-4xl">
          Mantus Online
        </h1>
        <p className="text-sm text-ui-muted">Sign in to enter the world</p>
      </header>
      <div aria-hidden className="ui-divider" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          disabled={busy}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          disabled={busy}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p role="alert" className="border-l-2 border-ui-accent bg-ui-accent/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="border-l-2 border-ui-success bg-ui-success/10 px-3 py-2 text-sm text-green-200">
            {notice}
          </p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && (
              <span
                aria-hidden
                className="size-3 rotate-45 border border-current border-t-transparent motion-safe:animate-spin"
              />
            )}
            {busy ? "Entering" : "Sign In"}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSignUp(email, password)}
          >
            Create Account
          </Button>
        </div>
      </form>

      <div
        aria-hidden
        className="flex items-center gap-3 text-[10px] tracking-[0.22em] text-ui-muted uppercase"
      >
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-ui-gold/35" />
        or
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-ui-gold/35" />
      </div>

      <Button
        type="button"
        disabled={busy}
        onClick={onGoogle}
        className="w-full"
      >
        <GoogleIcon />
        Continue with Google
      </Button>
    </section>
  );
}
