/** UI vocabulary only. Persistence schemas and transport envelopes are future work. */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskKind = 'water' | 'medical' | 'road' | 'supplies';
export type Language = 'en' | 'ml' | 'ta';

export interface DemoTask {
  readonly id: string;
  readonly title: string;
  readonly kind: TaskKind;
  readonly location: string;
  readonly quantity: number;
  readonly unit: string;
  readonly priority: Priority;
  readonly status: TaskStatus;
  /** Static relative time for the interface preview; not a live timestamp. */
  readonly relativeTime: string;
  readonly notes: string;
}

export interface HealthResponse {
  status: 'ok';
  service: 'relay-miden-server';
  phase: 1;
}
