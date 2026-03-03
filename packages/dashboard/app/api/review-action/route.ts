import { NextRequest, NextResponse } from 'next/server';

type ActionType =
  | 'move_ingested_to_opportunity_review'
  | 'move_ingested_to_drafting'
  | 'move_to_drafting'
  | 'move_to_ready';

const ACTION_PATHS: Record<ActionType, (contentId: string) => string> = {
  move_ingested_to_opportunity_review: (contentId) =>
    `/v1/queues/ingested/${contentId}/move-to-opportunity-review`,
  move_ingested_to_drafting: (contentId) => `/v1/queues/ingested/${contentId}/move-to-drafting`,
  move_to_drafting: (contentId) => `/v1/queues/opportunity-review/${contentId}/move-to-drafting`,
  move_to_ready: (contentId) => `/v1/queues/approval-review/${contentId}/move-to-ready`,
};

export async function POST(req: NextRequest) {
  const baseUrl = process.env.DB_API_BASE_URL || 'http://127.0.0.1:8000';
  const token = process.env.DB_API_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { detail: 'Missing DB_API_SERVICE_TOKEN in dashboard env' },
      { status: 500 },
    );
  }

  const body = await req.json();
  const action = body?.action as ActionType;
  const contentId = body?.contentId as string | undefined;

  if (!action || !ACTION_PATHS[action] || !contentId) {
    return NextResponse.json({ detail: 'Invalid review action request' }, { status: 400 });
  }

  const upstream = await fetch(`${baseUrl}${ACTION_PATHS[action](contentId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': token,
    },
    body: JSON.stringify({
      actor: 'user',
      actor_label: 'dashboard-review',
    }),
    cache: 'no-store',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
