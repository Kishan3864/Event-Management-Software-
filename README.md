# Tent House Manager — multi-client booking & billing PWA

One app for many tent house / resort / garden businesses. Every client business gets the **same app, design and features** with **its own name, logo, data, numbering, logins and link**. Adding a client needs no code change and no deployment. Made by **Brighton Solution**.

**Stack:** Next.js 16 (App Router, static export) · TypeScript · Tailwind CSS v4 · shadcn/ui · lucide-react · Poppins · Firebase Auth (email/password) + Cloud Firestore (offline persistence) · @react-pdf/renderer. Runs on the free **Spark** plan.

---

## Two separate addresses

| Address | Who | Look |
| --- | --- | --- |
| **Admin** — `https://tent-house-admin.web.app` (`NEXT_PUBLIC_ADMIN_URL`) | Only the software owner: admin sign-in and the **Clients** panel (`/admin`) | Indigo “Admin Panel” design, shield icon, installs as “THM Admin” |
| **Clients** — `https://tent-house-manager.web.app/c/<name>` (`NEXT_PUBLIC_APP_URL`) | Each business at its own link, e.g. `/c/royal` | Business design (maroon/gold) with the business's own name and logo |

- A business login works only at its own link; the admin login works only on the admin address.
- The link stays in the address bar, and **Add to Home screen / Install** from a link creates that business's own app (its own install file `/c/<name>/app.webmanifest`) which always opens that link.
- The Firebase project's default site (`<project>.web.app`) only forwards to the clients' address.

## Data

| Firestore path | What it is | Who can use it |
| --- | --- | --- |
| `admins/{uid}` | Platform admins | Admins only |
| `users/{uid}` | Which business a login belongs to (`tenantId`, `role`) | Created from the Clients panel |
| `tenants/{id}` | A client business (name, link, status, plan date) | Admins; a business can read its own and change only its name/city/phone |
| `tenants/{id}/{settings,locations,categories,items,stockMoves,customers,bookings,payments,invoices,counters}/…` | All of that business's data | That business's logins, while active and within the plan |
| `clientNotes/{id}` | The admin's private notes about a client | Admins only |

- Security is enforced by `firestore.rules`, not just the UI.
- On sign-out the business data cached on the device is deleted. If some changes have not reached the server yet, the app asks first.
- Renaming a client's link keeps the old link working for that client.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # Firebase web config + the two addresses
npm run dev                         # http://localhost:3000
```

## Add a client

1. Sign in on the admin address → **Clients** → **Add client**.
2. Enter the business name (its link name fills in, e.g. `royal`), city, the owner's login email + password, plan validity.
3. Send the card shown after saving (link + email + password) on WhatsApp. On first sign-in they complete the setup (logo, address, GSTIN, venues, items) and get a short app tour.

## Build & deploy

```bash
npm run build                        # static export to ./out + service worker + install files
firebase deploy --only hosting       # clients, admin and the forwarding default site
firebase deploy --only firestore     # rules + indexes
```

## Features

Dashboard · Bookings (venue and/or items, charges, discount, GST, advance, double-booking & stock warnings, items out → return with damaged/missing) · Calendar · Tax Invoice / Bill (CGST+SGST or IGST, per-FY numbering, editable prefixes and next numbers) · Payments & receipts · Stock with history · Customers · Reports · Settings · A4 PDFs (invoice, bill, booking slip, delivery challan, return slip, receipt, reports) with Share/Download/Print · WhatsApp messages · Installable PWA that works on weak internet.

## Testing with the Firebase Emulator Suite (optional, needs Java)

```bash
firebase emulators:start --only auth,firestore --project demo-tent-house
NEXT_PUBLIC_USE_EMULATORS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tent-house \
NEXT_PUBLIC_ADMIN_URL=http://localhost:3100 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 npm run build
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Static export to `out/` + service worker |
| `npm run brand` | Regenerate product icons + manifest |
| `node scripts/generate-admin-icons.mjs` | Regenerate the admin panel icons |
| `npm run typecheck` / `npm run lint` | Checks |
