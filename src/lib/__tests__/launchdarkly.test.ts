import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { serviceBoolFlag, ldInit } = vi.hoisted(() => ({
  serviceBoolFlag: vi.fn(async (_key: string, _fallback: boolean) => true),
  ldInit: vi.fn(),
}));
vi.mock("../ffs-client", () => ({ boolFlag: serviceBoolFlag }));
vi.mock("@launchdarkly/node-server-sdk", () => ({ init: ldInit }));

import { boolFlag } from "../launchdarkly";

describe("boolFlag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("asks the flag service when FLAG_SERVICE_URL is set", async () => {
    vi.stubEnv("FLAG_SERVICE_URL", "http://localhost:3000");
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "sdk-ignored");

    expect(await boolFlag("show-vlog-page", false)).toBe(true);
    expect(serviceBoolFlag).toHaveBeenCalledWith("show-vlog-page", false);
    expect(ldInit).not.toHaveBeenCalled();
  });

  it("keeps the LaunchDarkly path when FLAG_SERVICE_URL is blank", async () => {
    vi.stubEnv("FLAG_SERVICE_URL", "  ");
    vi.stubEnv("LAUNCHDARKLY_SDK_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await boolFlag("show-vlog-page", false)).toBe(false);
    expect(serviceBoolFlag).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("LAUNCHDARKLY_SDK_KEY"));
  });
});
