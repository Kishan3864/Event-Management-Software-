import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/customers", label: "Customers", icon: Users, description: "History & dues" },
  { href: "/stock", label: "Stock", icon: Package, description: "Items, out & damaged" },
  { href: "/payments", label: "Payments", icon: Wallet, description: "Collections & receipts" },
  { href: "/invoices", label: "Invoices", icon: FileText, description: "Tax invoices & bills" },
  { href: "/reports", label: "Reports", icon: BarChart3, description: "Bookings, dues, stock" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Business, venues, GST" },
];

export const MORE_NAV = NAV.filter((n) => !["/dashboard", "/bookings", "/calendar"].includes(n.href));

export function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
