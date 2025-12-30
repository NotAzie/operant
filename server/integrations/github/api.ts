const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorClass: "authentication" | "permission" | "not_found" | "rate_limited" | "provider" | "network" | "invalid_response",
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "Operant-Operational-Intelligence",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new GitHubApiError(0, "network", "GitHub did not respond before the request timed out.");
    throw new GitHubApiError(0, "network", "GitHub could not be reached.");
  }
  if (!response.ok) {
    const status = response.status;
    const retryHeader = response.headers.get("retry-after");
    const remaining = response.headers.get("x-ratelimit-remaining");
    const kind = status === 401 ? "authentication" : status === 404 ? "not_found" : status === 429 || (status === 403 && remaining === "0") ? "rate_limited" : status === 403 ? "permission" : "provider";
    const retryAfter = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : null;
    try { await response.body?.cancel(); } catch { /* response already settled */ }
    throw new GitHubApiError(status, kind, `GitHub returned HTTP ${status}.`, retryAfter);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { throw new GitHubApiError(response.status, "invalid_response", "GitHub returned an unreadable response."); }
}

export type GitHubRepository = {
  id: number;
  full_name: string;
  html_url: string;
  name: string;
  owner: { login: string };
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean };
  has_issues: boolean;
};

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
};

export type GitHubComment = {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  user: { login: string } | null;
};

export async function validateRepository(token: string, owner: string, repo: string): Promise<GitHubRepository> {
  const result = await request<GitHubRepository>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!Number.isSafeInteger(result.id) || !result.full_name || !result.name || !result.owner?.login || !result.html_url || !result.has_issues) {
    throw new GitHubApiError(200, "invalid_response", "The repository response was incomplete or Issues are disabled.");
  }
  const issueRows = await request<unknown>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?per_page=1&state=all`);
  if (!Array.isArray(issueRows)) throw new GitHubApiError(200, "invalid_response", "GitHub returned an unreadable issue-list response.");
  return result;
}

export function buildActionMarker(actionId: number, requestHash: string): string {
  return `<!-- operant-action:${actionId}:${requestHash.slice(0, 24)} -->`;
}

export function buildCommentBody(text: string, actionId: number, requestHash: string): string {
  return `${text.trim()}\n\n${buildActionMarker(actionId, requestHash)}`;
}

export async function getIssue(token: string, owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
  return request<GitHubIssue>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`);
}

export async function listIssueComments(token: string, owner: string, repo: string, issueNumber: number, maxPages = 5): Promise<GitHubComment[]> {
  const all: GitHubComment[] = [];
  for (let page = 1; page <= Math.max(1, Math.min(maxPages, 5)); page++) {
    const rows = await request<GitHubComment[]>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

export async function createIssueComment(token: string, owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
  return request<GitHubComment>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
