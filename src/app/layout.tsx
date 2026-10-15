import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { isDemoMode } from '@/lib/db';

export const metadata: Metadata = {
  title: 'SageBase — RAG Knowledge Base',
  description:
    'Upload documents, chat with citations, and run evals. A Next.js + TypeScript + pgvector RAG starter.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Navbar />
        {isDemoMode && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
            Demo mode — no DATABASE_URL or GEMINI_API_KEY detected. Serving in-memory
            documents with mock answers.
          </div>
        )}
        <main>{children}</main>
        <footer className="mt-16 border-t border-slate-800">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500">
            SageBase — a RAG knowledge base starter. Next.js 14 · TypeScript ·
            PostgreSQL + pgvector.
          </div>
        </footer>
      </body>
    </html>
  );
}
