import { Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ComponentProps, ReactNode } from "react";
import { stateCode } from "../constants";
import { safeLogo } from "../image";
import type { Settings } from "../types";

// ---------- fonts ----------
let fontsReady = false;
export function ensureFonts() {
  if (fontsReady) return;
  const base = typeof window !== "undefined" ? window.location.origin : (process.env.PDF_FONT_BASE ?? "");
  Font.register({
    family: "Poppins",
    fonts: [
      { src: `${base}/fonts/Poppins-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/Poppins-Medium.ttf`, fontWeight: 500 },
      { src: `${base}/fonts/Poppins-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/fonts/Poppins-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Never break words with hyphens (names, item names, numbers)
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

// ---------- palette ----------
export const C = {
  brand: "#7A1F3D",
  brandDeep: "#4E0D22",
  gold: "#B7862C",
  goldSoft: "#F8EEDB",
  ink: "#1F1A1C",
  muted: "#6E6468",
  faint: "#9A9095",
  line: "#E7DED8",
  zebra: "#FBF8F5",
  panel: "#FAF6F2",
  white: "#FFFFFF",
  green: "#15803D",
  red: "#B91C1C",
};

export const s = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 8.5,
    color: C.ink,
    paddingTop: 30,
    paddingBottom: 54,
    paddingHorizontal: 34,
  },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: 600 },
  muted: { color: C.muted },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  sectionTitle: {
    fontSize: 7,
    fontWeight: 600,
    color: C.brand,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  box: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    padding: 9,
    backgroundColor: C.panel,
  },
});

// ---------- header ----------
export function Letterhead({
  settings,
  title,
  meta,
}: {
  settings: Settings;
  title: string;
  meta: { label: string; value: string }[];
}) {
  const addr = [settings.address, settings.city, settings.state, settings.pincode].filter(Boolean).join(", ");
  const phones = [settings.phone1, settings.phone2].filter(Boolean).join(" / ");
  return (
    <View>
      <View style={[s.row, { alignItems: "flex-start" }]}>
        {safeLogo(settings.logo) ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={safeLogo(settings.logo)!} style={{ width: 54, height: 54, objectFit: "contain", marginRight: 10 }} />
        ) : (
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              backgroundColor: C.brand,
              marginRight: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#F6E7C8", fontSize: 24, fontWeight: 600, marginTop: 2 }}>
              {(settings.name || "S").trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: 700, color: C.brand, letterSpacing: 0.3 }}>
            {settings.name || "Business"}
          </Text>
          {settings.tagline ? <Text style={{ fontSize: 7.5, color: C.gold, fontWeight: 500 }}>{settings.tagline}</Text> : null}
          {addr ? <Text style={[s.muted, { fontSize: 7.5, marginTop: 2 }]}>{addr}</Text> : null}
          {phones || settings.email ? (
            <Text style={[s.muted, { fontSize: 7.5 }]}>
              {[phones ? `Ph: ${phones}` : "", settings.email || ""].filter(Boolean).join("   ·   ")}
            </Text>
          ) : null}
          {settings.gstin ? (
            <Text style={{ fontSize: 7.5, marginTop: 1 }}>
              <Text style={s.bold}>GSTIN: </Text>
              {settings.gstin}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", minWidth: 150 }}>
          <Text style={{ fontSize: 13, fontWeight: 700, color: C.brand, letterSpacing: 1.6 }}>{title}</Text>
          <View style={{ marginTop: 5 }}>
            {meta.map((m) => (
              <View key={m.label} style={[s.row, { justifyContent: "flex-end", marginTop: 1 }]}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>{m.label}: </Text>
                <Text style={{ fontSize: 8, fontWeight: 600 }}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ height: 2, backgroundColor: C.brand, marginTop: 10 }} />
      <View style={{ height: 1, backgroundColor: C.gold, marginTop: 1.5, marginBottom: 12, opacity: 0.7 }} />
    </View>
  );
}

// ---------- info blocks ----------
type PdfStyle = Exclude<ComponentProps<typeof View>["style"], undefined | unknown[]>;

export function InfoBox({ title, children, style }: { title: string; children: ReactNode; style?: PdfStyle }) {
  return (
    <View style={style ? [s.box, { flex: 1 }, style] : [s.box, { flex: 1 }]}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function KV({ k, v, bold }: { k: string; v?: string | null; bold?: boolean }) {
  if (!v) return null;
  return (
    <View style={[s.row, { marginTop: 1.5 }]}>
      <Text style={[s.muted, { width: 62, fontSize: 7.5 }]}>{k}</Text>
      <Text style={[{ flex: 1, fontSize: 8 }, bold ? s.bold : {}]}>{v}</Text>
    </View>
  );
}

export function stateWithCode(state?: string): string {
  if (!state) return "";
  const code = stateCode(state);
  return code ? `${state} (${code})` : state;
}

// ---------- table ----------
export interface Col {
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
}

export function TableHead({ cols, fixed }: { cols: Col[]; fixed?: boolean }) {
  return (
    <View
      fixed={fixed}
      style={[
        s.row,
        {
          backgroundColor: C.brand,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          paddingVertical: 5,
          paddingHorizontal: 4,
        },
      ]}
    >
      {cols.map((c, i) => (
        <Text
          key={i}
          style={{
            color: C.white,
            fontSize: 7.2,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            paddingHorizontal: 3,
            ...(c.width ? { width: c.width } : { flex: 1 }),
            textAlign: c.align ?? "left",
          }}
        >
          {c.label}
        </Text>
      ))}
    </View>
  );
}

export function TableRow({
  cols,
  cells,
  index,
  bold,
  sub,
}: {
  cols: Col[];
  cells: (string | ReactNode)[];
  index: number;
  bold?: boolean;
  sub?: (string | undefined)[];
}) {
  return (
    <View
      wrap={false}
      style={[
        s.row,
        {
          paddingVertical: 4.5,
          paddingHorizontal: 4,
          backgroundColor: index % 2 ? C.zebra : C.white,
          borderBottomWidth: 0.6,
          borderBottomColor: C.line,
        },
      ]}
    >
      {cols.map((c, i) => (
        <View key={i} style={{ paddingHorizontal: 3, ...(c.width ? { width: c.width } : { flex: 1 }) }}>
          <Text style={{ fontSize: 8, textAlign: c.align ?? "left", fontWeight: bold ? 600 : 400 }}>{cells[i] as string}</Text>
          {sub?.[i] ? <Text style={{ fontSize: 6.8, color: C.muted, textAlign: c.align ?? "left" }}>{sub[i]}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function TableTotalRow({ cols, cells }: { cols: Col[]; cells: string[] }) {
  return (
    <View
      wrap={false}
      style={[
        s.row,
        {
          paddingVertical: 5,
          paddingHorizontal: 4,
          backgroundColor: C.goldSoft,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5,
        },
      ]}
    >
      {cols.map((c, i) => (
        <Text
          key={i}
          style={{
            paddingHorizontal: 3,
            fontSize: 8,
            fontWeight: 700,
            textAlign: c.align ?? "left",
            ...(c.width ? { width: c.width } : { flex: 1 }),
          }}
        >
          {cells[i] ?? ""}
        </Text>
      ))}
    </View>
  );
}

// ---------- totals ----------
export function TotalLine({
  label,
  value,
  strong,
  highlight,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  highlight?: boolean;
  color?: string;
}) {
  if (highlight) {
    return (
      <View
        style={[
          s.between,
          { backgroundColor: C.brand, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8, marginVertical: 3 },
        ]}
      >
        <Text style={{ color: C.white, fontWeight: 600, fontSize: 9 }}>{label}</Text>
        <Text style={{ color: C.white, fontWeight: 700, fontSize: 10.5 }}>{value}</Text>
      </View>
    );
  }
  return (
    <View style={[s.between, { paddingVertical: 2.2, paddingHorizontal: 8 }]}>
      <Text style={[{ fontSize: 8 }, strong ? s.bold : s.muted]}>{label}</Text>
      <Text style={[{ fontSize: 8.5 }, strong ? { fontWeight: 700 } : {}, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

export function TermsBlock({ title, text }: { title: string; text?: string }) {
  const lines = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {lines.map((l, i) => (
        <View key={i} style={[s.row, { marginTop: 1 }]}>
          <Text style={[s.muted, { width: 10, fontSize: 7.5 }]}>{i + 1}.</Text>
          <Text style={[s.muted, { flex: 1, fontSize: 7.5 }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export function Signature({ name, label = "Authorised Signatory" }: { name: string; label?: string }) {
  return (
    <View style={{ alignItems: "center", width: 170 }}>
      <Text style={{ fontSize: 7.5, fontWeight: 600 }}>For {name.toUpperCase()}</Text>
      <View style={{ height: 38 }} />
      <View style={{ width: 150, height: 0.8, backgroundColor: C.ink }} />
      <Text style={[s.muted, { fontSize: 7.2, marginTop: 3 }]}>{label}</Text>
    </View>
  );
}

export function SignLine({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", width: 170 }}>
      <View style={{ height: 49 }} />
      <View style={{ width: 150, height: 0.8, backgroundColor: C.ink }} />
      <Text style={[s.muted, { fontSize: 7.2, marginTop: 3 }]}>{label}</Text>
    </View>
  );
}

export function Footer({ note }: { note: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 22,
        left: 34,
        right: 34,
        borderTopWidth: 0.6,
        borderTopColor: C.line,
        paddingTop: 5,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 6.8, color: C.faint }}>{note}</Text>
      <Text
        style={{ fontSize: 6.8, color: C.faint }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

export function A4({
  children,
  landscape,
  footer,
}: {
  children: ReactNode;
  landscape?: boolean;
  footer: string;
}) {
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page}>
      {children}
      <Footer note={footer} />
    </Page>
  );
}
