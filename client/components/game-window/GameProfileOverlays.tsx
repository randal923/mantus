import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BugReportModal } from "../profile/BugReportModal";
import { ProfileModal } from "../profile/ProfileModal";
import { PublicProfileModal } from "../profile/PublicProfileModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameProfileOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const profileWindowOpen = useGameWindowStore(
    (state) => state.profileWindowOpen,
  );
  const publicProfileOpen = useGameWindowStore(
    (state) => state.publicProfileOpen,
  );
  const bugReportOpen = useGameWindowStore((state) => state.bugReportOpen);
  const profileSession = useGameWindowStore(
    (state) => state.sessions?.profile ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setProfileWindowOpen = useGameWindowStore(
    (state) => state.setProfileWindowOpen,
  );
  const setPublicProfileOpen = useGameWindowStore(
    (state) => state.setPublicProfileOpen,
  );
  const setBugReportOpen = useGameWindowStore(
    (state) => state.setBugReportOpen,
  );
  if (!ownCharacter || !profileSession || !sessionActions) return null;

  const error = profileSession.error
    ? t(`profile.errors.${profileSession.error}`, {
        defaultValue: t("profile.errors.invalid-request"),
      })
    : null;

  return (
    <>
      {profileWindowOpen && (
        <ProfileModal
          profile={profileSession.profile}
          characterName={ownCharacter.name}
          level={ownCharacter.level}
          vocation={ownCharacter.vocation}
          pending={profileSession.pending}
          error={error}
          onSelectTitle={(titleId) => {
            const sent =
              runtime.clientRef.current?.selectTitle(titleId) ?? false;
            sessionActions.profile.begin(sent);
          }}
          onClose={() => {
            setProfileWindowOpen(false);
            sessionActions.profile.dismissError();
          }}
        />
      )}
      {publicProfileOpen && (
        <PublicProfileModal
          profile={profileSession.publicProfile}
          pending={profileSession.pending}
          error={error}
          onClose={() => {
            setPublicProfileOpen(false);
            sessionActions.profile.clearPublicProfile();
            sessionActions.profile.dismissError();
          }}
        />
      )}
      {bugReportOpen && (
        <BugReportModal
          pending={profileSession.pending}
          error={error}
          onReport={(category, message) => {
            // No begin(): a successful bug report is only acked by a
            // server-notice, so a pending flag would never clear.
            const sent =
              runtime.clientRef.current?.reportBug(category, message) ??
              false;
            if (sent) sessionActions.profile.dismissError();
            else sessionActions.profile.fail("invalid-request");
          }}
          onClose={() => {
            setBugReportOpen(false);
            sessionActions.profile.dismissError();
          }}
        />
      )}
    </>
  );
}
