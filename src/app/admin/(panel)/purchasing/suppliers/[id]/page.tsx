import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { SupplierForm, type Supplier } from "../../SupplierForm";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("purchasing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await supabaseServer();
  const { data } = await sb.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <p className="small"><Link href="/admin/purchasing">Purchasing</Link> / {data.name}</p>
      <h1>{data.name}</h1>
      <SupplierForm s={data as Supplier} />
    </>
  );
}
