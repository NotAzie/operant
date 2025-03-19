import { afterEach, describe, expect, it, vi } from "vitest";
import { validateRepository } from "./api";

afterEach(() => vi.unstubAllGlobals());

function repositoryResponse() {
  return {
    id: 817_004,
    full_name: "example/operant",
    html_url: "https://github.com/example/operant",
    name: "operant",
    owner: { login: "example" },
    has_issues: true,
    // GitHub's repository response reports repository roles, not permissions.issues.
    permissions: { admin: false, maintain: false, push: false, triage: true, pull: true },
  };
}

describe("GitHub repository connection validation", () => {
  it("accepts GitHub's documented repository permission shape and validates issue read access without a write probe", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/issues?per_page=1&state=all")) return new Response("[]", { status: 200 });
      return new Response(JSON.stringify(repositoryResponse()), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await validateRepository("unit-test-token", "example", "operant");

    expect(result.id).toBe(817_004);
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"]);
    expect(requests[1]?.url).toContain("/issues?per_page=1&state=all");
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("rejects a token that cannot read issues while preserving the provider's safe permission classification", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/issues?per_page=1&state=all")) {
        return new Response("{}", { status: 403, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(repositoryResponse()), { status: 200, headers: { "content-type": "application/json" } });
    }));

    await expect(validateRepository("unit-test-token", "example", "operant"))
      .rejects.toMatchObject({ errorClass: "permission", status: 403 });
  });

  it("rejects repositories with Issues disabled before making the issue-list request", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...repositoryResponse(), has_issues: false }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateRepository("unit-test-token", "example", "operant"))
      .rejects.toMatchObject({ errorClass: "invalid_response", status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
