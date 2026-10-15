/**
 * Extract plain text from a PDF buffer.
 *
 * pdf-parse evaluates files at import time, which breaks Next.js bundling, so
 * it is imported dynamically inside the function (and listed under
 * serverComponentsExternalPackages in next.config.mjs).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const pdfParse = (mod as unknown as { default: (b: Buffer) => Promise<{ text?: string }> }).default;
  const data = await pdfParse(buffer);
  return (data.text ?? '').trim();
}
