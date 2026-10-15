import { NextRequest, NextResponse } from 'next/server';
import { answerWithCitations } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let question = '';
  try {
    const body = (await req.json()) as { question?: unknown };
    if (typeof body.question === 'string') {
      question = body.question.trim();
    }
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: 'Provide a "question" string.' }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question is too long (max 2000 characters).' }, { status: 400 });
  }

  try {
    const { answer, sources, demo } = await answerWithCitations(question);
    return NextResponse.json({ answer, sources, demo });
  } catch (err) {
    console.error('Chat failed:', err);
    return NextResponse.json(
      { error: 'Answering failed. Check server logs and API configuration.' },
      { status: 500 },
    );
  }
}
