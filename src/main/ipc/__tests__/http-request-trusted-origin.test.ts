import { afterEach, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { httpRequest } from '../http-request';

// Regresja: dostęp do sieci prywatnej musi być związany z ORIGINEM zaufanym, a nie
// samą flagą `allowPrivateNetwork`. Bez tego przejęty renderer mógł podać flagę
// zaufanego źródła i wskazać loopback/metadata (`http://169.254.169.254/...`).

const servers: http.Server[] = [];

function startServer(): Promise<string> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('httpRequest private-network trust is origin-bound', () => {
  it('allows a private target only for its own trusted origin', async () => {
    const origin = await startServer();
    const result = await httpRequest(`${origin}/api`, {
      allowPrivateNetwork: true,
      trustedOrigin: origin
    });
    expect(result.status).toBe(200);
  });

  it('rejects a private target when the trusted origin differs', async () => {
    const origin = await startServer();
    await expect(
      httpRequest(`${origin}/api`, {
        allowPrivateNetwork: true,
        trustedOrigin: 'https://public.example'
      })
    ).rejects.toThrow('Private network address is not allowed');
  });
});
