import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, isDatabaseConfigured, isAiConfigured } from '@/lib/db';
import { deleteDemoDocument } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const prisma = getPrisma();
  const live = prisma !== null && isDatabaseConfigured && isAiConfigured;

  if (live) {
    // Belt and suspenders: the FK also cascades, but be explicit.
    await prisma.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${id}`;
    await prisma.document.delete({ where: { id } }).catch(() => null);
  } else {
    deleteDemoDocument(id);
  }

  return NextResponse.json({ ok: true });
}
