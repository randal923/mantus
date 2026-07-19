import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface PartyInvitationToastProps {
  leaderName: string;
  onAccept: () => void;
  onDecline: () => void;
}

/** Incoming party invitation; both answers are just intents to the server. */
export function PartyInvitationToast({
  leaderName,
  onAccept,
  onDecline,
}: PartyInvitationToastProps) {
  const { t } = useAppTranslation();
  return (
    <div
      role="alertdialog"
      aria-label={t("party.invitationFrom", { name: leaderName })}
      className="ui-panel-frame pointer-events-auto flex items-center gap-3 px-4 py-3 font-tibia text-sm text-ui-text-bright"
    >
      <span>{t("party.invitationFrom", { name: leaderName })}</span>
      <Button size="sm" variant="primary" onClick={onAccept}>
        {t("party.accept")}
      </Button>
      <Button size="sm" onClick={onDecline}>
        {t("party.decline")}
      </Button>
    </div>
  );
}
