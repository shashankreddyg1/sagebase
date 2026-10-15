import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/library', label: 'Library' },
  { href: '/chat', label: 'Chat' },
  { href: '/evals', label: 'Evals' },
];

export default function Navbar() {
  return (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-emerald-400">Sage</span>Base
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
