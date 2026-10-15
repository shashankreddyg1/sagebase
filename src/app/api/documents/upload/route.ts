import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPrisma, isDatabaseConfigured, isOpenAiConfigured } from '@/lib/db';
import { chunkText } from '@/lib/chunk';
import { extractPdfText } from '@/lib/pdf';
import { embedTexts } from '@/lib/embeddings';
import { addDemoDocument } from '@/lib/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EXT = new Set(['pdf', 'txt', 'md', 'markdown']);

export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get('file');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: 'Could not parse the multipart upload.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file field named "file" was uploaded.' }, { status: 400 });
  }

  const name = file.name || 'upload';
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Upload a PDF, .txt, or .md file.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';
  try {
    text = ext === 'pdf' ? await extractPdfText(buffer) : buffer.toString('utf-8');
  } catch {
    return NextResponse.json({ error: 'Failed to extract text from the file.' }, { status: 500 });
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'No extractable text found in the file.' }, { status: 400 });
  }

  const prisma = getPrisma();
  const live = prisma !== null && isDatabaseConfigured && isOpenAiConfigured;

  if (!live) {
    const doc = addDemoDocument({ name, mimeType: file.type || `text/${ext}`, text });
    return NextResponse.json({
      demo: true,
      note: 'Demo mode: document stored ephemerally in memory (no DATABASE_URL / OPENAI_API_KEY).',
      document: {
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        status: doc.status,
        createdAt: doc.createdAt,
        chunkCount: doc.chunks.length,
      },
    });
  }

  // Live path: persist the document, embed its chunks, store vectors.
  const doc = await prisma.document.create({
    data: { name, mimeType: file.type || `text/${ext}`, status: 'PROCESSING' },
  });

  try {
    const vectors = await embedTexts(chunks.map((c) => c.content));
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = vectors[i];
      if (!chunk || !vector) continue;
      const vectorLiteral = `[${vector.join(',')}]`;
      await prisma.$executeRaw`
        INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
        VALUES (${randomUUID()}, ${doc.id}, ${chunk.index}, ${chunk.content}, ${vectorLiteral}::vector)`;
    }
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'READY' },
    });
    return NextResponse.json({
      demo: false,
      document: {
        id: updated.id,
        name: updated.name,
        mimeType: updated.mimeType,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        chunkCount: chunks.length,
      },
    });
  } catch (err) {
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'FAILED' } }).catch(() => null);
    console.error('Upload pipeline failed:', err);
    return NextResponse.json({ error: 'Processing failed while embedding chunks.' }, { status: 500 });
  }
}
