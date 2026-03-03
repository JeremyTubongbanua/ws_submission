import { NextRequest, NextResponse } from 'next/server';
import type { ActorId } from '@/lib/actors';

const AGENT_BASE_URLS: Record<ActorId, string> = {
  scraper_daemon: process.env.SCRAPER_DAEMON_BASE_URL || 'http://127.0.0.1:8001',
  filter_agent: process.env.FILTER_AGENT_BASE_URL || 'http://127.0.0.1:8002',
  comment_agent: process.env.COMMENT_AGENT_BASE_URL || 'http://127.0.0.1:8003',
};

export async function POST(
  req: NextRequest,
  { params }: { params: { agent: string } },
) {
  const agent = params.agent as ActorId;
  const baseUrl = AGENT_BASE_URLS[agent];
  if (!baseUrl) {
    return NextResponse.json({ detail: 'Unknown agent' }, { status: 400 });
  }

  const payload = await req.text();
  const upstream = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload || JSON.stringify({ cycles: 5, limit: 1 }),
    cache: 'no-store',
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
