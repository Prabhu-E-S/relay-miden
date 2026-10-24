export class TaskRepositoryError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DATABASE_UNAVAILABLE'
      | 'DUPLICATE'
      | 'INVALID_INPUT'
      | 'INVALID_TRANSITION'
      | 'NOT_FOUND'
      | 'STORAGE_FULL'
      | 'TRANSACTION_FAILED',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TaskRepositoryError';
  }
}

export function readableDatabaseError(error: unknown): string {
  if (error instanceof TaskRepositoryError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Local storage is full. Free browser storage before trying again.';
  }
  return 'The task could not be saved locally. Your existing data was not changed.';
}
