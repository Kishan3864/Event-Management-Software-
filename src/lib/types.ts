import type { Timestamp } from "firebase/firestore";

export type TS = Timestamp | null | undefined;

export type LocationType = "resort" | "garden" | "godown";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  address?: string;
  rate?: number; // default venue rent per day
  active?: boolean;
  createdAt?: TS;
}

export interface Category {
  id: string;
  name: string;
  order?: number;
  createdAt?: TS;
}

export interface Item {
  id: string;
  name: string;
  nameLower?: string;
  categoryId?: string;
  categoryName?: string;
  unit: string;
  totalQty: number; // owned (good + damaged + out)
  outQty: number; // currently out on rent
  damagedQty: number; // damaged, not usable until repaired
  rate: number; // default rent per unit per day
  hsn?: string;
  active?: boolean;
  createdAt?: TS;
  updatedAt?: TS;
}

export type MoveType =
  | "added"
  | "out"
  | "returned"
  | "damaged"
  | "missing"
  | "adjustment"
  | "repaired"
  | "writeoff";

export interface StockMove {
  id: string;
  itemId: string;
  itemName: string;
  type: MoveType;
  qty: number;
  bookingId?: string;
  bookingNo?: string;
  note?: string;
  date: string; // YYYY-MM-DD
  createdAt?: TS;
}

export interface Customer {
  id: string;
  name: string;
  nameLower: string;
  mobile: string;
  address?: string;
  gstin?: string;
  state?: string;
  notes?: string;
  bookingsCount?: number;
  lastEventDate?: string;
  createdAt?: TS;
  updatedAt?: TS;
}

export type BookingStatus = "confirmed" | "items_out" | "completed" | "cancelled";

export interface BookingItem {
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  days: number;
  amount: number;
  hsn?: string;
  outQty?: number;
  returnedQty?: number;
  damagedQty?: number;
  missingQty?: number;
}

export type ChargeKind = "labour" | "transport" | "decoration" | "custom" | "damage";

export interface ChargeLine {
  id: string;
  label: string;
  amount: number;
  kind?: ChargeKind;
}

export interface VenueLine {
  locationId: string;
  name: string;
  type: LocationType;
  rate: number;
  days: number;
  amount: number;
}

export type TaxMode = "none" | "gst";

export interface Booking {
  id: string;
  bookingNo: string;
  seq: number;
  customerId: string;
  customerName: string;
  customerNameLower: string;
  customerMobile: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;
  eventType?: string;
  notes?: string;
  fromDate: string;
  toDate: string;
  eventTime?: string;
  eventAddress?: string;
  days: number;
  venue?: VenueLine | null;
  locationId?: string | null;
  items: BookingItem[];
  charges: ChargeLine[];
  damageCharges: ChargeLine[];
  discount: number;
  roundOffAuto: boolean;
  taxMode: TaxMode;
  gstRate: number;
  interState: boolean;
  subtotal: number;
  taxable: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
  total: number; // payable now (grandTotal, or cancellation charge when cancelled)
  paid: number; // net received (payments - refunds)
  balance: number; // total - paid
  status: BookingStatus;
  cancelCharge?: number;
  cancelReason?: string;
  outDate?: string;
  returnDate?: string;
  completedDate?: string;
  cancelledDate?: string;
  returnNote?: string;
  createdAt?: TS;
  updatedAt?: TS;
}

export type PaymentType = "advance" | "payment" | "refund";
export type PaymentMode = "cash" | "upi" | "bank" | "cheque";

export interface Payment {
  id: string;
  receiptNo: string;
  seq: number;
  bookingId: string;
  bookingNo: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  type: PaymentType;
  date: string;
  amount: number; // always positive
  mode: PaymentMode;
  note?: string;
  createdAt?: TS;
}

export type InvoiceType = "tax" | "bill";

export interface InvoiceLine {
  description: string;
  detail?: string;
  hsn?: string;
  qty?: number;
  unit?: string;
  rate?: number;
  days?: number;
  amount: number;
}

export interface InvoiceParty {
  name: string;
  mobile: string;
  address?: string;
  gstin?: string;
  state?: string;
}

export interface Invoice {
  id: string;
  type: InvoiceType;
  invoiceNo: string;
  fy: string;
  seq: number;
  date: string;
  bookingId: string;
  bookingNo: string;
  customerId: string;
  customer: InvoiceParty;
  placeOfSupply?: string;
  eventFrom: string;
  eventTo: string;
  eventType?: string;
  eventAddress?: string;
  venueName?: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  gstRate: number;
  interState: boolean;
  hsnSac?: string;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  roundOff: number;
  total: number;
  paid: number;
  balance: number;
  createdAt?: TS;
  updatedAt?: TS;
}

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNo?: string;
  ifsc?: string;
  branch?: string;
  upiId?: string;
}

export interface Prefixes {
  booking: string;
  taxInvoice: string;
  bill: string;
  receipt: string;
}

export interface Settings {
  name: string;
  tagline?: string;
  address: string;
  city?: string;
  state: string;
  pincode?: string;
  phone1?: string;
  phone2?: string;
  email?: string;
  gstin?: string;
  logo?: string; // base64 data URL (resized)
  setupDone?: boolean;
  gstRate: number;
  hsnSac?: string;
  prefixes: Prefixes;
  terms?: string; // printed on invoice / bill
  bookingTerms?: string; // printed on booking slip
  bank?: BankDetails;
  tourDone?: Record<string, boolean>; // uid -> has seen the app tour
  updatedAt?: TS;
}

export interface Counter {
  seq: number;
}

// ---------------------------------------------------------------- platform (multi-client)

export type TenantStatus = "active" | "suspended";

/** A client business using the software. tenants/{id} */
export interface Tenant {
  id: string;
  name: string;
  slug?: string; // business link: /c/{slug}
  slugAliases?: string[]; // earlier links of this business (installed apps still open them)
  city?: string;
  state?: string;
  phone?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerUid?: string;
  status: TenantStatus;
  validUntil?: TS; // plan expiry (optional)
  notes?: string;
  createdAt?: TS;
  createdBy?: string;
  updatedAt?: TS;
}

export type MemberRole = "owner" | "staff";

/** Which business a login belongs to. users/{uid} */
export interface Membership {
  tenantId: string;
  role: MemberRole;
  email?: string;
  name?: string;
  createdAt?: TS;
}
