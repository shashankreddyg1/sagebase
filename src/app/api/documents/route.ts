import { NextResponse } from 'next/server';
import { getPrisma, isDatabaseConfigured, isOpenAiConfigured } from '@/lib/db';
import { listDemoDocuments } from '@/lib/demo';

export const dynamic = 'force-dynamic';

interface CountRow {
  document_id: string;
  chunk_count: number;
}

export async function GET() {
  const prisma = getPrisma();
  const live = prisma !== null && isDatabaseConfigured && isOpenAiConfigured;

  if (!live) {
    return NextResponse.json({ demo: true, documents: listDemoDocuments() });
  }

  const docs = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
  const counts = await prisma.$queryRaw<CountRow[]>`
    SELECT document_id, COUNT(*)::int AS chunk_count
    FROM document_chunks
    GROUP BY document_id`;
  const byId = new Map(counts.map((c) => [String(c.document_id), Number(c.chunk_count)]));

  return NextResponse.json({
    demo: false,
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      mimeType: d.mimeType,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      chunkCount: byId.get(d.id) ?? 0,
    })),
  });
}
