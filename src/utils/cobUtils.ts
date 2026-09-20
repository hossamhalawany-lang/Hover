import { Task } from '../types';

/**
 * Determines whether a task is explicitly marked as a COB Execution Task.
 * Text parsing and regex on title/description are strictly forbidden to eliminate false positives
 * (e.g. ticket numbers like CH-450, phrases like 'Before COB').
 */
export function isCobTask(task: Task | { is_cob?: number | boolean | null; cob_count?: number | null } | null | undefined): boolean {
  if (!task) return false;
  return Boolean(
    task.is_cob === 1 ||
    task.is_cob === true ||
    (typeof task.cob_count === 'number' && task.cob_count > 0)
  );
}

/**
 * Returns the explicitly registered Number of COBs on the task.
 */
export function extractCobCount(task: Task | { cob_count?: number | null } | null | undefined): number {
  if (!task) return 1;
  const count = task.cob_count;
  if (typeof count === 'number' && count > 0) {
    return count;
  }
  return 1;
}
