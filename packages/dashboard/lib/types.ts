export type QueueView =
  | 'ingested'
  | 'opportunity_review'
  | 'drafting_queue'
  | 'approval_review'
  | 'ready_to_publish';

export type QueueResponse = {
  items: Record<string, unknown>[];
  limit: number;
  offset: number;
  count: number;
};

export const QUEUE_VIEWS: QueueView[] = [
  'ingested',
  'opportunity_review',
  'drafting_queue',
  'approval_review',
  'ready_to_publish',
];
