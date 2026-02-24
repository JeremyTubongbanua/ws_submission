import { NextRequest, NextResponse } from 'next/server';
import type { QueueView } from '@/lib/types';

const VALID_VIEWS = new Set<QueueView>([
  'ingested',
  'opportunity_review',
  'drafting_queue',
  'approval_review',
  'ready_to_publish',
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { view: string } },
) {
  if (!VALID_VIEWS.has(params.view as QueueView)) {
    return NextResponse.json({ detail: 'Invalid view' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_DB_API_BASE_URL || 'http://127.0.0.1:8000';
  const token = process.env.DB_API_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { detail: 'Missing DB_API_SERVICE_TOKEN in dashboard env' },
      { status: 500 },
    );
  }

  const limit = req.nextUrl.searchParams.get('limit') ?? '50';
  const offset = req.nextUrl.searchParams.get('offset') ?? '0';

  const upstream = await fetch(
    `${baseUrl}/v1/views/${params.view}?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    {
      headers: {
        'X-API-Key': token,
      },
      cache: 'no-store',
    },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
