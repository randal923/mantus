"use client";

import { useState } from "react";
import { PROTOCOL_LIMITS } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface AddFriendModalProps {
  pending: boolean;
  onAdd: (name: string) => void;
  onClose: () => void;
}

export function AddFriendModal({
  pending,
  onAdd,
  onClose,
}: AddFriendModalProps) {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");

  return (
    <Modal title={t("vip.addFriend")} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const targetName = name.trim();
          if (!targetName || pending) return;
          onAdd(targetName);
          onClose();
        }}
      >
        <Input
          autoFocus
          label={t("vip.playerName")}
          placeholder={t("vip.addPlaceholder")}
          value={name}
          maxLength={PROTOCOL_LIMITS.maxCharacterNameLength}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button size="sm" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={pending || name.trim().length === 0}
          >
            {t("vip.add")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
