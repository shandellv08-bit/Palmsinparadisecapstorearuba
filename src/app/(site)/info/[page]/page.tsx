import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/catalog";
import { formatMoney, orNotSet } from "@/lib/engine";
import type { Settings } from "@/lib/settings";
import { HowToMeasure, SizeTable } from "@/components/store/SizeGuide";

const PAGES: Record<string, { title: string; body: (s: Settings) => React.ReactNode }> = {
  "size-guide": {
    title: "Size guide",
    body: () => (
      <div style={{ maxWidth: 560 }}>
        <p>Fitted caps are sized by head measurement. Snapback and adjustable caps fit most heads.</p>
        <h2>How to measure</h2>
        <HowToMeasure />
        <h2>Fitted sizes</h2>
        <SizeTable />
        <p className="small muted">Measurements are calculated from the cap size. If you are between two sizes, ask us before ordering.</p>
      </div>
    ),
  },
  about: { title: "About", body: (s) => <p className="prose">{orNotSet(s.about)}</p> },
  returns: { title: "Returns", body: (s) => <p className="prose">{orNotSet(s.returns_policy)}</p> },
  privacy: { title: "Privacy", body: (s) => <p className="prose">{orNotSet(s.privacy_policy)}</p> },
  terms: { title: "Terms", body: (s) => <p className="prose">{orNotSet(s.terms)}</p> },
  delivery: {
    title: "Pickup & delivery",
    body: (s) => (
      <>
        <h2>Pickup</h2>
        {s.pickup_enabled ? (
          <>
            <p className="prose">{orNotSet(s.pickup_instructions)}</p>
            <p>Address: {orNotSet(s.address)}</p>
            <p className="prose">Opening hours: {orNotSet(s.opening_hours)}</p>
          </>
        ) : (
          <p>Pickup is not available right now.</p>
        )}
        <h2>Delivery</h2>
        {s.delivery_enabled && s.delivery_fee_cents !== null ? (
          <>
            <p>Fee: {formatMoney(s.delivery_fee_cents, s.currency)}</p>
            {s.free_delivery_threshold_cents !== null ? (
              <p>Free on orders from {formatMoney(s.free_delivery_threshold_cents, s.currency)}.</p>
            ) : null}
            <p className="prose">Areas: {orNotSet(s.delivery_areas)}</p>
          </>
        ) : (
          <p>Delivery is not available right now.</p>
        )}
      </>
    ),
  },
};

type Props = { params: Promise<{ page: string }> };

export function generateStaticParams() {
  return Object.keys(PAGES).map((page) => ({ page }));
}
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: PAGES[(await params).page]?.title ?? "Not found" };
}

export default async function InfoPage({ params }: Props) {
  const page = PAGES[(await params).page];
  if (!page) notFound();
  const s = await getSettings();
  return (
    <div className="wrap page-pad">
      <h1>{page.title}</h1>
      {page.body(s)}
    </div>
  );
}
