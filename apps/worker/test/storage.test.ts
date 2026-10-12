import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { configProblems, loadEnv } from "../src/env";
import { createStorage, s3Key } from "../src/storage";

const s3 = mockClient(S3Client);
const base = { DATABASE_URL: "postgres://x", AI_PROVIDER: "fake", APP_ORIGIN: "https://web.example/" };

beforeEach(() => s3.reset());

describe("s3 storage", () => {
  it("puts and gets objects under <bucket>/<path> and serves media via the web app", async () => {
    const env = loadEnv({ ...base, S3_ENDPOINT: "https://s3.example", S3_BUCKET: "b1", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" });
    expect(env.STORAGE_DRIVER).toBe("s3");
    const storage = createStorage(env);
    s3.on(PutObjectCommand).resolves({});
    await storage.put("site-media", "p1/a.webp", Buffer.from("img"), "image/webp");
    const put = s3.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(put).toMatchObject({ Bucket: "b1", Key: "site-media/p1/a.webp", ContentType: "image/webp" });

    s3.on(GetObjectCommand, { Bucket: "b1", Key: "screens/p1/x.jpg" }).resolves({ Body: { transformToByteArray: async () => new Uint8Array(Buffer.from("jpg")) } as any });
    expect((await storage.get("screens", "p1/x.jpg")).toString()).toBe("jpg");
    expect(storage.publicUrl("site-media", "p1/a.webp")).toBe("https://web.example/storage/site-media/p1/a.webp");
  });

  it("rejects path traversal", () => {
    expect(() => s3Key("site-media", "../screens/x")).toThrow();
    expect(() => s3Key("site-media", "a//b")).toThrow();
  });

  it("accepts the AWS-style variable names of a Railway bucket", () => {
    const env = loadEnv({ ...base, AWS_ENDPOINT_URL: "https://s3.example", AWS_S3_BUCKET_NAME: "b2", AWS_ACCESS_KEY_ID: "k", AWS_SECRET_ACCESS_KEY: "s", AWS_DEFAULT_REGION: "eu" });
    expect(env).toMatchObject({ STORAGE_DRIVER: "s3", S3_BUCKET: "b2", S3_REGION: "eu" });
  });
});

describe("worker env", () => {
  it("lists missing variables by name for a Railway deploy", () => {
    expect(configProblems({ RAILWAY_ENVIRONMENT: "production", STORAGE_DRIVER: "s3" })).toEqual([
      "DATABASE_URL",
      expect.stringContaining("APP_ORIGIN"),
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "ANTHROPIC_API_KEY",
    ]);
  });

  it("uses Railway's PORT for the health endpoint", () => {
    expect(loadEnv({ ...base, PORT: "7777" }).WORKER_PORT).toBe(7777);
  });
});
