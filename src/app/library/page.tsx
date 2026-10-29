'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import FadeIn from '@/components/FadeIn';

interface DocItem {
  id: string;
  name: string;
  mimeType: string;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  createdAt: string;
  chunkCount: number;
}

function StatusBadge({ status }: { status: DocItem['status'] }) {
  const styles: Record<DocItem['status'], string> = {
    READY: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    PROCESSING: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    FAILED: 'border-red-500/30 bg-red-500/15 text-red-300',
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [demo, setDemo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = (await res.json()) as { demo?: boolean; documents?: DocItem[] };
      setDocs(data.documents ?? []);
      setDemo(Boolean(data.demo));
    } catch {
      setError('Could not load documents.');
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const uploadFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
      await fetchDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void uploadFile(f);
  };

  const remove = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    await fetchDocs();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <FadeIn className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Library</h1>
          <p className="mt-1 text-slate-400">
            Upload PDFs, .txt, or Markdown files. They are chunked, embedded, and indexed
            for chat.
          </p>
        </div>
        {demo && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
            demo storage
          </span>
        )}
      </FadeIn>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = '';
          }}
        />
        <p className="text-lg font-medium">
          {uploading ? 'Processing upload…' : 'Drop a file here, or click to browse'}
        </p>
        <p className="mt-1 text-sm text-slate-500">PDF, .txt, .md — up to a few MB works best</p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-8 space-y-3">
        {docs.length === 0 && (
          <p className="text-slate-500">No documents yet. Upload one to get started.</p>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{d.name}</p>
              <p className="text-xs text-slate-500">
                {d.mimeType} · {d.chunkCount} chunks ·{' '}
                {new Date(d.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge status={d.status} />
              <button
                onClick={() => void remove(d.id)}
                className="rounded-md px-2 py-1 text-sm text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
