import { requireStaff } from "@/lib/auth";
import { roleCan } from "@/lib/engine";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  const staff = await requireStaff("products");
  return (
    <>
      <h1>New product</h1>
      <p className="muted">Create the product first, then add photos and stock on the next page.</p>
      <ProductForm showCost={roleCan(staff.role, "finance")} />
    </>
  );
}
