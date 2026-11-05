"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/info/delivery", label: "Pickup & delivery" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ name }: { name: string }) {
  const path = usePathname();
  const { count, ready } = useCart();
  const [first, ...rest] = name.split(" ");
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand">
          {first} <span>{rest.join(" ")}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} className={l.href === "/info/delivery" ? "hide-sm" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/order" className="cart-link" aria-current={path === "/order" ? "page" : undefined}>
            Order
            <span className="cart-count" aria-label={`${ready ? count : 0} items`}>
              {ready ? count : 0}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
