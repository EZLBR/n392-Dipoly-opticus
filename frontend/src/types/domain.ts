import type { EyewearConfig } from "../eyewear/config";
import type { Role } from "../routes/access";

export interface User {
  publicId: string;
  name: string;
  email: string;
  role: Role;
  factoryName?: string | null;
  createdAt?: string | null;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export type AuthResult = { ok: true; role: Role } | { ok: false; message: string };

export interface DesignFields extends Partial<EyewearConfig> {
  name: string;
  model?: string;
  config?: EyewearConfig | null;
  is_sunglasses?: boolean;
  antiReflective?: boolean;
  anti_reflective?: boolean;
  templeStyle?: string;
  temple_style?: string;
  top_bar?: boolean;
  bridgeStyle?: string;
  bridge_style?: string;
  frame_profile?: string;
  temple_open?: number;
  prescriptionFileName?: string;
  published?: boolean;
  createdAt?: string;
  created_at?: string;
}

export interface SavedDesign extends Omit<DesignFields, "name" | "config"> {
  name?: string;
  config?: Partial<EyewearConfig> | null;
  id: string;
  remoteId?: string;
  syncStatus?: "local" | "synced";
  updatedAt?: string;
}

export interface CustomSpecs extends Partial<EyewearConfig> {
  profile?: string;
  model?: string;
  shape?: string;
  material?: string;
  antiReflective?: boolean;
  templeStyle?: string;
  bridgeStyle?: string;
  prescriptionUploaded?: boolean;
}

export interface CartItem {
  id: string;
  productName: string;
  factoryPublicId?: string;
  factoryName?: string;
  total: number | string;
  quantity?: number;
  customSpecs: CustomSpecs;
  /** CART-01: um pedido deste item aguarda a confirmação do pagamento. */
  paymentPending?: boolean;
  /** CART-01: false se o item não pode mais ser comprado (fica sem preço). */
  available?: boolean;
}

export interface Order {
  publicId: string;
  customerName: string;
  productName: string;
  factoryName?: string | null;
  factoryPublicId?: string | null;
  status: string;
  total: number | string;
  customSpecs?: CustomSpecs;
  createdAt?: string | null;
  /** CONC-02: versão lida, enviada de volta na troca de status. */
  version?: number;
}

export interface Billing {
  checkoutUrl: string;
  isSimulated: boolean;
  billingId?: string;
}

export type BillingResult = ({ ok: true } & Billing) | { ok: false; error: string };
