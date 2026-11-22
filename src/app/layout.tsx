import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { PRODUCT } from "@/lib/brand";
import { AppProviders } from "@/providers";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.name}` },
  description: "Bookings, billing, payments and stock for tent houses, resorts and gardens.",
  applicationName: PRODUCT.name,
  // The install file (manifest) link is added by INSTALL_FILE below, per business.
  appleWebApp: { capable: true, title: PRODUCT.shortName, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#7A1F3D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Capture Chrome's install prompt before React loads, so the "Install App" button can use it.
const INSTALL_PROMPT_CAPTURE = `window.__bip=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-ready'));});`;

// The admin address host (with port), e.g. tent-house-admin.web.app. Everything else is the clients' address.
const ADMIN_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_ADMIN_URL || "").host.toLowerCase();
  } catch {
    return "";
  }
})();

// Runs before anything else loads:
// - on the admin address: the admin look (data-app="admin"), the admin icon and the admin install file;
// - on a business link /c/<name> (or ?c=<name>, or on a device that signs in to one business): that business's own
//   install file, so "Add to Home screen" / "Install" open /c/<name>/; otherwise the normal install file.
const INSTALL_FILE = `(function(){try{
var admin=${JSON.stringify(ADMIN_HOST)}!==""&&location.host.toLowerCase()===${JSON.stringify(ADMIN_HOST)};
var s=null,href="/manifest.webmanifest";
if(admin){document.documentElement.setAttribute("data-app","admin");href="/admin.webmanifest";}
else{var p=/^\\/c\\/([a-z0-9-]{1,30})\\/?$/i.exec(location.pathname);s=p?p[1]:new URLSearchParams(location.search).get("c");
if(!s){try{s=localStorage.getItem("sth.portal");}catch(e){}}
if(s){s=s.toLowerCase();if(!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/.test(s))s=null;}
if(s)href="/c/"+s+"/app.webmanifest";}
var l=document.createElement("link");l.rel="manifest";l.id="app-manifest";l.href=href;document.head.appendChild(l);
if(admin){var set=function(el,attr,v){if(el.getAttribute(attr)!==v)el.setAttribute(attr,v);};
var fix=function(){
document.querySelectorAll('meta[name="theme-color"]').forEach(function(t){set(t,"content","#1d4ed8");});
document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(function(a){set(a,"href","/icons/admin-apple-touch-icon.png");});
document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(function(i){set(i,"href",i.getAttribute("sizes")==="16x16"?"/icons/admin-favicon-16.png":"/icons/admin-favicon-32.png");});
document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach(function(w){set(w,"content","THM Admin");});};
document.addEventListener("DOMContentLoaded",fix);new MutationObserver(fix).observe(document.head,{childList:true});}
}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${poppins.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_FILE }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CAPTURE }} />
      </head>
      <body className="min-h-dvh bg-background font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
