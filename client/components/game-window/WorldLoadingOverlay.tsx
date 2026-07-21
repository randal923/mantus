import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useGameWindowStore } from "./store/useGameWindowStore";

export function WorldLoadingOverlay() {
  const { t } = useAppTranslation();
  const worldLoading = useGameWindowStore((state) => state.worldLoading);
  const progress = useGameWindowStore((state) => state.worldLoadProgress);
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;

  if (!worldLoading) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black">
      <p className="text-sm text-white/70">
        {t("connection.enteringWorld")}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-64 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-white/60 transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-white/50">{percent}%</p>
    </div>
  );
}
