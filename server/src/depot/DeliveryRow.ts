export interface DeliveryRow {
  delivery_kind: "mail" | "reward" | "system";
  recipient_character_id: string;
  return_character_id: string | null;
  item_id: string | null;
  original_item_id: string;
  status: "delivered" | "claimed" | "returned";
  recipient_name?: string;
}
