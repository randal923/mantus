import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ReportPlayerModal } from "../social/ReportPlayerModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function ReportPlayerOverlay() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const session = useGameWindowStore((state) => state.reportSession);
  const setSession = useGameWindowStore((state) => state.setReportSession);
  if (!session) return null;

  return (
    <ReportPlayerModal
      key={session.targetName || "report"}
      initialTargetName={session.targetName}
      pending={session.pending}
      error={
        session.error
          ? t(`report.errors.${session.error}`, {
              defaultValue: t("report.errors.invalid-request"),
            })
          : null
      }
      sent={session.sent}
      onSubmit={(targetName, reason, comment) => {
        const sent =
          runtime.clientRef.current?.reportPlayer(
            targetName,
            reason,
            comment,
          ) ?? false;
        setSession((current) =>
          current
            ? {
                ...current,
                targetName,
                pending: sent,
                error: sent ? null : "invalid-request",
              }
            : current,
        );
      }}
      onClose={() => setSession(null)}
    />
  );
}
