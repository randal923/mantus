export interface MarketOfferRow {
  id: string;
  character_id: string;
  account_id: string;
  side: "buy" | "sell";
  item_type_id: number;
  amount: number;
  remaining_amount: number;
  unit_price: string;
  fee_paid: string;
  escrow_balance: string;
  version: number;
  created_at: Date;
  expires_at: Date;
}
