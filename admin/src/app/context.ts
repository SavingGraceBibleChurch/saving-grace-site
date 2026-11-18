// What every page of the admin is given.
import type { GitHub } from "./github";
import type { Store } from "./store";
import { ConflictError, ValidationError } from "./store";
import { trackBuild } from "./status";
import { problemsBox, toast } from "./ui";

export interface Ctx {
  store: Store;
  gh: GitHub;
  user: string;
  /** Navigate to a hash route such as "#/sermons". */
  go(hash: string): void;
  /** Save, show the result and follow the build. Returns the commit SHA, or null if it did not save. */
  save(message: string, edits: Parameters<Store["save"]>[1], problemsHost?: HTMLElement): Promise<string | null>;
}

export function makeCtx(store: Store, gh: GitHub, user: string, go: (hash: string) => void): Ctx {
  return {
    store, gh, user, go,
    async save(message, edits, problemsHost) {
      problemsHost?.replaceChildren();
      try {
        const sha = await store.save(message, edits);
        if (sha === null) {
          toast("Nothing to save: no changes were made.", "info");
          return store.head;
        }
        toast("Saved. The site is rebuilding; your change goes live in about 5 minutes.", "ok");
        trackBuild(gh, sha);
        return sha;
      } catch (error) {
        if (error instanceof ValidationError) {
          if (problemsHost) problemsHost.replaceChildren(problemsBox("Not saved. Please fix:", error.problems));
          toast("Not saved: some details need fixing.", "error");
        } else if (error instanceof ConflictError) {
          toast(error.message, "error", 12000);
        } else {
          toast(`Not saved: ${error instanceof Error ? error.message : "something went wrong"}`, "error", 10000);
        }
        return null;
      }
    },
  };
}
