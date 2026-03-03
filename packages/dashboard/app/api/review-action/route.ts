import { NextRequest, NextResponse } from 'next/server';
import { validateDashboardKey } from '@/lib/serverAuth';

type TargetState = 'opportunity_review' | 'drafting_queue' | 'ready_to_publish' | 'trash';

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const targetState = body?.targetState as TargetState | undefined;
  const contentIds = Array.isArray(body?.contentIds)
    ? body.contentIds.filter((value: unknown) => typeof value === 'string')
    : typeof body?.contentId === 'string'
      ? [body.contentId]
      : [];

  if (!targetState || !contentIds.length) {
    return NextResponse.json({ detail: 'Invalid review action request' }, { status: 400 });
  }

  const results = [];
  for (const contentId of contentIds) {
    const upstream = await fetch(`${baseUrl}/v1/content/${contentId}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': token,
      },
      body: JSON.stringify({
        target_state: targetState,
        actor: 'user',
        actor_label: 'dashboard-review',
      }),
      cache: 'no-store',
    });

    const text = await upstream.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { detail: text };
    }

    results.push({
      contentId,
      ok: upstream.ok,
      status: upstream.status,
      payload,
    });
  }

  const hasFailure = results.some((result) => !result.ok);
  return NextResponse.json(
    {
      targetState,
      results,
    },
    { status: hasFailure ? 207 : 200 },
  );
}
