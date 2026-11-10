import { useEffect, useState } from 'react';
import { enableCourtMode } from '../game/match';
import { loadStoredMatch, openMatchDatabase } from '../game/storage';
import { closeDayDatabaseWhenUploadsFinish } from '../remote/gameDays';
import type { MatchState } from '../game/types';

export interface MatchSessionServices {
  open: () => Promise<IDBDatabase>;
  load: (database: IDBDatabase) => Promise<MatchState>;
  close: (database: IDBDatabase) => Promise<void>;
}

const services: MatchSessionServices = {
  open: openMatchDatabase,
  load: loadStoredMatch,
  close: closeDayDatabaseWhenUploadsFinish,
};

export const useMatchSession = (dependencies: MatchSessionServices = services) => {
  const [session, setSession] = useState<{ database: IDBDatabase; state: MatchState } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let database: IDBDatabase | undefined;
    let initialized = false;

    const initialize = async () => {
      try {
        database = await dependencies.open();
        const state = enableCourtMode(await dependencies.load(database));
        if (cancelled) {
          await dependencies.close(database);
          return;
        }
        initialized = true;
        setSession({ database, state });
        // Optional storage permissions must never prevent offline play.
        try {
          void globalThis.navigator?.storage?.persist?.().catch(() => {});
        } catch {
          /* optional API */
        }
      } catch {
        database?.close();
        if (!cancelled) setError(true);
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      // A cancelled initialization closes its connection after its read completes.
      // A live session waits for in-flight uploads before closing the database.
      if (database && initialized) void dependencies.close(database);
    };
  }, [attempt, dependencies]);

  const retry = () => {
    setError(false);
    setAttempt((value) => value + 1);
  };

  return { session, error, retry };
};
