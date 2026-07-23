"use client";

import type { ReactNode } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal, type ModalPagination } from "../ui/Modal";
import { WikiTabIcon } from "./WikiTabIcon";

export type WikiTab = "items" | "bestiary" | "bosstiary";

interface WikiModalFrameProps {
  activeTab: WikiTab;
  pagination?: ModalPagination;
  children: ReactNode;
  onSelectTab: (tab: WikiTab) => void;
  onClose: () => void;
}

export function WikiModalFrame({
  activeTab,
  pagination,
  children,
  onSelectTab,
  onClose,
}: WikiModalFrameProps) {
  const { t } = useAppTranslation();

  return (
    <Modal
      title={t("wiki.title")}
      onClose={onClose}
      size="extra-wide"
      pagination={pagination}
      tabs={{
        label: t("wiki.sections"),
        selected: activeTab,
        items: [
          {
            id: "items",
            label: t("wiki.tabs.items"),
            icon: <WikiTabIcon name="items" />,
          },
          {
            id: "bestiary",
            label: t("wiki.tabs.bestiary"),
            icon: <WikiTabIcon name="bestiary" />,
          },
          {
            id: "bosstiary",
            label: t("wiki.tabs.bosstiary"),
            icon: <WikiTabIcon name="bosstiary" />,
          },
        ],
        onSelect: (id) => onSelectTab(id as WikiTab),
      }}
    >
      {children}
    </Modal>
  );
}
