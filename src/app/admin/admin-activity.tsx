"use client";

import { query } from "firebase/firestore";
import { Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchBox, ToneBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { rootCol } from "@/lib/db";
import { portalUrl } from "@/lib/portal";
import { ACTIVE_WINDOW_MS, type ClientActivity } from "@/lib/services/activity";
import type { Membership, Tenant } from "@/lib/types";
import { tenantIsActive } from "@/providers/auth-provider";

const COPY = {
  en: {
    title: "Live users", description: "Signed-in users are online when their app reports activity in the last five minutes.",
    total: "Logins", online: "Online", offline: "Offline", never: "No activity yet", blocked: "Access on hold",
    business: "Business link", login: "Login", status: "Activity", screen: "Last screen", seen: "Last seen", area: "Shared area",
    all: "All businesses", search: "Search email, name or link", back: "Clients", loading: "Loading users…",
    stale: "Live data is unavailable. Recent activity may be out of date.", empty: "No logins match these filters.",
    unknown: "Not shared", breakdown: "Users by business link", map: "Open map", language: "العربية",
    note: "Link visits without sign-in are anonymous. Users can share an approximate area from More.",
    screens: { setup: "Setup", dashboard: "Dashboard", bookings: "Bookings", calendar: "Calendar", customers: "Customers", invoices: "Invoices", payments: "Payments", reports: "Reports", settings: "Settings", stock: "Stock", more: "More" },
  },
  ar: {
    title: "المستخدمون المتصلون", description: "يُعد المستخدم متصلاً إذا سجّل التطبيق نشاطاً خلال آخر خمس دقائق بعد تسجيل الدخول.",
    total: "الحسابات", online: "متصل", offline: "غير متصل", never: "لا يوجد نشاط بعد", blocked: "الوصول معلّق",
    business: "رابط النشاط التجاري", login: "الحساب", status: "النشاط", screen: "آخر شاشة", seen: "آخر ظهور", area: "المنطقة المشتركة",
    all: "جميع الأنشطة التجارية", search: "ابحث بالبريد الإلكتروني أو الاسم أو الرابط", back: "العملاء", loading: "جارٍ تحميل المستخدمين…",
    stale: "البيانات المباشرة غير متاحة. قد لا يكون النشاط المعروض محدثاً.", empty: "لا توجد حسابات مطابقة.",
    unknown: "لم تتم مشاركتها", breakdown: "المستخدمون حسب الرابط", map: "افتح الخريطة", language: "English",
    note: "الزيارات بدون تسجيل دخول مجهولة. يمكن للمستخدم مشاركة منطقته التقريبية من قائمة المزيد.",
    screens: { setup: "الإعداد", dashboard: "لوحة التحكم", bookings: "الحجوزات", calendar: "التقويم", customers: "العملاء", invoices: "الفواتير", payments: "المدفوعات", reports: "التقارير", settings: "الإعدادات", stock: "المخزون", more: "المزيد" },
  },
};

type Status = "online" | "offline" | "never" | "blocked";

export function AdminActivity({ tenants, back }: { tenants: Tenant[]; back: () => void }) {
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now);
  const logins = useLiveQuery<Membership & { id: string }>(() => query(rootCol("users")), []);
  const activity = useLiveQuery<ClientActivity>(() => query(rootCol("clientActivity")), []);
  const t = COPY[language];
  const formatter = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const ready = logins.fromServer && activity.fromServer;
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const records = new Map(activity.data.map((record) => [record.id, record]));
  const counts = new Map(tenants.map((tenant) => [tenant.id, { total: 0, online: 0 }]));
  const rows = logins.data.map((login) => {
    const tenant = tenantsById.get(login.tenantId);
    const record = records.get(login.id);
    const tracked = record?.tenantId === login.tenantId ? record : undefined;
    const seen = tracked?.lastSeen?.toMillis() ?? 0;
    const state: Status = !tenant || !tenantIsActive(tenant) ? "blocked" : !seen ? "never" : now - seen < ACTIVE_WINDOW_MS ? "online" : "offline";
    const count = counts.get(login.tenantId);
    if (count) {
      count.total++;
      if (state === "online") count.online++;
    }
    return { login, tenant, tracked, seen, state };
  });
  const online = rows.filter((row) => row.state === "online").length;
  const term = search.trim().toLowerCase();
  const shown = rows.filter(({ login, tenant }) =>
    (!filter || login.tenantId === filter) && (!term || [login.email, login.name, tenant?.name, tenant?.slug].some((value) => typeof value === "string" && value.toLowerCase().includes(term)))
  ).sort((a, b) => Number(b.state === "online") - Number(a.state === "online") || b.seen - a.seen);
  const headers = [t.login, t.business, t.status, t.screen, t.seen, t.area];

  return (
    <section className="space-y-5" lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="rounded-3xl bg-brand-gradient p-5 text-white shadow-lift sm:p-8">
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" size="sm" onClick={back}>{t.back}</Button>
          <Button variant="secondary" size="sm" onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{t.language}</Button>
        </div>
        <h1 className="mt-4 flex items-center gap-3 text-3xl font-semibold"><Radio /> {t.title}</h1>
        <p className="mt-2 text-sm text-white/85">{t.description}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[[t.total, rows.length], [t.online, online], [t.offline, rows.length - online]].map(([label, count]) => (
          <div className="min-w-0 rounded-2xl border bg-card p-3 shadow-soft sm:p-5" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular">{ready ? count : "–"}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t.note}</p>
      {!ready ? <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{logins.loading || activity.loading ? t.loading : t.stale}</p> : null}
      <div className="flex flex-wrap gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} className="min-w-0 flex-1" />
        <select aria-label={t.business} value={filter} onChange={(e) => setFilter(e.target.value)} className="min-h-10 max-w-full rounded-xl border bg-card px-3 text-sm">
          <option value="">{t.all}</option>
          {tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card" tabIndex={0} aria-label={t.title} role="region">
        <table className="w-full min-w-[44rem] text-start text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>{headers.map((label) => <th scope="col" key={label} className="px-3 py-3 text-start font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {shown.map(({ login, tenant, tracked, seen, state }) => {
              const location = tracked?.location;
              const screen = tracked?.screen as keyof typeof t.screens | undefined;
              return (
                <tr key={login.id}>
                  <td className="max-w-56 px-3 py-3 wrap-anywhere"><bdi>{login.name || login.email || login.id}</bdi>{login.name && login.email ? <bdi className="block text-xs text-muted-foreground">{login.email}</bdi> : null}</td>
                  <td className="max-w-44 px-3 py-3 wrap-anywhere">
                    <p>{tenant?.name || "—"}</p>
                    {tenant?.slug ? <a className="text-xs text-primary underline" target="_blank" rel="noreferrer" href={portalUrl(tenant.slug)} dir="ltr">/c/{tenant.slug}</a> : null}
                  </td>
                  <td className="px-3 py-3"><ToneBadge tone={ready && state === "online" ? "success" : "muted"}>{ready ? t[state] : "—"}</ToneBadge></td>
                  <td className="px-3 py-3">{screen ? t.screens[screen] ?? "—" : "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{seen ? formatter.format(seen) : "—"}</td>
                  <td className="px-3 py-3">{location ? <>
                    <a className="font-medium text-primary underline" href={`https://www.google.com/maps/search/?api=1&query=${location.latCell / 10},${location.lngCell / 10}`} target="_blank" rel="noreferrer">{t.map}</a>
                    <p className="text-xs text-muted-foreground">{formatter.format(location.sharedAt.toMillis())}</p>
                  </> : <span className="text-muted-foreground">{t.unknown}</span>}</td>
                </tr>
              );
            })}
            {shown.length === 0 && ready ? <tr><td colSpan={6} className="p-5 text-center text-muted-foreground">{t.empty}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border bg-card">
        <h2 className="p-4 font-semibold">{t.breakdown}</h2>
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted">
            <tr>{[t.business, t.total, t.online, t.offline].map((label) => <th scope="col" className="px-2 py-2 text-start font-medium wrap-anywhere first:w-2/5" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {tenants.filter((tenant) => !filter || filter === tenant.id).map((tenant) => {
              const count = counts.get(tenant.id);
              const values = ready && count ? [count.total, count.online, count.total - count.online] : ["—", "—", "—"];
              return (
                <tr key={tenant.id}>
                  <th scope="row" className="px-2 py-2 text-start font-medium wrap-anywhere">{tenant.name}</th>
                  {values.map((value, index) => <td key={index} className="px-2 py-2">{value}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
