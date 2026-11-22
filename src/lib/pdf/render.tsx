import { Document, Text, View, pdf } from "@react-pdf/renderer";
import { payableOf, pendingOf, totalsOf } from "../calc";
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL, STATUS_LABEL } from "../constants";
import { daysInclusive, todayYMD } from "../dates";
import {
  amountInWords,
  formatDate,
  formatDateRange,
  formatINR,
  formatNumber,
  formatPhone,
  formatTime,
  formatTimestamp,
} from "../format";
import type { Booking, Invoice, Payment, Settings } from "../types";
import {
  A4,
  C,
  InfoBox,
  KV,
  Letterhead,
  Signature,
  SignLine,
  TableHead,
  TableRow,
  TableTotalRow,
  TermsBlock,
  TotalLine,
  ensureFonts,
  s,
  stateWithCode,
  type Col,
} from "./parts";
import type { PdfJob, ReportSpec } from "./types";

const money = (n: number) => formatINR(n, { decimals: 2 });
const plain = (n: number) => formatINR(n, { decimals: 2, symbol: false });

function bankLines(st: Settings): string[] {
  const b = st.bank || {};
  return [
    b.accountName ? `A/c Name: ${b.accountName}` : "",
    b.bankName ? `Bank: ${b.bankName}${b.branch ? `, ${b.branch}` : ""}` : "",
    b.accountNo ? `A/c No: ${b.accountNo}` : "",
    b.ifsc ? `IFSC: ${b.ifsc}` : "",
    b.upiId ? `UPI: ${b.upiId}` : "",
  ].filter(Boolean);
}

function BankBox({ settings }: { settings: Settings }) {
  const lines = bankLines(settings);
  if (!lines.length) return null;
  return (
    <View style={[s.box, { marginTop: 8, backgroundColor: C.white }]}>
      <Text style={s.sectionTitle}>Bank / UPI details</Text>
      {lines.map((l) => (
        <Text key={l} style={{ fontSize: 7.8 }}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function WordsBox({ amount }: { amount: number }) {
  return (
    <View style={[s.box, { backgroundColor: C.goldSoft, borderColor: "#EBD9B4" }]}>
      <Text style={[s.sectionTitle, { color: C.gold }]}>Amount in words</Text>
      <Text style={{ fontSize: 8.2, fontWeight: 600 }}>{amountInWords(amount)}</Text>
    </View>
  );
}

// ======================================================================= Invoice / Bill
function InvoiceDoc({ inv, st, paid, balance }: { inv: Invoice; st: Settings; paid: number; balance: number }) {
  const isTax = inv.type === "tax";
  const title = isTax ? "TAX INVOICE" : "BILL";
  const cols: Col[] = isTax
    ? [
        { label: "#", width: 18 },
        { label: "Description" },
        { label: "HSN/SAC", width: 48 },
        { label: "Qty", width: 50, align: "right" },
        { label: "Rate", width: 54, align: "right" },
        { label: "Days", width: 28, align: "center" },
        { label: "Amount", width: 70, align: "right" },
      ]
    : [
        { label: "#", width: 18 },
        { label: "Description" },
        { label: "Qty", width: 54, align: "right" },
        { label: "Rate", width: 58, align: "right" },
        { label: "Days", width: 30, align: "center" },
        { label: "Amount", width: 76, align: "right" },
      ];
  const half = inv.gstRate / 2;
  return (
    <Document title={`${title} ${inv.invoiceNo}`} author={st.name} creator={st.name} producer={st.name}>
      <A4 footer={`This is a computer generated ${isTax ? "tax invoice" : "bill"}.`}>
        <Letterhead
          settings={st}
          title={title}
          meta={[
            { label: isTax ? "Invoice No" : "Bill No", value: inv.invoiceNo },
            { label: "Date", value: formatDate(inv.date) },
            { label: "Booking", value: inv.bookingNo },
          ]}
        />
        <View style={[s.row, { marginBottom: 12 }]}>
          <InfoBox title="Billed to" style={{ marginRight: 8 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{inv.customer.name}</Text>
            <KV k="Mobile" v={formatPhone(inv.customer.mobile)} />
            <KV k="Address" v={inv.customer.address} />
            {isTax ? <KV k="GSTIN" v={inv.customer.gstin || "Unregistered"} /> : null}
            {isTax ? <KV k="State" v={stateWithCode(inv.customer.state)} /> : null}
          </InfoBox>
          <InfoBox title="Event details">
            <KV k="Event" v={inv.eventType} bold />
            <KV k="Date" v={formatDateRange(inv.eventFrom, inv.eventTo)} />
            <KV k="Venue" v={inv.venueName} />
            <KV k="Address" v={inv.eventAddress} />
            {isTax ? <KV k="Supply at" v={stateWithCode(inv.placeOfSupply)} /> : null}
          </InfoBox>
        </View>

        <TableHead cols={cols} />
        {inv.lines.map((l, i) => {
          const hasQty = l.qty != null && l.rate != null;
          const qty = hasQty ? `${formatNumber(l.qty!)}${l.unit && l.unit !== "venue" ? ` ${l.unit}` : ""}` : "";
          const rate = hasQty ? plain(l.rate!) : "";
          const days = hasQty && l.days ? String(l.days) : "";
          const cells = isTax
            ? [String(i + 1), l.description, l.hsn || "", qty, rate, days, plain(l.amount)]
            : [String(i + 1), l.description, qty, rate, days, plain(l.amount)];
          const sub = cols.map((_, ci) => (ci === 1 ? l.detail : undefined));
          return <TableRow key={i} cols={cols} cells={cells} index={i} sub={sub} />;
        })}
        <View style={{ height: 1, backgroundColor: C.brand, opacity: 0.35 }} />

        <View style={[s.row, { marginTop: 12 }]} wrap={false}>
          <View style={{ flex: 1, marginRight: 14 }}>
            <WordsBox amount={inv.total} />
            <BankBox settings={st} />
          </View>
          <View style={{ width: 225 }}>
            <TotalLine label="Sub total" value={money(inv.subtotal)} />
            {inv.discount > 0 ? <TotalLine label="Discount" value={`- ${money(inv.discount)}`} color={C.green} /> : null}
            {isTax ? <TotalLine label="Taxable value" value={money(inv.taxable)} strong /> : null}
            {isTax && !inv.interState ? <TotalLine label={`CGST @ ${half}%`} value={money(inv.cgst)} /> : null}
            {isTax && !inv.interState ? <TotalLine label={`SGST @ ${half}%`} value={money(inv.sgst)} /> : null}
            {isTax && inv.interState ? <TotalLine label={`IGST @ ${inv.gstRate}%`} value={money(inv.igst)} /> : null}
            {inv.roundOff ? (
              <TotalLine label="Round off" value={`${inv.roundOff > 0 ? "+ " : "- "}${money(Math.abs(inv.roundOff))}`} />
            ) : null}
            <TotalLine label="Grand total" value={money(inv.total)} highlight />
            <TotalLine label="Received" value={money(paid)} />
            <TotalLine label="Balance due" value={money(Math.max(0, balance))} strong color={balance > 0.004 ? C.red : C.green} />
          </View>
        </View>

        <View style={[s.row, { marginTop: 6, alignItems: "flex-end" }]} wrap={false}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <TermsBlock title="Terms & conditions" text={st.terms} />
          </View>
          <Signature name={st.name || "Business"} />
        </View>
      </A4>
    </Document>
  );
}

// ======================================================================= Booking slip / Delivery challan
function BookingSlipDoc({ b, st, variant }: { b: Booking; st: Settings; variant: "slip" | "challan" }) {
  const challan = variant === "challan";
  const t = totalsOf(b);
  const cols: Col[] = challan
    ? [
        { label: "#", width: 18 },
        { label: "Item" },
        { label: "Qty", width: 60, align: "right" },
        { label: "Unit", width: 46, align: "center" },
        { label: "Checked", width: 52, align: "center" },
        { label: "Remarks", width: 110 },
      ]
    : [
        { label: "#", width: 18 },
        { label: "Item / Service" },
        { label: "Qty", width: 54, align: "right" },
        { label: "Rate", width: 56, align: "right" },
        { label: "Days", width: 30, align: "center" },
        { label: "Amount", width: 74, align: "right" },
      ];
  const rows: { cells: string[]; sub?: (string | undefined)[] }[] = [];
  let idx = 0;
  if (!challan && b.venue) {
    rows.push({
      cells: [String(++idx), b.venue.name, "1", plain(b.venue.rate), String(b.venue.days), plain(b.venue.amount)],
      sub: [undefined, "Venue booking"],
    });
  }
  for (const it of b.items || []) {
    const q = challan ? Number(it.outQty ?? it.qty) : it.qty;
    rows.push({
      cells: challan
        ? [String(++idx), it.name, formatNumber(q), it.unit, "", ""]
        : [String(++idx), it.name, `${formatNumber(q)} ${it.unit}`, plain(it.rate), String(it.days), plain(it.amount)],
    });
  }
  if (!challan) {
    for (const c of [...(b.charges || []), ...(b.damageCharges || [])]) {
      rows.push({ cells: [String(++idx), c.label, "", "", "", plain(c.amount)] });
    }
  }
  const totalQty = (b.items || []).reduce((a, it) => a + Number(challan ? it.outQty ?? it.qty : it.qty), 0);
  const days = daysInclusive(b.fromDate, b.toDate);
  return (
    <Document title={`${challan ? "Delivery Challan" : "Booking Slip"} ${b.bookingNo}`} author={st.name}>
      <A4 footer={challan ? "Delivery challan - please check all items at the time of delivery." : "Booking slip - please keep this for your records."}>
        <Letterhead
          settings={st}
          title={challan ? "DELIVERY CHALLAN" : "BOOKING SLIP"}
          meta={[
            { label: "Booking No", value: b.bookingNo },
            { label: challan ? "Challan Date" : "Booked on", value: challan ? formatDate(b.outDate || todayYMD()) : formatTimestamp(b.createdAt) || formatDate(todayYMD()) },
            { label: "Status", value: STATUS_LABEL[b.status] },
          ]}
        />
        <View style={[s.row, { marginBottom: 12 }]}>
          <InfoBox title="Customer" style={{ marginRight: 8 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{b.customerName}</Text>
            <KV k="Mobile" v={formatPhone(b.customerMobile)} />
            <KV k="Address" v={b.customerAddress} />
          </InfoBox>
          <InfoBox title="Event details">
            <KV k="Event" v={b.eventType} bold />
            <KV k="Date" v={`${formatDateRange(b.fromDate, b.toDate)} (${days} day${days > 1 ? "s" : ""})`} />
            <KV k="Time" v={formatTime(b.eventTime)} />
            <KV k="Venue" v={b.venue?.name} />
            <KV k="Address" v={b.eventAddress} />
          </InfoBox>
        </View>

        {rows.length ? (
          <>
            <TableHead cols={cols} />
            {rows.map((r, i) => (
              <TableRow key={i} cols={cols} cells={r.cells} sub={r.sub} index={i} />
            ))}
            {challan ? (
              <TableTotalRow cols={cols} cells={["", "Total quantity", formatNumber(totalQty), "", "", ""]} />
            ) : (
              <View style={{ height: 1, backgroundColor: C.brand, opacity: 0.35 }} />
            )}
          </>
        ) : null}

        {!challan ? (
          <View style={[s.row, { marginTop: 12 }]} wrap={false}>
            <View style={{ flex: 1, marginRight: 14 }}>
              {b.notes ? (
                <View style={s.box}>
                  <Text style={s.sectionTitle}>Notes</Text>
                  <Text style={{ fontSize: 8 }}>{b.notes}</Text>
                </View>
              ) : null}
              <BankBox settings={st} />
            </View>
            <View style={{ width: 225 }}>
              <TotalLine label="Sub total" value={money(t.subtotal)} />
              {t.discount > 0 ? <TotalLine label="Discount" value={`- ${money(t.discount)}`} color={C.green} /> : null}
              {t.taxAmount > 0 ? <TotalLine label={`GST @ ${b.gstRate}%`} value={money(t.taxAmount)} /> : null}
              {t.roundOff ? (
                <TotalLine label="Round off" value={`${t.roundOff > 0 ? "+ " : "- "}${money(Math.abs(t.roundOff))}`} />
              ) : null}
              <TotalLine label={b.status === "cancelled" ? "Cancellation charge" : "Total"} value={money(payableOf(b))} highlight />
              <TotalLine label="Advance / received" value={money(b.paid)} />
              <TotalLine label="Balance" value={money(pendingOf(b))} strong color={pendingOf(b) > 0 ? C.red : C.green} />
            </View>
          </View>
        ) : b.notes ? (
          <View style={[s.box, { marginTop: 10 }]}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={{ fontSize: 8 }}>{b.notes}</Text>
          </View>
        ) : null}

        <View wrap={false}>
          <TermsBlock title={challan ? "Note" : "Booking terms"} text={challan ? "Received the above items in good condition.\nItems must be returned in the same condition; damage or loss will be charged." : st.bookingTerms} />
          <View style={[s.between, { marginTop: 18, alignItems: "flex-end" }]}>
            <SignLine label={challan ? "Received by (Customer)" : "Customer signature"} />
            <Signature name={st.name || "Business"} />
          </View>
        </View>
      </A4>
    </Document>
  );
}

// ======================================================================= Return slip
function ReturnSlipDoc({ b, st }: { b: Booking; st: Settings }) {
  const cols: Col[] = [
    { label: "#", width: 18 },
    { label: "Item" },
    { label: "Out", width: 52, align: "right" },
    { label: "Returned", width: 60, align: "right" },
    { label: "Damaged", width: 58, align: "right" },
    { label: "Missing", width: 56, align: "right" },
  ];
  const items = b.items || [];
  const sum = (f: (i: (typeof items)[number]) => number) => items.reduce((a, i) => a + (Number(f(i)) || 0), 0);
  const out = sum((i) => Number(i.outQty ?? i.qty));
  const ret = sum((i) => Number(i.returnedQty ?? 0));
  const dam = sum((i) => Number(i.damagedQty ?? 0));
  const mis = sum((i) => Number(i.missingQty ?? 0));
  const damageCharges = b.damageCharges || [];
  const damageTotal = damageCharges.reduce((a, c) => a + Number(c.amount || 0), 0);
  return (
    <Document title={`Return Slip ${b.bookingNo}`} author={st.name}>
      <A4 footer="Return slip - items received back from the customer.">
        <Letterhead
          settings={st}
          title="RETURN SLIP"
          meta={[
            { label: "Booking No", value: b.bookingNo },
            { label: "Return Date", value: formatDate(b.returnDate || todayYMD()) },
            { label: "Sent on", value: formatDate(b.outDate) || "-" },
          ]}
        />
        <View style={[s.row, { marginBottom: 12 }]}>
          <InfoBox title="Customer" style={{ marginRight: 8 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{b.customerName}</Text>
            <KV k="Mobile" v={formatPhone(b.customerMobile)} />
            <KV k="Address" v={b.customerAddress} />
          </InfoBox>
          <InfoBox title="Event details">
            <KV k="Event" v={b.eventType} bold />
            <KV k="Date" v={formatDateRange(b.fromDate, b.toDate)} />
            <KV k="Venue" v={b.venue?.name} />
            <KV k="Address" v={b.eventAddress} />
          </InfoBox>
        </View>
        <TableHead cols={cols} />
        {items.map((it, i) => (
          <TableRow
            key={i}
            cols={cols}
            index={i}
            cells={[
              String(i + 1),
              `${it.name} (${it.unit})`,
              formatNumber(Number(it.outQty ?? it.qty)),
              formatNumber(Number(it.returnedQty ?? 0)),
              formatNumber(Number(it.damagedQty ?? 0)),
              formatNumber(Number(it.missingQty ?? 0)),
            ]}
          />
        ))}
        <TableTotalRow cols={cols} cells={["", "Total", formatNumber(out), formatNumber(ret), formatNumber(dam), formatNumber(mis)]} />

        <View style={[s.row, { marginTop: 14 }]} wrap={false}>
          <View style={{ flex: 1, marginRight: 14 }}>
            {damageCharges.length ? (
              <View style={s.box}>
                <Text style={s.sectionTitle}>Damage / missing charges</Text>
                {damageCharges.map((c) => (
                  <View key={c.id} style={[s.between, { marginTop: 1.5 }]}>
                    <Text style={{ fontSize: 8, flex: 1 }}>{c.label}</Text>
                    <Text style={{ fontSize: 8, fontWeight: 600 }}>{money(c.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={s.box}>
                <Text style={{ fontSize: 8 }}>{dam || mis ? "No charge added for damaged / missing items." : "All items received back in good condition."}</Text>
              </View>
            )}
            {b.returnNote ? (
              <View style={[s.box, { marginTop: 8, backgroundColor: C.white }]}>
                <Text style={s.sectionTitle}>Note</Text>
                <Text style={{ fontSize: 8 }}>{b.returnNote}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ width: 225 }}>
            {damageTotal > 0 ? <TotalLine label="Damage charges" value={money(damageTotal)} /> : null}
            <TotalLine label="Booking total" value={money(b.total)} highlight />
            <TotalLine label="Received" value={money(b.paid)} />
            <TotalLine label="Balance" value={money(pendingOf(b))} strong color={pendingOf(b) > 0 ? C.red : C.green} />
          </View>
        </View>
        <View style={[s.between, { marginTop: 26, alignItems: "flex-end" }]} wrap={false}>
          <SignLine label="Customer signature" />
          <Signature name={st.name || "Business"} label="Received by" />
        </View>
      </A4>
    </Document>
  );
}

// ======================================================================= Receipt
function ReceiptDoc({ p, b, st }: { p: Payment; b?: Booking | null; st: Settings }) {
  const refund = p.type === "refund";
  return (
    <Document title={`Receipt ${p.receiptNo}`} author={st.name}>
      <A4 footer="This is a computer generated receipt.">
        <Letterhead
          settings={st}
          title={refund ? "REFUND RECEIPT" : "PAYMENT RECEIPT"}
          meta={[
            { label: "Receipt No", value: p.receiptNo },
            { label: "Date", value: formatDate(p.date) },
            { label: "Booking", value: p.bookingNo },
          ]}
        />
        <View style={[s.row, { alignItems: "stretch" }]}>
          <View style={[s.box, { flex: 1, marginRight: 10, backgroundColor: C.white, padding: 14 }]}>
            <Text style={[s.muted, { fontSize: 8 }]}>{refund ? "Refunded to" : "Received with thanks from"}</Text>
            <Text style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{p.customerName}</Text>
            <Text style={[s.muted, { fontSize: 8 }]}>Mobile: {formatPhone(p.customerMobile)}</Text>
            <View style={{ height: 10 }} />
            <Text style={[s.muted, { fontSize: 8 }]}>The sum of</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 600, marginTop: 1 }}>{amountInWords(p.amount)}</Text>
            <View style={{ height: 10 }} />
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>Payment mode</Text>
                <Text style={{ fontSize: 9, fontWeight: 600 }}>{PAYMENT_MODE_LABEL[p.mode]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>Type</Text>
                <Text style={{ fontSize: 9, fontWeight: 600 }}>{PAYMENT_TYPE_LABEL[p.type]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>Against booking</Text>
                <Text style={{ fontSize: 9, fontWeight: 600 }}>{p.bookingNo}</Text>
              </View>
            </View>
            {b ? (
              <Text style={[s.muted, { fontSize: 7.8, marginTop: 8 }]}>
                Event: {[b.eventType, formatDateRange(b.fromDate, b.toDate), b.venue?.name].filter(Boolean).join("  ·  ")}
              </Text>
            ) : null}
            {p.note ? <Text style={{ fontSize: 8, marginTop: 6 }}>Note: {p.note}</Text> : null}
          </View>
          <View
            style={{
              width: 170,
              backgroundColor: C.brand,
              borderRadius: 8,
              padding: 14,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#F3DDB0", fontSize: 8, letterSpacing: 1.2 }}>{refund ? "AMOUNT REFUNDED" : "AMOUNT RECEIVED"}</Text>
            <Text style={{ color: C.white, fontSize: 20, fontWeight: 700, marginTop: 6 }}>{formatINR(p.amount, { decimals: 2 })}</Text>
          </View>
        </View>
        {b ? (
          <View style={[s.row, { marginTop: 12 }]}>
            {[
              { label: "Booking total", value: money(b.total) },
              { label: "Total received", value: money(b.paid) },
              { label: "Balance due", value: money(pendingOf(b)) },
            ].map((x, i) => (
              <View key={x.label} style={[s.box, { flex: 1, marginRight: i < 2 ? 8 : 0 }]}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>{x.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, color: i === 2 && pendingOf(b) > 0 ? C.red : C.ink }}>{x.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 26 }]} wrap={false}>
          <Signature name={st.name || "Business"} />
        </View>
      </A4>
    </Document>
  );
}

// ======================================================================= Reports
function ReportTable({
  columns,
  rows,
  totals,
}: {
  columns: ReportSpec["columns"];
  rows: ReportSpec["rows"];
  totals?: ReportSpec["totals"];
}) {
  const cols: Col[] = columns.map((c) => ({ label: c.label, width: c.width, align: c.align }));
  if (!rows.length) {
    return (
      <View style={[s.box, { alignItems: "center", paddingVertical: 18 }]}>
        <Text style={s.muted}>No records for this period.</Text>
      </View>
    );
  }
  return (
    <View>
      <TableHead cols={cols} fixed />
      {rows.map((r, i) => (
        <TableRow key={i} cols={cols} index={i} cells={columns.map((c) => r[c.key] ?? "")} />
      ))}
      {totals ? <TableTotalRow cols={cols} cells={columns.map((c) => totals[c.key] ?? "")} /> : null}
    </View>
  );
}

function ReportDoc({ r, st }: { r: ReportSpec; st: Settings }) {
  return (
    <Document title={r.title} author={st.name}>
      <A4 landscape={r.orientation === "landscape"} footer={`${r.title}${r.period ? ` · ${r.period}` : ""}`}>
        <Letterhead
          settings={st}
          title={r.title.toUpperCase()}
          meta={[
            ...(r.period ? [{ label: "Period", value: r.period }] : []),
            { label: "Generated", value: formatDate(todayYMD()) },
          ]}
        />
        {r.summary?.length ? (
          <View style={[s.row, { flexWrap: "wrap", marginBottom: 10 }]}>
            {r.summary.map((x, i) => (
              <View
                key={i}
                style={[
                  s.box,
                  { width: `${100 / Math.min(4, r.summary!.length) - 1.5}%`, marginRight: "1.5%", marginBottom: 6 },
                ]}
              >
                <Text style={[s.muted, { fontSize: 7.2 }]}>{x.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, color: C.brand }}>{x.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {r.note ? <Text style={[s.muted, { fontSize: 7.5, marginBottom: 8 }]}>{r.note}</Text> : null}
        <ReportTable columns={r.columns} rows={r.rows} totals={r.totals} />
        {(r.sections || []).map((sec, i) => (
          <View key={i} style={{ marginTop: 16 }}>
            <Text style={[s.sectionTitle, { fontSize: 8 }]}>{sec.title}</Text>
            <ReportTable columns={sec.columns} rows={sec.rows} totals={sec.totals} />
          </View>
        ))}
      </A4>
    </Document>
  );
}

// ======================================================================= entry
export async function renderPdfBlob(job: PdfJob): Promise<Blob> {
  ensureFonts();
  let el;
  switch (job.kind) {
    case "invoice": {
      const paid = job.paid ?? job.invoice.paid;
      // The bill reconciles on its own: grand total of this invoice minus everything received so far.
      const balance = Math.round((job.invoice.total - paid) * 100) / 100;
      el = <InvoiceDoc inv={job.invoice} st={job.settings} paid={paid} balance={balance} />;
      break;
    }
    case "bookingSlip":
      el = <BookingSlipDoc b={job.booking} st={job.settings} variant={job.variant} />;
      break;
    case "returnSlip":
      el = <ReturnSlipDoc b={job.booking} st={job.settings} />;
      break;
    case "receipt":
      el = <ReceiptDoc p={job.payment} b={job.booking} st={job.settings} />;
      break;
    case "report":
      el = <ReportDoc r={job.report} st={job.settings} />;
      break;
  }
  return pdf(el).toBlob();
}

