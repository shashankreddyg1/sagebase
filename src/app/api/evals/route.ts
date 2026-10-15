import { NextResponse } from 'next/server';
import { EVAL_CASES, getLastEvalRun } from '@/lib/evals';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ cases: EVAL_CASES, lastRun: getLastEvalRun() });
}
