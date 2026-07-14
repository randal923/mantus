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
      className="relative isolate flex w-full max-w-sm flex-col gap-4 overflow-hidden rounded-sm border border-[#3a5054] bg-radial-[at_50%_8%] from-ui-panel-light via-ui-panel via-55% to-ui-panel-deep p-6 font-tibia text-ui-text shadow-[0_4px_20px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(0,0,0,0.7)]"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-50 mix-blend-overlay"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-[#2c5b5c]/60 to-transparent"
      />
      <header className="flex flex-col items-center gap-1">
        <h1 className="font-display text-4xl tracking-wide [font-variant:small-caps] [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
          Manus Online
        </h1>
        <p className="text-sm text-ui-text/60">Sign in to enter the world</p>
      </header>
      <div
        aria-hidden
        className="h-px bg-linear-to-r from-transparent via-ui-accent/50 to-transparent"
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <p role="alert" className="text-sm text-[#e08585]">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-[#9ed08a]">{notice}</p>}
        <div className="mt-1 flex justify-center gap-2">
          <Button type="submit" variant="gold" disabled={busy}>
            Sign In
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
        className="flex items-center gap-3 text-xs text-ui-text/40"
      >
        <span className="h-px flex-1 bg-linear-to-r from-transparent to-ui-accent/40" />
        or
        <span className="h-px flex-1 bg-linear-to-l from-transparent to-ui-accent/40" />
      </div>

      <Button
        type="button"
        disabled={busy}
        onClick={onGoogle}
        className="flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Continue with Google
      </Button>
    </section>
  );
}
