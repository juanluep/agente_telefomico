"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Calendar,
  Gear,
  Gauge,
  List,
  Phone,
  PlugsConnected,
  SignOut,
  UserCircle,
  Users,
  X,
} from "@phosphor-icons/react";

import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/panel", label: "Panel", icon: Gauge },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/conversaciones", label: "Conversaciones", icon: Phone },
  { href: "/estudio", label: "Ajustes del Agente", icon: Gear },
  { href: "/conexiones", label: "Conexiones", icon: PlugsConnected },
];

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = businessName?.[0]?.toUpperCase() ?? "·";

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* botón móvil */}
      <button
        type="button"
        className="md:hidden fixed top-3 left-3 z-50 btn btn-secondary btn-sm"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <List size={18} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed md:sticky top-0 z-50 md:z-auto h-screen w-64 shrink-0 bg-surface-0 border-r border-surface-200
          flex flex-col transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-200">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-600 text-white font-semibold">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{businessName}</p>
              <p className="text-xs text-surface-700">VoiceOps</p>
            </div>
          </div>
          <button className="md:hidden btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700 dark:text-brand-500"
                    : "text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-200"
                }`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-brand-600" />}
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-surface-200 space-y-1">
          <Link
            href="/perfil"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              isActive("/perfil") ? "bg-brand-50 text-brand-700 dark:text-brand-500" : "text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-200"
            }`}
          >
            <UserCircle size={18} /> Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-200">
            <button type="submit" className="flex items-center gap-3 w-full">
              <SignOut size={18} /> Cerrar sesión
            </button>
          </form>
          <div className="pt-1"><ThemeToggle /></div>
        </div>
      </aside>
    </>
  );
}