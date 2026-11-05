"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Area } from "@/lib/engine";

const ITEMS: { area: Area; href: string; label: string }[] = [
  { area: "dashboard", href: "/admin", label: "Overview" },
  { area: "orders", href: "/admin/orders", label: "Orders" },
  { area: "products", href: "/admin/products", label: "Products" },
  { area: "inventory", href: "/admin/inventory", label: "Stock" },
  { area: "customers", href: "/admin/customers", label: "Customers" },
  { area: "messages", href: "/admin/messages", label: "Messages" },
  { area: "finance", href: "/admin/finance", label: "Sales & margin" },
  { area: "settings", href: "/admin/settings", label: "Store settings" },
  { area: "team", href: "/admin/team", label: "Team" },
];

export function AdminNav({ areas }: { areas: Area[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard">
      <ul>
        {ITEMS.filter((i) => areas.includes(i.area)).map((i) => {
          const current = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={current ? "page" : undefined}>
                {i.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/" target="_blank">
            View store
          </Link>
        </li>
      </ul>
    </nav>
  );
}
