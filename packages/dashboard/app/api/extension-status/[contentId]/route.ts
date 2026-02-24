import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { contentId: string } },
) {
  const baseUrl = process.env.NEXT_PUBLIC_DB_API_BASE_URL || 'http://127.0.0.1:8000';
  const token = process.env.DB_API_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { detail: 'Missing DB_API_SERVICE_TOKEN in dashboard env' },
      { status: 500 },
    );
  }

  const payload = await req.text();

  const upstream = await fetch(`${baseUrl}/v1/extension/tasks/${params.contentId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': token,
    },
    body: payload,
    cache: 'no-store',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
