"use client";

import Link from "next/link";

export function NavLinks() {
  const links = [
    { label: "Problem", href: "#problem" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Demo", href: "/demo" },
    { label: "Architecture", href: "#architecture" },
  ];

  return (
    <nav
      aria-label="Main navigation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(20px, 3vw, 40px)",
      }}
    >
      {links.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="nav-text-link"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
