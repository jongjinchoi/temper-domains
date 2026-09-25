import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const dynamic = 'force-static';
export function GET() {
  return new Response(readFileSync(resolve(process.cwd(), '../THIRD_PARTY_NOTICES.md'), 'utf8'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
