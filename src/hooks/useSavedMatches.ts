import { useCallback, useEffect, useRef, useState } from 'react';
import { listStoredMatches } from '../game/storage';
import { uploadReceivedMatch } from '../remote/gameDays';
import { errorMessage } from '../game/errors';
import type { StoredMatch } from '../game/types';
import type { MatchUploadReceipt } from '../remote/types';

export interface SavedMatchesServices {
  list: (database: IDBDatabase) => Promise<StoredMatch[]>;
  upload: (database: IDBDatabase, id: string) => Promise<MatchUploadReceipt>;
}

const services: SavedMatchesServices = { list: listStoredMatches, upload: uploadReceivedMatch };

export const useSavedMatches = (
  database: IDBDatabase,
  dependencies: SavedMatchesServices = services,
) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncNotice, setSyncNotice] = useState('');
  const generation = useRef(0);

  const refreshPending = useCallback(async () => {
    const requestGeneration = generation.current;
    try {
      const matches = await dependencies.list(database);
      if (generation.current === requestGeneration) setPendingCount(matches.length);
    } catch {
      if (generation.current === requestGeneration)
        setSyncNotice('Saved matches could not be loaded. Existing data has been kept.');
    }
  }, [database, dependencies]);

  useEffect(() => {
    void refreshPending();
    return () => {
      generation.current += 1;
    };
  }, [refreshPending]);

  const sendClosedMatch = useCallback(
    async (id: string) => {
      const requestGeneration = generation.current;
      setSyncNotice('Finalizing match online. Local copy is kept until confirmation.');
      try {
        const receipt = await dependencies.upload(database, id);
        if (generation.current === requestGeneration)
          setSyncNotice(
            receipt.deleted
              ? 'This match was already removed by an administrator. Local copy removed.'
              : 'Match finalized and synced. Local copy removed.',
          );
        return receipt;
      } catch (error) {
        if (generation.current === requestGeneration)
          setSyncNotice(
            `Sync was not confirmed. Your match is kept on this device. ${errorMessage(error)} Open Saved matches to retry.`,
          );
        return undefined;
      } finally {
        if (generation.current === requestGeneration) await refreshPending();
      }
    },
    [database, dependencies, refreshPending],
  );

  return { pendingCount, syncNotice, setSyncNotice, refreshPending, sendClosedMatch };
};
