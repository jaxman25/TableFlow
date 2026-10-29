"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    label: "Service",
    links: [
      { href: "/admin", label: "Overview" },
      { href: "/staff", label: "Order queue" },
    ],
  },
  {
    label: "Restaurant",
    links: [
      { href: "/admin/menu", label: "Menu" },
      { href: "/admin/tables", label: "Tables & QR" },
      { href: "/admin/staff", label: "Staff" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Restaurant administration">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="admin-nav-label">{section.label}</p>
          {section.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
