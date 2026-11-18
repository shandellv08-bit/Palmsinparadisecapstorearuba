"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Area } from "@/lib/engine";

type Counts = { notifications: number; inbox: number; tasks: number };

const GROUPS: { label: string; items: { area: Area; href: string; label: string; count?: keyof Counts }[] }[] = [
  {
    label: "Work",
    items: [
      { area: "dashboard", href: "/admin", label: "My work" },
      { area: "messages", href: "/admin/inbox", label: "Chat inbox", count: "inbox" },
      { area: "orders", href: "/admin/orders", label: "Orders" },
      { area: "tasks", href: "/admin/tasks", label: "Tasks", count: "tasks" },
      { area: "messages", href: "/admin/messages", label: "Contact form" },
      { area: "hours", href: "/admin/hours", label: "Hours" },
    ],
  },
  {
    label: "Store",
    items: [
      { area: "products", href: "/admin/products", label: "Products" },
      { area: "inventory", href: "/admin/inventory", label: "Stock & deliveries" },
      { area: "customers", href: "/admin/customers", label: "Customers" },
      { area: "purchasing", href: "/admin/purchasing", label: "Purchasing" },
    ],
  },
  {
    label: "Business",
    items: [
      { area: "finance", href: "/admin/finance", label: "Sales & margin" },
      { area: "finance", href: "/admin/expenses", label: "Expenses" },
      { area: "settings", href: "/admin/settings", label: "Store settings" },
      { area: "team", href: "/admin/team", label: "Team" },
    ],
  },
];

export function AdminNav({ areas, counts }: { areas: Area[]; counts: Counts }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const waiting = counts.inbox + counts.tasks;
  return (
    <>
    <button type="button" className="btn ghost small menu-toggle" aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen((o) => !o)}>
      {open ? "Close menu" : `Menu${waiting ? ` (${waiting})` : ""}`}
    </button>
    <nav id="admin-menu" aria-label="Dashboard" className={open ? "open" : undefined}>
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => areas.includes(i.area));
        if (!items.length) return null;
        return (
          <div key={g.label} className="nav-group">
            <p className="nav-label">{g.label}</p>
            <ul>
              {items.map((i) => {
                const current = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
                const n = i.count ? counts[i.count] : 0;
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={current ? "page" : undefined}>
                      {i.label}
                      {n ? <span className="pill" aria-label={`${n} waiting`}>{n}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <ul>
        <li>
          <Link href="/" target="_blank">
            View store ↗
          </Link>
        </li>
      </ul>
    </nav>
    </>
  );
}
