/**
 * A minimal S3-compatible server for tests.
 *
 * Implements just enough of the object API for the storage driver —
 * PUT/GET/HEAD/DELETE on /:bucket/:key — so the driver is exercised over real
 * HTTP with the real AWS SDK (signing, path-style addressing, prefixes and
 * content types all included) without needing Docker or a network bucket.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeS3 {
  url: string;
  objects: Map<string, { body: Buffer; contentType: string }>;
  close: () => Promise<void>;
}

export async function startFakeS3(bucket: string): Promise<FakeS3> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const [requestBucket, ...rest] = pathname.split("/");
    const key = rest.join("/");

    if (requestBucket !== bucket || !key) {
      res.writeHead(404).end();
      return;
    }

    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers["content-type"] ?? "application/octet-stream",
        });
        res.writeHead(200, { ETag: '"fake"' }).end();
      });
      return;
    }

    const object = objects.get(key);

    if (req.method === "HEAD") {
      if (!object) {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, {
          "Content-Type": object.contentType,
          "Content-Length": String(object.body.length),
        })
        .end();
      return;
    }

    if (req.method === "GET") {
      if (!object) {
        // The SDK maps this error code to a NoSuchKey exception.
        res
          .writeHead(404, { "Content-Type": "application/xml" })
          .end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      res
        .writeHead(200, {
          "Content-Type": object.contentType,
          "Content-Length": String(object.body.length),
        })
        .end(object.body);
      return;
    }

    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }

    res.writeHead(405).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    objects,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
