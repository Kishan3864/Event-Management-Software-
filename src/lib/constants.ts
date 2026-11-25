import type {
  BookingStatus,
  LocationType,
  MoveType,
  PaymentMode,
  PaymentType,
  Prefixes,
  Settings,
} from "./types";

import { PRODUCT } from "./brand";

export const APP_NAME = PRODUCT.name;
export const MADE_BY = PRODUCT.madeBy;
export const HOME_STATE = "Madhya Pradesh";

export const INDIAN_STATES: { name: string; code: string }[] = [
  { name: "Andaman and Nicobar Islands", code: "35" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Arunachal Pradesh", code: "12" },
  { name: "Assam", code: "18" },
  { name: "Bihar", code: "10" },
  { name: "Chandigarh", code: "04" },
  { name: "Chhattisgarh", code: "22" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
  { name: "Delhi", code: "07" },
  { name: "Goa", code: "30" },
  { name: "Gujarat", code: "24" },
  { name: "Haryana", code: "06" },
  { name: "Himachal Pradesh", code: "02" },
  { name: "Jammu and Kashmir", code: "01" },
  { name: "Jharkhand", code: "20" },
  { name: "Karnataka", code: "29" },
  { name: "Kerala", code: "32" },
  { name: "Ladakh", code: "38" },
  { name: "Lakshadweep", code: "31" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Maharashtra", code: "27" },
  { name: "Manipur", code: "14" },
  { name: "Meghalaya", code: "17" },
  { name: "Mizoram", code: "15" },
  { name: "Nagaland", code: "13" },
  { name: "Odisha", code: "21" },
  { name: "Puducherry", code: "34" },
  { name: "Punjab", code: "03" },
  { name: "Rajasthan", code: "08" },
  { name: "Sikkim", code: "11" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Telangana", code: "36" },
  { name: "Tripura", code: "16" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Uttarakhand", code: "05" },
  { name: "West Bengal", code: "19" },
];

export function stateCode(name?: string): string {
  return INDIAN_STATES.find((s) => s.name === name)?.code ?? "";
}

export const EVENT_TYPES = [
  "Wedding",
  "Engagement",
  "Reception",
  "Haldi / Mehndi",
  "Birthday",
  "Puja / Religious",
  "Bhandara",
  "Corporate",
  "Party",
  "Other",
];

export const UNITS = ["pcs", "set", "nos", "pair", "meter", "sq ft", "kg"];

export const DEFAULT_CATEGORIES = [
  "Chairs",
  "Tables",
  "Tents & Pandal",
  "Gadda & Bedding",
  "Utensils",
  "Lights & Decor",
  "Sound & Electrical",
  "Furniture",
  "Other",
];

export const SUGGESTED_ITEMS: { name: string; category: string; unit: string }[] = [
  { name: "Plastic Chair", category: "Chairs", unit: "pcs" },
  { name: "VIP Chair", category: "Chairs", unit: "pcs" },
  { name: "Sofa Set", category: "Furniture", unit: "set" },
  { name: "Round Table", category: "Tables", unit: "pcs" },
  { name: "Rectangle Table", category: "Tables", unit: "pcs" },
  { name: "Shamiyana", category: "Tents & Pandal", unit: "pcs" },
  { name: "Kanat (Side Wall)", category: "Tents & Pandal", unit: "pcs" },
  { name: "Gadda", category: "Gadda & Bedding", unit: "pcs" },
  { name: "Rajai", category: "Gadda & Bedding", unit: "pcs" },
  { name: "Takiya", category: "Gadda & Bedding", unit: "pcs" },
  { name: "Dari", category: "Gadda & Bedding", unit: "pcs" },
  { name: "Bhagona", category: "Utensils", unit: "pcs" },
  { name: "Kadhai", category: "Utensils", unit: "pcs" },
  { name: "Halogen Light", category: "Lights & Decor", unit: "pcs" },
  { name: "LED Jhalar", category: "Lights & Decor", unit: "pcs" },
  { name: "Cooler", category: "Sound & Electrical", unit: "pcs" },
];

export const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "venue", label: "Other venue" },
  { value: "resort", label: "Resort" },
  { value: "garden", label: "Garden" },
  { value: "godown", label: "Godown" },
];

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  venue: "Venue",
  resort: "Resort",
  garden: "Garden",
  godown: "Godown",
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  items_out: "Items Out",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
];

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  cheque: "Cheque",
};

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  advance: "Advance",
  payment: "Payment",
  refund: "Refund",
};

export const MOVE_LABEL: Record<MoveType, string> = {
  added: "Added",
  out: "Out on rent",
  returned: "Returned",
  damaged: "Damaged",
  missing: "Missing",
  adjustment: "Adjustment",
  repaired: "Repaired",
  writeoff: "Written off",
};

export const DEFAULT_PREFIXES: Prefixes = {
  booking: "BK",
  taxInvoice: "TI",
  bill: "BL",
  receipt: "RC",
};

export const DEFAULT_TERMS = [
  "Goods once delivered must be returned in the same condition.",
  "Damaged or missing items will be charged extra.",
  "Balance payment must be cleared on or before the event date.",
  "Subject to local jurisdiction.",
].join("\n");

/** Default bill terms for a business, using its city for the jurisdiction line. */
export function buildDefaultTerms(city?: string): string {
  const c = (city || "").trim();
  return c ? DEFAULT_TERMS.replace("Subject to local jurisdiction.", `Subject to ${c} jurisdiction.`) : DEFAULT_TERMS;
}

export const DEFAULT_BOOKING_TERMS = [
  "Advance is not refundable on cancellation.",
  "Please check all items at the time of delivery and return.",
  "Damaged or missing items will be charged extra.",
].join("\n");

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  tagline: "",
  address: "",
  city: "",
  state: HOME_STATE,
  pincode: "",
  phone1: "",
  phone2: "",
  email: "",
  gstin: "",
  logo: "",
  setupDone: false,
  gstRate: 18,
  hsnSac: "",
  prefixes: DEFAULT_PREFIXES,
  terms: DEFAULT_TERMS,
  bookingTerms: DEFAULT_BOOKING_TERMS,
  bank: { bankName: "", accountName: "", accountNo: "", ifsc: "", branch: "", upiId: "" },
};

/** Calendar colours for venues (cycled). */
export const VENUE_COLORS = ["#7a1f3d", "#b7862c", "#15803d", "#1d4ed8", "#9333ea", "#0f766e", "#c2410c", "#be185d"];
export const ITEMS_ONLY_COLOR = "#6e6468";
