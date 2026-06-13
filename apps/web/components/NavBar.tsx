"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#send", label: "Send" },
  { href: "/#receive", label: "Receive" },
  { href: "/wallet/transactions", label: "History" },
  { href: "/wallet/price", label: "Price" },
];

export default function NavBar() {
  const router = useRouter();
  const { user, token, logout, loading } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (loading) {
    return <header className="sticky top-0 z-10 h-12 bg-stone-50/95 backdrop-blur border-b border-stone-100" />;
  }

  return (
    <header className="sticky top-0 z-10 bg-stone-50/95 backdrop-blur border-b border-stone-100">
      <div className="max-w-lg sm:max-w-2xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
        <a href="/" className="text-sm font-semibold text-stone-800 shrink-0">
          ⚡ Altradits
        </a>

        {token ? (
          <nav className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-xs font-medium text-stone-500">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="shrink-0 hover:text-stone-800 transition-colors"
              >
                {link.label}
              </a>
            ))}
            {user?.is_admin && (
              <a
                href="/admin"
                className="shrink-0 text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                Admin
              </a>
            )}
            {user?.is_admin && (
              <a
                href="/trader"
                className="shrink-0 text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                Trader
              </a>
            )}
            {user?.is_admin && (
              <a
                href="/liquidity"
                className="shrink-0 text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                Liquidity
              </a>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 text-stone-400 hover:text-stone-600 transition-colors"
            >
              Log out
            </button>
          </nav>
        ) : (
          <nav className="flex items-center gap-3 text-xs font-medium">
            <a href="/login" className="text-stone-500 hover:text-stone-800 transition-colors">
              Sign in
            </a>
            <a
              href="/register"
              className="text-white bg-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create account
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}
