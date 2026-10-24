import { useEffect, useState, type ReactNode } from 'react';
import { Database, RotateCcw } from 'lucide-react';
import { taskRepository } from '../../db/task-repository';

type DatabaseState = 'opening' | 'ready' | 'error';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatabaseState>('opening');
  const [attempt, setAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    taskRepository.open().then(
      () => {
        if (!active) return;
        setErrorMessage(null);
        setState('ready');
      },
      (error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : null);
        setState('error');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state === 'opening') {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
        <div role="status">
          <Database size={30} className="mx-auto text-brand" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold">Opening your local workspace</h1>
          <p className="mt-2 text-sm text-muted">Your tasks stay on this device.</p>
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
        <div className="panel max-w-md p-6" role="alert">
          <Database size={30} className="mx-auto text-danger" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold">Local storage is unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Relay Miden could not open IndexedDB. Existing data was not cleared. Check browser
            storage permissions, then try again.
          </p>
          {errorMessage ? <p className="mt-3 text-xs text-muted">Details: {errorMessage}</p> : null}
          <button
            className="button-primary mt-5"
            onClick={() => {
              setErrorMessage(null);
              setState('opening');
              setAttempt((value) => value + 1);
            }}
          >
            <RotateCcw size={17} /> Try again
          </button>
        </div>
      </main>
    );
  }

  return children;
}
