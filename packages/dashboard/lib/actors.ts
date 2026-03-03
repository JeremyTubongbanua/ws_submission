export type ActorId = 'scraper_daemon' | 'filter_agent' | 'comment_agent';

export type ActorRunResponse = {
  agent: ActorId;
  cycles_requested: number;
  results: Record<string, unknown>[];
};

export const ACTORS: { id: ActorId; label: string; description: string }[] = [
  {
    id: 'scraper_daemon',
    label: 'Scraper Daemon',
    description: 'Fetch the newest subreddit posts and ingest them into the database.',
  },
  {
    id: 'filter_agent',
    label: 'Filter Agent',
    description: 'Classify ingested content into opportunity review or trash.',
  },
  {
    id: 'comment_agent',
    label: 'Comment Agent',
    description: 'Generate draft comments for items in the drafting queue.',
  },
];
