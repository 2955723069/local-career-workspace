import { describe, expect, it, vi } from "vitest";

import { OpenAiClient } from "../../src/ai/client";

describe("OpenAI compatible client", () => {
  it("probes models without a request body and sends auth headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const client = new OpenAiClient(
      {
        apiUrl: "https://api.example.test/v1",
        model: "gpt-test",
        apiKey: "secret-key",
        organizationId: "org-test",
        customHeaders: { "X-Test": "yes" },
      },
      fetchMock,
    );

    await client.testConnection();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/models",
      expect.objectContaining({ method: "GET", body: undefined }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
          "OpenAI-Organization": "org-test",
          "X-Test": "yes",
        }),
      }),
    );
  });

  it("does not call fetch when configuration is missing or invalid", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      new OpenAiClient(
        { apiUrl: "", model: "gpt", apiKey: "", organizationId: "", customHeaders: {} },
        fetchMock,
      ).testConnection(),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts and reports a timeout when the request hangs", async () => {
    const hangingFetch = vi.fn<typeof fetch>((_, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const client = new OpenAiClient(
      { apiUrl: "https://api.example.test/v1", model: "gpt-test", apiKey: "secret-key", organizationId: "", customHeaders: {} },
      { fetch: hangingFetch, timeoutMs: 10 },
    );
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/timed out/i);
    expect(hangingFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
