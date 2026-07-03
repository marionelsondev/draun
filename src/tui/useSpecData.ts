import { useCallback, useEffect, useState } from 'react';
import { watch, type FSWatcher } from 'node:fs';
import { loadDashboard, orderSpecsForTui } from './data.js';
import type { SpecStatus } from '../lib/index-parser.js';

const DEBOUNCE_MS = 150;
const POLL_MS = 3000;

export interface SpecData {
  specs: SpecStatus[];
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Loads the spec dashboard and keeps it live: a recursive `fs.watch` on the
 * specs root (debounced) reacts to external edits, backed by a slow poll for
 * platforms where recursive watching is unreliable.
 */
export function useSpecData(root: string): SpecData {
  const [specs, setSpecs] = useState<SpecStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    loadDashboard(root)
      .then((s) => {
        setSpecs(orderSpecsForTui(s));
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [root]);

  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(refresh, DEBOUNCE_MS);
    };
    let watcher: FSWatcher | undefined;
    try {
      watcher = watch(root, { recursive: true }, debounced);
    } catch {
      // Recursive watch not supported here — the poll below covers it.
    }
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      watcher?.close();
      clearInterval(poll);
    };
  }, [root, refresh]);

  return { specs, error, loading, refresh };
}
