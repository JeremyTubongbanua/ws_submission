'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { QueueResponse, QueueView } from '@/lib/types';
import { QUEUE_VIEWS } from '@/lib/types';
import { ACTORS, type ActorId, type ActorRunResponse } from '@/lib/actors';
import {
  clearStoredDashboardKey,
  getStoredDashboardKey,
  setStoredDashboardKey,
} from '@/lib/clientAuth';

const DEFAULT_VISIBLE_COLUMNS = new Set([
  'state',
  'title',
  'upvotes',
  'source',
  'source_author',
  'source_url',
  'source_created_at',
  'last_transition_at',
]);

type SortDirection = 'asc' | 'desc';

const fetcher = async (url: string, dashboardKey: string): Promise<QueueResponse> => {
  const response = await fetch(url, {
    headers: {
      'x-dashboard-key': dashboardKey,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed (${response.status})`);
  }
  return response.json();
};

const EASTERN_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function label(view: QueueView): string {
  return view
    .split('_')
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(' ');
}

function columnLabel(column: string): string {
  if (column === 'source_created_at') return 'Posted On';
  if (column === 'upvotes') return 'Upvotes';
  return column;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${EASTERN_DATETIME_FORMATTER.format(parsed)} (Eastern Time)`;
}

function formatCellValue(column: string, value: unknown): string {
  if (column === 'upvotes') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : '';
  }
  if (value == null) return '';
  if (column.endsWith('_at') || column === 'source_created_at') {
    return formatDateTime(value);
  }
  return String(value);
}

function upvoteCount(row: Record<string, unknown>): number {
  const rawPayload =
    row.raw_payload && typeof row.raw_payload === 'object'
      ? (row.raw_payload as Record<string, unknown>)
      : {};
  const score = rawPayload.score;
  const numeric = Number(score);
  return Number.isFinite(numeric) ? numeric : -Infinity;
}

function sortableValue(row: Record<string, unknown>, column: string): string | number {
  if (column === 'upvotes' || column === 'score') {
    return upvoteCount(row);
  }

  const value = row[column];
  if (column.endsWith('_at') || column === 'source_created_at') {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value.toLowerCase() : parsed.getTime();
    }
    return 0;
  }

  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value ?? '').toLowerCase();
}

function renderInlineFormatting(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/\S+\.(?:png|jpe?g|gif|webp))/gi;
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(pattern)) {
    const matched = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (matched.startsWith('**') && matched.endsWith('**')) {
      nodes.push(<strong key={`bold-${key++}`}>{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith('[')) {
      const linkMatch = matched.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i);
      if (linkMatch) {
        nodes.push(
          <a
            key={`link-${key++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-tide underline underline-offset-2"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(matched);
      }
    } else {
      nodes.push(
        <a
          key={`img-link-${key++}`}
          href={matched}
          target="_blank"
          rel="noreferrer"
          className="text-tide underline underline-offset-2"
        >
          {matched}
        </a>,
      );
    }

    lastIndex = index + matched.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function extractMarkdownImages(text: string): { alt: string; src: string }[] {
  const images: { alt: string; src: string }[] = [];
  const markdownPattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
  for (const match of text.matchAll(markdownPattern)) {
    images.push({ alt: match[1], src: match[2] });
  }
  return images;
}

function renderRichText(text: string): ReactNode {
  const withoutImages = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, '').trim();
  const paragraphs = withoutImages ? withoutImages.split(/\n{2,}/).filter(Boolean) : [];
  const images = extractMarkdownImages(text);

  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p
          key={`paragraph-${index}`}
          className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-ink/85"
        >
          {renderInlineFormatting(paragraph)}
        </p>
      ))}
      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <a
              key={`${image.src}-${index}`}
              href={image.src}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-2xl border border-black/10 bg-[#f7f3e8]"
            >
              <img
                src={image.src}
                alt={image.alt || 'Attached image'}
                className="h-56 w-full object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function isImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(value)
  );
}

export default function QueueDashboard() {
  const [dashboardKey, setDashboardKeyState] = useState<string>('');
  const [pendingDashboardKey, setPendingDashboardKey] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [selected, setSelected] = useState<QueueView>('ingested');
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actorLoading, setActorLoading] = useState<Record<string, boolean>>({});
  const [actorResults, setActorResults] = useState<Record<string, ActorRunResponse | { detail: string }>>({});
  const [actorCycles, setActorCycles] = useState<Record<string, number>>({
    scraper_daemon: 5,
    filter_agent: 5,
    comment_agent: 5,
  });
  const [reviewActionLoading, setReviewActionLoading] = useState<boolean>(false);
  const [reviewActionResult, setReviewActionResult] = useState<Record<string, unknown> | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const [deleteResult, setDeleteResult] = useState<Record<string, unknown> | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [sortState, setSortState] = useState<{ column: string; direction: SortDirection } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTargetState, setBulkTargetState] = useState<string>('');
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [bulkActionResult, setBulkActionResult] = useState<Record<string, unknown> | null>(null);
  const resizeStateRef = useRef<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const runActor = async (actor: ActorId) => {
    if (!dashboardKey) return;
    setActorLoading((current) => ({ ...current, [actor]: true }));
    const cycles = Math.max(1, Math.min(5, Number(actorCycles[actor] || 1)));
    try {
      const response = await fetch(`/api/agents/${actor}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-key': dashboardKey,
        },
        body: JSON.stringify({ cycles, limit: 1 }),
      });
      const payload = await response.json();
      setActorResults((current) => ({ ...current, [actor]: payload }));
      if (!response.ok) {
        throw new Error(payload.detail || `Failed (${response.status})`);
      }
      await load();
    } catch (err) {
      setActorResults((current) => ({
        ...current,
        [actor]: { detail: String(err) },
      }));
    } finally {
      setActorLoading((current) => ({ ...current, [actor]: false }));
    }
  };

  const load = async () => {
    if (!dashboardKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetcher(`/api/view/${selected}?limit=100&offset=0`, dashboardKey);
      setData(payload);
    } catch (err) {
      const message = String(err);
      setError(message);
      if (message.includes('401')) {
        clearStoredDashboardKey();
        setDashboardKeyState('');
        setPendingDashboardKey('');
        setIsUnlocked(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const stored = getStoredDashboardKey();
    if (stored) {
      setDashboardKeyState(stored);
      setPendingDashboardKey(stored);
      setIsUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    void load();
  }, [selected, isUnlocked, dashboardKey]);

  useEffect(() => {
    setSelectedIds([]);
    setBulkTargetState('');
    setBulkActionResult(null);
  }, [selected]);

  const columns = (() => {
    if (!data?.items.length) return [];
    const keys = new Set<string>();
    for (const row of data.items) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
    keys.add('upvotes');
    return Array.from(keys);
  })();

  useEffect(() => {
    setVisibleColumns((current) => {
      const next = { ...current };
      for (const column of columns) {
        if (!(column in next)) {
          next[column] = DEFAULT_VISIBLE_COLUMNS.has(column);
        }
      }
      return next;
    });
  }, [columns]);

  const displayedColumns = columns.filter((column) => visibleColumns[column]);
  const sortedItems = (() => {
    const items = [...(data?.items ?? [])];
    if (sortState) {
      const { column, direction } = sortState;
      items.sort((left, right) => {
        const leftValue = sortableValue(left, column);
        const rightValue = sortableValue(right, column);
        if (leftValue < rightValue) return direction === 'asc' ? -1 : 1;
        if (leftValue > rightValue) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  })();
  const selectedIdSet = new Set(selectedIds);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.max(120, resizeState.startWidth + delta);
      setColumnWidths((current) => ({
        ...current,
        [resizeState.column]: nextWidth,
      }));
    };

    const onMouseUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = (event: ReactMouseEvent<HTMLSpanElement>, column: string) => {
    event.preventDefault();
    event.stopPropagation();

    const currentWidth =
      columnWidths[column] ??
      Math.max(160, Math.min(320, `${column}`.length * 12 + 48));

    resizeStateRef.current = {
      column,
      startX: event.clientX,
      startWidth: currentWidth,
    };
  };

  const selectedState = String(selectedRow?.state ?? '');
  const selectedId = String(selectedRow?.id ?? '');
  const selectedUrl = typeof selectedRow?.source_url === 'string' ? selectedRow.source_url : null;
  const selectedTitle = typeof selectedRow?.title === 'string' ? selectedRow.title : '';
  const selectedBody = typeof selectedRow?.body_text === 'string' ? selectedRow.body_text : '';
  const selectedAuthor = typeof selectedRow?.source_author === 'string' ? selectedRow.source_author : '';
  const selectedRawPayload =
    selectedRow?.raw_payload && typeof selectedRow.raw_payload === 'object'
      ? (selectedRow.raw_payload as Record<string, unknown>)
      : {};
  const selectedSubreddit =
    typeof selectedRawPayload.subreddit === 'string' ? selectedRawPayload.subreddit : '';
  const selectedScore =
    typeof selectedRawPayload.score === 'number' || typeof selectedRawPayload.score === 'string'
      ? String(selectedRawPayload.score)
      : '';
  const selectedNumComments =
    typeof selectedRawPayload.num_comments === 'number' ||
    typeof selectedRawPayload.num_comments === 'string'
      ? String(selectedRawPayload.num_comments)
      : '';
  const selectedComments = Array.isArray(selectedRawPayload.top_level_comments)
    ? selectedRawPayload.top_level_comments.slice(0, 5)
    : [];
  const selectedPostedOn = formatDateTime(selectedRow?.source_created_at);
  const selectedIndex = sortedItems.findIndex((row) => String(row.id ?? '') === selectedId);
  const selectedOutboundUrl = selectedRawPayload.outbound_url;
  const selectedAgentSummary =
    typeof selectedRow?.agent_summary === 'string' ? selectedRow.agent_summary : '';

  const reviewAction =
    selectedState === 'ingested'
      ? {
          actions: [
            {
              targetState: 'opportunity_review' as const,
              label: 'Move To Opportunity Review',
              nextState: 'opportunity_review',
            },
            {
              targetState: 'drafting_queue' as const,
              label: 'Move Directly To Drafting Queue',
              nextState: 'drafting_queue',
            },
            {
              targetState: 'trash' as const,
              label: 'Move To Trash',
              nextState: 'trash',
            },
          ],
        }
      : selectedState === 'opportunity_review'
      ? {
          actions: [
            {
              targetState: 'drafting_queue' as const,
              label: 'Move To Drafting Queue',
              nextState: 'drafting_queue',
            },
            {
              targetState: 'trash' as const,
              label: 'Move To Trash',
              nextState: 'trash',
            },
          ],
        }
      : selectedState === 'approval_review'
        ? {
            actions: [
              {
                targetState: 'ready_to_publish' as const,
                label: 'Move To Ready To Publish',
                nextState: 'ready_to_publish',
              },
              {
                targetState: 'trash' as const,
                label: 'Move To Trash',
                nextState: 'trash',
              },
            ],
          }
        : null;

  const runReviewAction = async (actionConfig: {
    targetState: 'opportunity_review' | 'drafting_queue' | 'ready_to_publish' | 'trash';
    nextState: string;
  }) => {
    if (!selectedId) return;

    setReviewActionLoading(true);
    setReviewActionResult(null);
    try {
      const response = await fetch('/api/review-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-key': dashboardKey,
        },
        body: JSON.stringify({
          targetState: actionConfig.targetState,
          contentIds: [selectedId],
        }),
      });
      const payload = await response.json();
      setReviewActionResult(payload);
      if (!response.ok) {
        throw new Error(payload.detail || `Failed (${response.status})`);
      }
      setSelectedRow((current) =>
        current
          ? {
              ...current,
              state: actionConfig.nextState,
            }
          : current,
      );
      await load();
    } catch (err) {
      setReviewActionResult({ detail: String(err) });
    } finally {
      setReviewActionLoading(false);
    }
  };

  const permanentlyDeleteSelected = async () => {
    if (!selectedId) return;
    setDeleteLoading(true);
    setDeleteResult(null);
    try {
      const response = await fetch(`/api/content/${selectedId}`, {
        method: 'DELETE',
        headers: {
          'x-dashboard-key': dashboardKey,
        },
      });
      const payload = await response.json();
      setDeleteResult(payload);
      if (!response.ok) {
        throw new Error(payload.detail || `Failed (${response.status})`);
      }
      setSelectedRow(null);
      await load();
    } catch (err) {
      setDeleteResult({ detail: String(err) });
    } finally {
      setDeleteLoading(false);
    }
  };

  const bulkOptionsByView: Record<QueueView, { value: string; label: string }[]> = {
    ingested: [
      { value: 'opportunity_review', label: 'Opportunity Review' },
      { value: 'drafting_queue', label: 'Drafting Queue' },
      { value: 'trash', label: 'Trash' },
    ],
    opportunity_review: [
      { value: 'drafting_queue', label: 'Drafting Queue' },
      { value: 'trash', label: 'Trash' },
    ],
    drafting_queue: [{ value: 'trash', label: 'Trash' }],
    approval_review: [
      { value: 'ready_to_publish', label: 'Ready To Publish' },
      { value: 'trash', label: 'Trash' },
    ],
    ready_to_publish: [{ value: 'trash', label: 'Trash' }],
    trash: [],
  };

  const bulkOptions = bulkOptionsByView[selected];
  const allVisibleIds = sortedItems.map((row) => String(row.id ?? '')).filter(Boolean);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIdSet.has(id));

  const toggleRowSelection = (contentId: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, contentId])) : current.filter((id) => id !== contentId),
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? allVisibleIds : []);
  };

  const runBulkMove = async () => {
    if (!bulkTargetState || !selectedIds.length) return;
    setBulkActionLoading(true);
    setBulkActionResult(null);
    try {
      const response = await fetch('/api/review-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-key': dashboardKey,
        },
        body: JSON.stringify({
          targetState: bulkTargetState,
          contentIds: selectedIds,
        }),
      });
      const payload = await response.json();
      setBulkActionResult(payload);
      if (!response.ok && response.status !== 207) {
        throw new Error(payload.detail || `Failed (${response.status})`);
      }
      setSelectedIds([]);
      setSelectedRow(null);
      await load();
    } catch (err) {
      setBulkActionResult({ detail: String(err) });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const selectRelativeRow = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= sortedItems.length) return;
    setSelectedRow(sortedItems[nextIndex]);
  };

  const toggleSort = (column: string) => {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: 'asc' };
      }
      return {
        column,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  };

  const submitDashboardKey = async () => {
    const trimmed = pendingDashboardKey.trim();
    if (!trimmed) {
      setError('Enter the password.');
      return;
    }

    try {
      await fetcher(`/api/view/ingested?limit=1&offset=0`, trimmed);
      setStoredDashboardKey(trimmed);
      setDashboardKeyState(trimmed);
      setIsUnlocked(true);
      setError(null);
    } catch (err) {
      setError('Invalid password.');
      setIsUnlocked(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-12">
      <section className="mx-auto max-w-7xl">
        {!isUnlocked && (
          <section className="mb-6 rounded-2xl border border-black/10 bg-white p-6 shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-tide">TheCopilotMarketer</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Enter Password</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/70">
              Paste the password to unlock the dashboard. It will be saved in local browser storage so you do not need to enter it every time.
            </p>
            <div className="mt-4 flex max-w-xl flex-col gap-3">
              <input
                type="password"
                value={pendingDashboardKey}
                onChange={(event) => setPendingDashboardKey(event.target.value)}
                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink"
                placeholder="Paste Password"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void submitDashboardKey();
                  }}
                  className="rounded-full border border-tide bg-tide px-4 py-2 text-sm font-semibold text-white"
                >
                  Unlock Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearStoredDashboardKey();
                    setPendingDashboardKey('');
                    setDashboardKeyState('');
                    setError(null);
                  }}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  Clear Saved Key
                </button>
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
          </section>
        )}
        {isUnlocked && (
          <>
        <header className="mb-6 rounded-2xl border border-black/10 bg-shell p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-tide">TheCopilotMarketer</p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">Marketing Copilot Dashboard</h1>
              <p className="mt-2 text-sm text-ink/70">
                Review social opportunities, inspect conversation context, and hand work off to automation.
              </p>
            </div>
            <a
              href="/install-extension"
              className="rounded-full border border-tide bg-tide px-4 py-2 text-sm font-semibold text-white hover:bg-[#095249]"
            >
              Install Chrome Extension
            </a>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-black/10 bg-white p-4 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Agent Controls</h2>
              <p className="text-sm text-ink/70">Run each agent manually for up to 5 cycles.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {ACTORS.map((actor) => (
              <article key={actor.id} className="rounded-2xl border border-black/10 bg-[#fcfbf8] p-4">
                <h3 className="font-semibold">{actor.label}</h3>
                <p className="mt-1 text-sm text-ink/70">{actor.description}</p>
                <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink/60">
                  Cycles
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={actorCycles[actor.id] ?? 5}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setActorCycles((current) => ({
                      ...current,
                      [actor.id]: Number.isFinite(nextValue) ? nextValue : 1,
                    }));
                  }}
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    void runActor(actor.id);
                  }}
                  disabled={Boolean(actorLoading[actor.id])}
                  className="mt-4 rounded-full border border-tide bg-tide px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actorLoading[actor.id] ? 'Running...' : 'Run Cycles'}
                </button>
                <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-[#0f1820] p-3 text-xs text-[#d8fff7]">
                  {JSON.stringify(actorResults[actor.id] ?? { status: 'idle' }, null, 2)}
                </pre>
              </article>
            ))}
          </div>
        </section>

        <div className="mb-5 flex flex-wrap gap-2">
          {QUEUE_VIEWS.map((view) => {
            const active = view === selected;
            return (
              <button
                key={view}
                type="button"
                onClick={() => {
                  setSelected(view);
                  setSelectedRow(null);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'border-tide bg-tide text-white'
                    : 'border-black/15 bg-white/70 text-ink hover:border-tide/60'
                }`}
              >
                {label(view)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-tide/60"
          >
            Refresh
          </button>
        </div>

        <section className="grid min-w-0 gap-4">
          <article className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <h2 className="font-semibold">{label(selected)}</h2>
              <span className="text-xs text-ink/60">{data?.count ?? 0} items</span>
            </div>

            <div className="border-b border-black/10 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/60">Visible Columns</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {columns.map((column) => (
                  <label key={column} className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={Boolean(visibleColumns[column])}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setVisibleColumns((current) => ({
                          ...current,
                          [column]: checked,
                        }));
                      }}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    <span>{columnLabel(column)}</span>
                  </label>
                ))}
              </div>
              {bulkOptions.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="text-sm font-semibold text-ink/80">Move to :</label>
                  <select
                    value={bulkTargetState}
                    onChange={(event) => setBulkTargetState(event.target.value)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink"
                  >
                    <option value="">Select state</option>
                    {bulkOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      void runBulkMove();
                    }}
                    disabled={bulkActionLoading || !bulkTargetState || selectedIds.length === 0}
                    className="rounded-full border border-tide bg-tide px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bulkActionLoading ? 'Applying...' : `Apply To ${selectedIds.length} Selected`}
                  </button>
                </div>
              )}
              {bulkActionResult && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-[#0f1820] p-3 text-xs text-[#d8fff7]">
                  {JSON.stringify(bulkActionResult, null, 2)}
                </pre>
              )}
            </div>

            {isLoading && <p className="p-4 text-sm text-ink/70">Loading queue...</p>}
            {error && <p className="p-4 text-sm text-red-700">{error}</p>}

            {!isLoading && !error && (
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-[#edf5f3] text-left">
                    <tr>
                      <th className="border-b border-black/10 px-3 py-2 font-semibold">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(event) => toggleSelectAll(event.target.checked)}
                          aria-label="Select all visible rows"
                          className="h-4 w-4 rounded border-black/20"
                        />
                      </th>
                      {displayedColumns.map((column) => (
                        <th
                          key={column}
                          className="relative border-b border-black/10 px-3 py-2 font-semibold"
                          style={{ width: columnWidths[column] ?? undefined }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleSort(column)}
                              className="flex min-w-0 items-center gap-1 truncate text-left hover:text-tide"
                            >
                              <span className="truncate">{columnLabel(column)}</span>
                              {sortState?.column === column && (
                                <span className="text-xs text-tide">
                                  {sortState.direction === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </button>
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={`Resize ${column} column`}
                              onMouseDown={(event) => startResize(event, column)}
                              className="cursor-col-resize select-none px-1 text-ink/30 hover:text-tide"
                            >
                              |
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((row, index) => (
                      <tr
                        key={`${String(row.id ?? index)}-${index}`}
                        onClick={() => setSelectedRow(row)}
                        className="cursor-pointer border-b border-black/5 odd:bg-white even:bg-[#fcfbf8] hover:bg-[#e8f7f3]"
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIdSet.has(String(row.id ?? ''))}
                            onChange={(event) => {
                              event.stopPropagation();
                              toggleRowSelection(String(row.id ?? ''), event.target.checked);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${String(row.id ?? index)}`}
                            className="h-4 w-4 rounded border-black/20"
                          />
                        </td>
                        {displayedColumns.map((column) => (
                          <td
                            key={column}
                            className="truncate px-3 py-2 align-top"
                            style={{
                              width: columnWidths[column] ?? undefined,
                              maxWidth: columnWidths[column] ?? 220,
                            }}
                          >
                            {formatCellValue(
                              column,
                              column === 'upvotes' ? upvoteCount(row) : row[column],
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <aside className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink/60">Selected Item</h3>
              {selectedRow && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectRelativeRow(-1)}
                    disabled={selectedIndex <= 0}
                    className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRelativeRow(1)}
                    disabled={selectedIndex < 0 || selectedIndex >= sortedItems.length - 1}
                    className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            {!selectedRow && <p className="mt-3 text-sm text-ink/70">Click a row to inspect full JSON.</p>}
            {selectedRow && (
              <>
                <div className="mt-3 min-w-0 space-y-3">
                  <div className="min-w-0 rounded-xl border border-black/10 bg-[#f7f3e8] p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink/60">Human Review</p>
                    <p className="mt-1 text-sm text-ink/80">
                      Current state: <span className="font-semibold">{selectedState || 'unknown'}</span>
                    </p>
                    {selectedUrl && (
                      <a
                        href={selectedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-semibold text-tide underline-offset-2 hover:underline"
                      >
                        Open Source Link
                      </a>
                    )}
                    {reviewAction && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reviewAction.actions.map((actionConfig) => (
                          <button
                            key={actionConfig.action}
                            type="button"
                            onClick={() => {
                              void runReviewAction(actionConfig);
                            }}
                            disabled={reviewActionLoading}
                            className="rounded-full border border-tide bg-tide px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {reviewActionLoading ? 'Submitting...' : actionConfig.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {!reviewAction && (
                      <p className="mt-3 text-sm text-ink/70">
                        No human review action available for this state.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void permanentlyDeleteSelected();
                      }}
                      disabled={deleteLoading}
                      className="mt-3 block rounded-full border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                    </button>
                  </div>

                  <section className="min-w-0 rounded-xl border border-black/10 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink/60">Post Summary</p>
                    {selectedAgentSummary && (
                      <div className="mt-3 max-w-3xl rounded-2xl border border-[#ead79e] bg-[#fff4c7] px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#7b5d00]">
                          Agent Summary
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#5f4b00]">
                          {selectedAgentSummary}
                        </p>
                      </div>
                    )}
                    {selectedSubreddit && (
                      <p className="mt-2 text-sm font-semibold text-tide">r/{selectedSubreddit}</p>
                    )}
                    {selectedTitle && (
                      <h4 className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-base font-semibold text-ink">
                        {selectedTitle}
                      </h4>
                    )}
                    {selectedAuthor && (
                      <p className="mt-2 text-sm text-ink/70">Author: {selectedAuthor}</p>
                    )}
                    {(selectedScore || selectedNumComments) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedScore && (
                          <span className="rounded-full bg-[#edf5f3] px-3 py-1 text-xs font-semibold text-ink/80">
                            Upvotes: {selectedScore}
                          </span>
                        )}
                        {selectedNumComments && (
                          <span className="rounded-full bg-[#fcf1df] px-3 py-1 text-xs font-semibold text-ink/80">
                            Comments: {selectedNumComments}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedPostedOn && (
                      <div className="mt-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink/60">
                          Posted On
                        </p>
                        <p className="mt-2 text-sm text-ink/85">{selectedPostedOn}</p>
                      </div>
                    )}
                    {selectedBody && (
                      <div className="mt-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink/60">
                          Description
                        </p>
                        <div className="mt-2">{renderRichText(selectedBody)}</div>
                      </div>
                    )}
                    {isImageUrl(selectedOutboundUrl) && (
                      <div className="mt-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-ink/60">
                          Attached Image
                        </p>
                        <a
                          href={selectedOutboundUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block max-w-3xl overflow-hidden rounded-2xl border border-black/10 bg-[#f7f3e8]"
                        >
                          <img
                            src={selectedOutboundUrl}
                            alt="Post attached media"
                            className="h-auto max-h-[420px] w-full object-contain"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    )}
                  </section>

                  <section className="min-w-0 rounded-xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink/60">
                        Sampled Comments
                      </p>
                      <span className="text-xs text-ink/60">{selectedComments.length} shown</span>
                    </div>
                    {selectedComments.length === 0 && (
                      <p className="mt-3 text-sm text-ink/70">No sampled comments stored for this item.</p>
                    )}
                    {selectedComments.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {selectedComments.map((comment, index) => {
                          const commentRecord =
                            comment && typeof comment === 'object'
                              ? (comment as Record<string, unknown>)
                              : {};
                          const commentAuthor =
                            typeof commentRecord.author === 'string' ? commentRecord.author : 'unknown';
                          const commentBody =
                            typeof commentRecord.body === 'string' ? commentRecord.body : '';
                          const commentScore =
                            typeof commentRecord.score === 'number' ||
                            typeof commentRecord.score === 'string'
                              ? String(commentRecord.score)
                              : '';

                          return (
                            <article
                              key={`${commentAuthor}-${index}`}
                              className="min-w-0 rounded-xl border border-black/10 bg-[#fcfbf8] p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-ink">{commentAuthor}</p>
                                {commentScore && (
                                  <span className="text-xs font-semibold text-ink/60">
                                    Upvotes: {commentScore}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2">
                                {commentBody ? (
                                  renderRichText(commentBody)
                                ) : (
                                  <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-ink/85">
                                    (empty comment body)
                                  </p>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {reviewActionResult && (
                    <pre className="max-h-40 max-w-full overflow-auto rounded-xl bg-[#0f1820] p-3 text-xs text-[#d8fff7]">
                      {JSON.stringify(reviewActionResult, null, 2)}
                    </pre>
                  )}
                  {deleteResult && (
                    <pre className="max-h-40 max-w-full overflow-auto rounded-xl bg-[#201010] p-3 text-xs text-[#ffd8d8]">
                      {JSON.stringify(deleteResult, null, 2)}
                    </pre>
                  )}
                </div>

                <pre className="mt-3 max-h-[320px] max-w-full overflow-auto rounded-xl bg-[#0f1820] p-3 text-xs text-[#d8fff7]">
                  {JSON.stringify(selectedRow, null, 2)}
                </pre>
              </>
            )}
          </aside>
        </section>
          </>
        )}
      </section>
    </main>
  );
}
