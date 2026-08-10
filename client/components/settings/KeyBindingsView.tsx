"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  KEY_BINDING_SECTIONS,
  isMovementBindingAction,
} from "../../lib/hotkeys/keyBindings";
import { useKeyBindingsStore } from "../../stores/useKeyBindingsStore";
import { Button } from "../ui/Button";
import { KeyBindingCaptureButton } from "./KeyBindingCaptureButton";

interface KeyBindingsViewProps {
  readonly onBack: () => void;
}

export function KeyBindingsView({ onBack }: KeyBindingsViewProps) {
  const { t } = useAppTranslation();
  const bindings = useKeyBindingsStore((state) => state.bindings);
  const setBinding = useKeyBindingsStore((state) => state.setBinding);
  const resetBindings = useKeyBindingsStore((state) => state.resetBindings);
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <p className="text-sm leading-6 text-ui-muted">
        {t("hotkeys.captureHint")}
      </p>
      <div className="ui-scrollbar -mr-2 flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-2">
        {KEY_BINDING_SECTIONS.map((section) => (
          <section key={section.category} className="flex flex-col gap-2">
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t(`hotkeys.categories.${section.category}`)}
            </h3>
            <div className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-black/20">
              {section.actions.map((action) => {
                const label = t(`hotkeys.actions.${action}`);
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-4 border-b border-ui-stone-light/10 px-3 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-ui-text">
                      {label}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <KeyBindingCaptureButton
                        label={label}
                        binding={bindings[action]}
                        bareKeyOnly={isMovementBindingAction(action)}
                        onChange={(binding) => setBinding(action, binding)}
                      />
                      <button
                        type="button"
                        aria-label={t("hotkeys.clearLabel", { action: label })}
                        disabled={!bindings[action]}
                        onClick={() => setBinding(action, null)}
                        className="flex size-9 shrink-0 items-center justify-center rounded border border-ui-stone-light/25 bg-black/35 text-ui-muted outline-none hover:text-ui-text focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ui-muted"
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <Button size="sm" onClick={onBack}>
          ‹ {t("common.back")}
        </Button>
        <Button size="sm" variant="danger" onClick={resetBindings}>
          {t("hotkeys.resetDefaults")}
        </Button>
      </div>
    </div>
  );
}
