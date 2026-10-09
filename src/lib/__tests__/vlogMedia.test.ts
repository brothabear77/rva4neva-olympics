import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { vlogMediaConfig, vlogMediaConfigured, vlogObjectKey } from "../vlogMedia";

afterEach(() => vi.unstubAllEnvs());

describe("vlogMediaConfig", () => {
  it("is off when no bucket is set", () => {
    vi.stubEnv("VLOG_MEDIA_BUCKET", "");
    expect(vlogMediaConfig()).toBeNull();
    expect(vlogMediaConfigured()).toBe(false);
  });

  it("treats the placeholder as no bucket", () => {
    vi.stubEnv("VLOG_MEDIA_BUCKET", "not-provisioned-yet");
    expect(vlogMediaConfigured()).toBe(false);
  });

  it("reads the bucket, defaulting the region", () => {
    vi.stubEnv("VLOG_MEDIA_BUCKET", " my-bucket ");
    vi.stubEnv("AWS_REGION", "");
    expect(vlogMediaConfig()).toEqual({ bucket: "my-bucket", region: "us-east-1" });
  });
});

describe("vlogObjectKey", () => {
  it("namespaces by athlete and keeps the extension", () => {
    expect(vlogObjectKey(7, "video/mp4")).toMatch(/^vlog\/7\/[0-9a-f-]{36}\.mp4$/);
    expect(vlogObjectKey(7, "video/quicktime")).toMatch(/\.mov$/);
  });

  it("refuses other types", () => {
    expect(vlogObjectKey(7, "application/pdf")).toBeNull();
  });
});
