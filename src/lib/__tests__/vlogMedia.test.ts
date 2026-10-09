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

  it("carries a local endpoint (MinIO) when one is set, and omits it otherwise", () => {
    vi.stubEnv("VLOG_MEDIA_BUCKET", "dev");
    vi.stubEnv("VLOG_MEDIA_ENDPOINT", "http://localhost:9000");
    expect(vlogMediaConfig()?.endpoint).toBe("http://localhost:9000");
    vi.stubEnv("VLOG_MEDIA_ENDPOINT", "");
    expect(vlogMediaConfig()).not.toHaveProperty("endpoint");
  });
});

describe("vlogObjectKey", () => {
  it("namespaces by athlete and keeps the extension", () => {
    expect(vlogObjectKey("a1", "video/mp4")).toMatch(/^vlog\/a1\/[0-9a-f-]{36}\.mp4$/);
    expect(vlogObjectKey("a1", "video/quicktime")).toMatch(/\.mov$/);
  });

  it("refuses other types", () => {
    expect(vlogObjectKey("a1", "application/pdf")).toBeNull();
  });
});
