import { createServer } from 'node:http'

/** The tool's answer: no model could guess it, so seeing it proves the tool really ran. */
export const SECRET = 'pineapple-4217'

/**
 * A minimal but real MCP server (Streamable HTTP, plain JSON replies) with one
 * tool, run inside the test process. Records the methods it was asked for.
 */
export async function startMcpServer(port: number): Promise<{ calls: string[]; close: () => Promise<void> }> {
  const calls: string[] = []
  const server = createServer((request, response) => {
    if (request.method !== 'POST') return void response.writeHead(405).end() // no server-to-client stream needed
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      const message = JSON.parse(body) as { id?: number | string; method: string; params?: { protocolVersion?: string } }
      calls.push(message.method)
      if (message.id === undefined) return void response.writeHead(202).end() // a notification
      const results: Record<string, unknown> = {
        initialize: { protocolVersion: message.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'localtest', version: '1.0.0' } },
        ping: {},
        'tools/list': { tools: [{ name: 'secret_word', description: "Return today's secret word.", inputSchema: { type: 'object', properties: {} } }] },
        'tools/call': { content: [{ type: 'text', text: SECRET }] },
      }
      const reply = message.method in results
        ? { jsonrpc: '2.0', id: message.id, result: results[message.method] }
        : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Unknown method ${message.method}` } }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply))
    })
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return { calls, close: () => new Promise((resolve) => server.close(() => resolve())) }
}
