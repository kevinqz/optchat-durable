import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

/** OS-backed SQLite advisory lock. Released by the OS even after SIGKILL; no stale PID deletion race. */
export function acquireWriterLock(directory: string): () => void {
  const db = new DatabaseSync(join(directory, ".writer-lock.sqlite"));
  try { db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;"); }
  catch {
    db.close();
    throw new Error(`Another OptChat process owns ${directory}. Close it before opening the same history.`);
  }
  let closed = false;
  return () => { if (!closed) { closed = true; db.close(); } };
}
