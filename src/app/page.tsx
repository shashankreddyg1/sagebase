import Link from 'next/link';

const STEPS = [
  {
    n: '1',
    title: 'Upload',
    body: 'Drop in PDFs, .txt, or Markdown. Text is extracted automatically — no manual preprocessing.',
  },
  {
    n: '2',
    title: 'Chunk & embed',
    body: 'Documents are split into ~800-character chunks (100-char overlap) and embedded with text-embedding-004.',
  },
  {
    n: '3',
    title: 'Retrieve',
    body: 'Your question is embedded the same way; pgvector returns the top 5 chunks by cosine similarity.',
  },
  {
    n: '4',
    title: 'Answer with citations',
    body: 'The LLM answers using only the retrieved context, with clickable [1][2] markers on every claim.',
  },
];

const STACK = [
  'Next.js 14',
  'TypeScript',
  'PostgreSQL',
  'pgvector',
  'OpenAI embeddings',
  'Prisma',
  'Tailwind CSS',
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm text-emerald-300">
          Retrieval-Augmented Generation starter
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold tracking-tight">
          Chat with your documents. <span className="text-emerald-400">Cite every answer.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          SageBase ingests PDFs and text files into a pgvector-backed knowledge base, retrieves
          the most relevant chunks for each question, and answers with inline citations you can
          inspect — then scores itself on the Evals dashboard.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/library"
            className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Upload documents
          </Link>
          <Link
            href="/chat"
            className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Try the chat
          </Link>
        </div>
      </section>

      <section className="py-10">
        <h2 className="mb-8 text-center text-2xl font-bold">How it works</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 font-bold text-emerald-300">
                {s.n}
              </div>
              <h3 className="mb-2 font-semibold">{s.title}</h3>
              <p className="text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 text-center">
        <h2 className="mb-6 text-2xl font-bold">Built with</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {STACK.map((t) => (
            <span
              key={t}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-sm text-slate-300"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-sm text-slate-500">
          Without a database or API key, SageBase runs in demo mode: two realistic seed
          documents, keyword-based retrieval, and clearly-labeled mock answers — so the full
          UI works out of the box.
        </p>
      </section>
    </div>
  );
}
