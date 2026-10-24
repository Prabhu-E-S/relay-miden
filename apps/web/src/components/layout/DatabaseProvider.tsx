import { useEffect, useState, type ReactNode } from 'react';
import { Database, RotateCcw } from 'lucide-react';
import { taskRepository } from '../../db/task-repository';

type DatabaseState = 'opening' | 'ready' | 'error';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatabaseState>('opening');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    taskRepository.open().then(
      () => active && setState('ready'),
      () => active && setState('error'),
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
          <button
            className="button-primary mt-5"
            onClick={() => {
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
