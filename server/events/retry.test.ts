import { describe, expect, it } from "vitest";
import { retryDelaySeconds } from "./retry";

describe("event retry backoff", () => {
  it("adds full jitter while keeping the initial retry bounded away from an immediate loop", () => {
    expect(retryDelaySeconds(1, () => 0)).toBe(1);
    expect(retryDelaySeconds(1, () => 0.5)).toBe(8);
    expect(retryDelaySeconds(1, () => 1)).toBe(15);
  });

  it("grows the retry ceiling exponentially", () => {
    expect(retryDelaySeconds(2, () => 0)).toBe(1);
    expect(retryDelaySeconds(2, () => 0.5)).toBe(16);
    expect(retryDelaySeconds(3, () => 1)).toBe(60);
  });

  it("caps delays at one hour for large attempt counts", () => {
    expect(retryDelaySeconds(9, () => 1)).toBe(3600);
    expect(retryDelaySeconds(10_000, () => 1)).toBe(3600);
  });

  it("normalizes invalid inputs safely", () => {
    expect(retryDelaySeconds(0, () => Number.NaN)).toBe(8);
    expect(retryDelaySeconds(Number.NaN, () => -1)).toBe(1);
  });
});
