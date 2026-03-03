import type { NextRequest } from 'next/server';

export function validateDashboardKey(req: NextRequest): { ok: true } | { ok: false; message: string } {
  const expected = process.env.DB_API_SERVICE_TOKEN;
  if (!expected) {
    return { ok: false, message: 'Missing Password in dashboard env' };
  }

  const provided = req.headers.get('x-dashboard-key');
  if (!provided || provided !== expected) {
    return { ok: false, message: 'Unauthorized' };
  }

  return { ok: true };
}
