import { NextRequest, NextResponse } from 'next/server';
import { validateDashboardKey } from '@/lib/serverAuth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { contentId: string } },
) {
  const auth = validateDashboardKey(req);
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.message }, { status: 401 });
  }

  const baseUrl = process.env.DB_API_BASE_URL || 'http://127.0.0.1:8000';
  const token = process.env.DB_API_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { detail: 'Missing Password in dashboard env' },
      { status: 500 },
    );
  }

  const upstream = await fetch(`${baseUrl}/v1/content/${params.contentId}`, {
    method: 'DELETE',
    headers: {
      'X-API-Key': token,
    },
    cache: 'no-store',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
