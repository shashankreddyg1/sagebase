import { answerWithCitations, type RagSource } from './rag';

/**
 * Mini eval harness. Five canned questions run through the same
 * answerWithCitations pipeline the chat UI uses, then each answer is scored
 * with transparent heuristics:
 *
 *   keywordRecall    — fraction of expected keywords present in the answer
 *   citationCoverage — fraction of (up to 3) retrieved sources actually cited
 *   score            — 0.5 * keywordRecall + 0.5 * citationCoverage
 *
 * These are HEURISTIC DEMO evals. They catch regressions (e.g. citations
 * silently disappearing) but are not a substitute for human or LLM-as-judge
 * evaluation.
 */

export interface EvalCase {
  id: string;
  question: string;
  expectedKeywords: string[];
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'chunking',
    question: 'How does SageBase chunk uploaded documents?',
    expectedKeywords: ['800', '100', 'overlap', 'characters'],
  },
  {
    id: 'embeddings',
    question: 'Which embedding model does SageBase use and what is its dimension?',
    expectedKeywords: ['text-embedding-004', '768'],
  },
  {
    id: 'refunds',
    question: 'What is the refund window for annual plans?',
    expectedKeywords: ['30', 'days', 'annual'],
  },
  {
    id: 'citations',
    question: 'How are citations shown in answers?',
    expectedKeywords: ['inline', 'citation'],
  },
  {
    id: 'retrieval',
    question: 'How does SageBase find relevant chunks for a question?',
    expectedKeywords: ['cosine', 'similarity', 'top 5'],
  },
];

export interface EvalResult {
  caseId: string;
  question: string;
  answer: string;
  sourcesUsed: number;
  keywordRecall: number;
  citationCoverage: number;
  score: number;
  passed: boolean;
  demo: boolean;
}

export interface EvalRun {
  ranAt: string;
  demo: boolean;
  averageScore: number;
  results: EvalResult[];
}

function extractCitations(answer: string, sourceCount: number): Set<number> {
  const cited = new Set<number>();
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= sourceCount) cited.add(n);
  }
  return cited;
}

export function scoreEvalCase(
  c: EvalCase,
  answer: string,
  sources: RagSource[],
  demo: boolean,
): EvalResult {
  const lower = answer.toLowerCase();
  const hits = c.expectedKeywords.filter((k) => lower.includes(k.toLowerCase())).length;
  const keywordRecall = c.expectedKeywords.length > 0 ? hits / c.expectedKeywords.length : 1;

  const denom = Math.max(1, Math.min(sources.length, 3));
  const citationCoverage =
    sources.length === 0 ? 0 : extractCitations(answer, sources.length).size / denom;

  const score = 0.5 * keywordRecall + 0.5 * citationCoverage;

  return {
    caseId: c.id,
    question: c.question,
    answer,
    sourcesUsed: sources.length,
    keywordRecall,
    citationCoverage,
    score,
    passed: score >= 0.6,
    demo,
  };
}

let lastRun: EvalRun | null = null;

export function getLastEvalRun(): EvalRun | null {
  return lastRun;
}

export async function runAllEvals(): Promise<EvalRun> {
  const results: EvalResult[] = [];
  for (const c of EVAL_CASES) {
    const { answer, sources, demo } = await answerWithCitations(c.question);
    results.push(scoreEvalCase(c, answer, sources, demo));
  }
  const averageScore = results.reduce((s, r) => s + r.score, 0) / (results.length || 1);
  lastRun = {
    ranAt: new Date().toISOString(),
    demo: results[0]?.demo ?? true,
    averageScore,
    results,
  };
  return lastRun;
}
