import { NextResponse } from 'next/server';
import { runAllEvals } from '@/lib/evals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    const run = await runAllEvals();
    return NextResponse.json(run);
  } catch (err) {
    console.error('Eval run failed:', err);
    return NextResponse.json({ error: 'Eval run failed. Check server logs.' }, { status: 500 });
  }
}
