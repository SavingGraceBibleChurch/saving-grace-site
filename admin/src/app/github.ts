// The few GitHub API calls the admin needs. Every save is one commit made from the browser:
// a new tree on top of the current one, a commit, then a fast-forward of the branch.
import { API, REPO } from "./config";

export class GitHubError extends Error {
  constructor(message: string, readonly status: number, readonly rateLimited = false) { super(message); }
}
/** What stops a token being used to edit; sign-in turns each into steps the editor can follow. */
export type EditProblem = "repository" | "access" | "save" | "builds";
/** The text of the one blob the sign-in check writes. Nothing points to it, so no branch, page or build changes. */
const CHECK_BLOB = "Saving Grace admin: this token can save.\n";
/** Someone else saved after we read the branch; the caller re-reads and tries again. */
export class NotFastForward extends Error {}

export interface FileChange { path: string; content: string | null }
export interface CommitSummary { sha: string; message: string; author: string; date: string; url: string }
export interface Run { name: string; status: string; conclusion: string | null; url: string }

export class GitHub {
  private readonly repoPath = `/repos/${REPO.owner}/${REPO.name}`;
  constructor(private readonly token: string) {}

  private async request(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<Response> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: init.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!response.ok && response.status !== 404 && response.status !== 422) {
      const text = await response.text().catch(() => "");
      const limited = response.status === 429 || (response.status === 403 && /rate limit/i.test(text));
      const message = response.status === 401 ? "Your GitHub token was not accepted. It may have expired; sign out and add a new one."
        : limited ? "GitHub is limiting how fast this account can work. Wait a few minutes and try again."
        : response.status === 403 ? "GitHub refused the request. Copy anything you haven't saved, then sign out and sign in again: signing in checks your token and says what to fix."
        : `GitHub error ${response.status}.`;
      throw new GitHubError(message, response.status, limited);
    }
    return response;
  }
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    if (response.status === 404) throw new GitHubError(`Not found on GitHub: ${path}`, 404);
    if (response.status === 422) throw new GitHubError(`GitHub could not process: ${path}`, 422);
    return response.json() as Promise<T>;
  }

  async user(): Promise<string> {
    return (await this.json<{ login: string }>("/user")).login;
  }
  async canAccessRepo(): Promise<boolean> {
    const response = await this.request(this.repoPath);
    return response.ok;
  }
  /**
   * Checked at sign-in, so nobody writes for twenty minutes before finding out they can't save. The
   * repository is public, so any token can read it: only a write shows this one may change it. The write
   * is the same small blob every time, which nothing points to.
   */
  async editProblem(): Promise<EditProblem | null> {
    const repo = await this.request(this.repoPath);
    if (!repo.ok) return "repository";
    const info = (await repo.json()) as { permissions?: { push?: boolean } };
    if (info.permissions?.push === false) return "access";
    const blob = { method: "POST", body: JSON.stringify({ content: CHECK_BLOB, encoding: "utf-8" }) };
    if (!(await this.allowed(`${this.repoPath}/git/blobs`, blob))) return "save";
    if (!(await this.allowed(`${this.repoPath}/actions/runs?per_page=1`))) return "builds";
    return null;
  }
  /** Whether GitHub lets this token make the request. A refusal is false; anything else (rate limit, outage) is thrown. */
  private async allowed(path: string, init: RequestInit = {}): Promise<boolean> {
    try {
      return (await this.request(path, init)).ok;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 403 && !error.rateLimited) return false;
      throw error;
    }
  }
  async headSha(): Promise<string> {
    return (await this.json<{ object: { sha: string } }>(`${this.repoPath}/git/ref/heads/${REPO.branch}`)).object.sha;
  }
  /** The file's text at a commit, or null when it does not exist. */
  async readText(path: string, ref: string): Promise<string | null> {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.request(`${this.repoPath}/contents/${encoded}?ref=${ref}`, { raw: true });
    if (response.status === 404) return null;
    return (await response.text()).replace(/\r\n/gu, "\n");
  }

  /** Commits the changes on top of `parent` and moves the branch to it. Throws NotFastForward if the branch moved. */
  async commit(parent: string, changes: FileChange[], message: string): Promise<string> {
    const base = await this.json<{ tree: { sha: string } }>(`${this.repoPath}/git/commits/${parent}`);
    const tree = await this.json<{ sha: string }>(`${this.repoPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: base.tree.sha,
        tree: changes.map((c) => (c.content === null ? { path: c.path, mode: "100644", type: "blob", sha: null } : { path: c.path, mode: "100644", type: "blob", content: c.content })),
      }),
    });
    const commit = await this.json<{ sha: string }>(`${this.repoPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }),
    });
    const update = await this.request(`${this.repoPath}/git/refs/heads/${REPO.branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    if (update.status === 422) throw new NotFastForward();
    if (!update.ok) throw new GitHubError("GitHub did not accept the save.", update.status);
    return commit.sha;
  }

  async recentCommits(count = 15): Promise<CommitSummary[]> {
    const list = await this.json<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } }; author: { login: string } | null }[]>(
      `${this.repoPath}/commits?sha=${REPO.branch}&per_page=${count}`,
    );
    return list.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0]!, author: c.author?.login ?? c.commit.author.name, date: c.commit.author.date, url: c.html_url }));
  }
  /** The commit's parent(s) and the files it changed. */
  async commitDetails(sha: string): Promise<{ parents: string[]; files: { path: string; status: string }[] }> {
    const c = await this.json<{ parents: { sha: string }[]; files?: { filename: string; status: string }[] }>(`${this.repoPath}/commits/${sha}`);
    return { parents: c.parents.map((p) => p.sha), files: (c.files ?? []).map((f) => ({ path: f.filename, status: f.status })) };
  }
  async runsFor(sha: string): Promise<Run[]> {
    const data = await this.json<{ workflow_runs: { name: string; status: string; conclusion: string | null; html_url: string }[] }>(`${this.repoPath}/actions/runs?head_sha=${sha}&per_page=10`);
    return data.workflow_runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }));
  }
}
