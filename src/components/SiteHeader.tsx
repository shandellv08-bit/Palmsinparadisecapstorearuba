"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useCart } from "./cart";
import { BagIcon, MenuIcon, SearchIcon } from "./icons";
import { Sheet } from "./Sheet";
import { Wordmark } from "./Wordmark";

export interface NavData {
  name: string;
  styles: { name: string; count: number }[];
  teams: { name: string; count: number }[];
}

const q = (k: string, v: string) => `/shop?${new URLSearchParams({ [k]: v })}`;

export function SiteHeader(props: NavData) {
  return (
    <Suspense fallback={<HeaderInner {...props} active="" />}>
      <WithParams {...props} />
    </Suspense>
  );
}

function WithParams(props: NavData) {
  const path = usePathname();
  const params = useSearchParams();
  const active = path === "/shop" ? params.toString() : path;
  return <HeaderInner {...props} active={active} />;
}

function HeaderInner({ name, styles, teams, active }: NavData & { active: string }) {
  const { count, ready, openBag } = useCart();
  const [menu, setMenu] = useState(false);
  const teamsRef = useRef<HTMLDetailsElement>(null);
  const path = usePathname();

  // close menus when the page changes
  useEffect(() => {
    setMenu(false);
    if (teamsRef.current) teamsRef.current.open = false;
  }, [path, active]);

  // close the team menu on outside click or Escape
  useEffect(() => {
    const close = (e: Event) => {
      const d = teamsRef.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const isActive = (href: string) => {
    const query = href.split("?")[1] ?? "";
    return query ? active === query : active === href;
  };

  const links = [
    { href: q("sort", "newest"), label: "New arrivals" },
    ...styles.slice(0, 4).map((s) => ({ href: q("style", s.name), label: s.name })),
    { href: "/shop", label: "All caps" },
  ];

  return (
    <header className="store-header">
      <div className="wrap bar">
        <div className="row" style={{ gap: ".25rem" }}>
          <button type="button" className="icon-btn only-mobile" aria-label="Menu" aria-haspopup="dialog" onClick={() => setMenu(true)}>
            <MenuIcon />
          </button>
          <Wordmark name={name} />
        </div>
        <form action="/shop" role="search" className="header-search only-desktop">
          <SearchIcon />
          <label htmlFor="hq" className="sr-only">
            Search caps
          </label>
          <input id="hq" name="q" type="search" placeholder="Search teams, styles, colours" />
        </form>
        <div className="header-tools">
          <Link href="/shop?focus=search" className="icon-btn only-mobile" aria-label="Search">
            <SearchIcon />
          </Link>
          <button type="button" className="icon-btn" onClick={openBag} aria-haspopup="dialog" aria-label={`Bag, ${ready ? count : 0} items`}>
            <BagIcon />
            {ready && count > 0 ? <span className="count" aria-hidden="true">{count}</span> : null}
          </button>
        </div>
      </div>
      <nav className="store-nav only-desktop" aria-label="Shop">
        <div className="wrap">
          {links.slice(0, -1).map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          {teams.length ? (
            <details ref={teamsRef}>
              <summary>Teams</summary>
              <div className="mega">
                <div className="wrap">
                  <p className="title">Shop by team</p>
                  <div className="cols">
                    {teams.map((t) => (
                      <Link key={t.name} href={q("team", t.name)}>
                        {t.name} <span>{t.count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ) : null}
          <Link href="/shop" aria-current={isActive("/shop") ? "page" : undefined}>
            All caps
          </Link>
          <Link href="/info/size-guide" aria-current={isActive("/info/size-guide") ? "page" : undefined}>
            Size guide
          </Link>
          <Link href="/contact" style={{ marginLeft: "auto" }} aria-current={isActive("/contact") ? "page" : undefined}>
            Contact
          </Link>
        </div>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} side="left" title="Menu">
        <form action="/shop" role="search" className="header-search" style={{ maxWidth: "none", marginBottom: "1rem" }}>
          <SearchIcon />
          <label htmlFor="mq" className="sr-only">
            Search caps
          </label>
          <input id="mq" name="q" type="search" placeholder="Search caps" />
        </form>
        <ul className="menu-list">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label} <span aria-hidden="true">›</span></Link>
            </li>
          ))}
          <li>
            <Link href="/info/size-guide">Size guide <span aria-hidden="true">›</span></Link>
          </li>
        </ul>
        {teams.length ? (
          <div className="menu-group">
            <p className="eyebrow">Shop by team</p>
            <ul className="menu-list sub">
              {teams.map((t) => (
                <li key={t.name}>
                  <Link href={q("team", t.name)}>
                    {t.name} <span className="small muted">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="menu-group">
          <ul className="menu-list sub">
            <li><Link href="/info/delivery">Pickup &amp; delivery</Link></li>
            <li><Link href="/info/returns">Returns</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
      </Sheet>
    </header>
  );
}
