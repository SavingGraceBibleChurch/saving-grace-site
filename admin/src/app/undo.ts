// Undo a saved change: put back what that change replaced, while keeping everything changed since in other
// places. JSON files are compared item by item (a sermon, a page, an event…), so undoing one sermon's edit
// leaves later edits to other sermons alone. If the same item was changed again afterwards, the undo stops
// and says so rather than guessing.
export class UndoConflict extends Error {}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** How to tell the items of a list apart: a sermon by its ID, a term by kind and slug, a redirect by its address… */
function keyOf(items: unknown[]): ((x: any) => string) | null {
  const all = items.filter((x) => x !== undefined);
  if (!all.length || !all.every(isObject)) return null;
  const has = (k: string) => all.every((x) => (x as Record<string, unknown>)[k] !== undefined);
  if (has("kind") && has("slug") && !has("wpId")) return (x) => `${x.kind}:${x.slug}`;
  for (const k of ["wpId", "id", "slug", "path"]) if (has(k)) return (x) => String(x[k]);
  if (has("from") && has("match")) return (x) => `${x.from}|${x.match}`;
  if (has("path") && has("field")) return (x) => `${x.path}|${x.field}|${x.reason}`;
  return null;
}

/** head with the change from `parent` to `commit` taken back out. */
export function revert(head: unknown, commit: unknown, parent: unknown): unknown {
  if (equal(head, commit)) return parent; // nothing else touched this since
  if (equal(commit, parent)) return head; // the change did not touch this
  if (isObject(head) && isObject(commit) && isObject(parent)) {
    const out: Record<string, unknown> = { ...head };
    for (const k of new Set([...Object.keys(parent), ...Object.keys(commit)])) {
      if (equal(commit[k], parent[k])) continue;
      const v = revert(head[k], commit[k], parent[k]);
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return out;
  }
  if (Array.isArray(head) && Array.isArray(commit) && Array.isArray(parent)) {
    const key = keyOf([...head, ...commit, ...parent]);
    if (!key) throw new UndoConflict();
    const byKey = (list: unknown[]) => new Map(list.map((x) => [key(x), x]));
    const H = byKey(head), C = byKey(commit), P = byKey(parent);
    const out = [...head];
    for (const k of new Set([...C.keys(), ...P.keys()])) {
      if (equal(C.get(k), P.get(k))) continue;
      const v = revert(H.get(k), C.get(k), P.get(k));
      const at = out.findIndex((x) => key(x) === k);
      if (v === undefined) { if (at >= 0) out.splice(at, 1); }
      else if (at >= 0) out[at] = v;
      else {
        // Put a removed item back next to the item it followed before.
        const was = parent.findIndex((x) => key(x) === k);
        const prev = was > 0 ? key(parent[was - 1]) : null;
        out.splice(prev === null ? 0 : out.findIndex((x) => key(x) === prev) + 1, 0, v);
      }
    }
    return out;
  }
  throw new UndoConflict();
}

/** The new text of a file once the change is undone; throws UndoConflict when it can't be done safely. */
export function undoText(path: string, head: string | null, commit: string | null, parent: string | null): string | null {
  if (head === commit) return parent;
  if (path.endsWith(".json") && head !== null && commit !== null && parent !== null) {
    try {
      return `${JSON.stringify(revert(JSON.parse(head), JSON.parse(commit), JSON.parse(parent)), null, 1)}\n`;
    } catch (error) {
      if (error instanceof UndoConflict) throw new UndoConflict(`It can't be undone automatically: the same item in ${path.split("/").pop()} was changed again afterwards.`);
      throw error;
    }
  }
  throw new UndoConflict(`It can't be undone automatically: ${path.split("/").pop()} was changed again afterwards.`);
}
