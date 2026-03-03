'use client';

import { useEffect, useMemo, useState } from 'react';
import type { QueueResponse, QueueView } from '@/lib/types';
import { QUEUE_VIEWS } from '@/lib/types';
import { ACTORS, type ActorId, type ActorRunResponse } from '@/lib/actors';

const fetcher = async (url: string): Promise<QueueResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed (${response.status})`);
  }
  return response.json();
};

function label(view: QueueView): string {
  return view
    .split('_')
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(' ');
}

export default function QueueDashboard() {
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

  const runActor = async (actor: ActorId) => {
    setActorLoading((current) => ({ ...current, [actor]: true }));
    const cycles = Math.max(1, Math.min(5, Number(actorCycles[actor] || 1)));
    try {
      const response = await fetch(`/api/agents/${actor}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetcher(`/api/view/${selected}?limit=100&offset=0`);
      setData(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [selected]);

  const columns = useMemo(() => {
    if (!data?.items.length) return [];
    const keys = new Set<string>();
    for (const row of data.items) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
    return Array.from(keys);
  }, [data]);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-12">
      <section className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-2xl border border-black/10 bg-shell p-6 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-tide">Workflow Studio</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Triage Dashboard</h1>
          <p className="mt-2 text-sm text-ink/70">
            Browse pipeline queues, inspect records, and hand off work to automation.
          </p>
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

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <article className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <h2 className="font-semibold">{label(selected)}</h2>
              <span className="text-xs text-ink/60">{data?.count ?? 0} items</span>
            </div>

            {isLoading && <p className="p-4 text-sm text-ink/70">Loading queue...</p>}
            {error && <p className="p-4 text-sm text-red-700">{error}</p>}

            {!isLoading && !error && (
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-[#edf5f3] text-left">
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="border-b border-black/10 px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.items ?? []).map((row, index) => (
                      <tr
                        key={`${String(row.id ?? index)}-${index}`}
                        onClick={() => setSelectedRow(row)}
                        className="cursor-pointer border-b border-black/5 odd:bg-white even:bg-[#fcfbf8] hover:bg-[#e8f7f3]"
                      >
                        {columns.map((column) => (
                          <td key={column} className="max-w-[220px] truncate px-3 py-2 align-top">
                            {String(row[column] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <aside className="rounded-2xl border border-black/10 bg-white p-4 shadow-card">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink/60">Selected Item</h3>
            {!selectedRow && <p className="mt-3 text-sm text-ink/70">Click a row to inspect full JSON.</p>}
            {selectedRow && (
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-xl bg-[#0f1820] p-3 text-xs text-[#d8fff7]">
                {JSON.stringify(selectedRow, null, 2)}
              </pre>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
