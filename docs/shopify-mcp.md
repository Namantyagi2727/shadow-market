# Shopify catalog search (verified 2026-11-21, 11:55 AM)

Endpoint: `https://mcp.shop.com` (no API key for catalog search). It speaks the **stateless MCP 2026-07-28** protocol. No `initialize` handshake: every request needs these headers **and** a `_meta` block in `params`, or it returns -32020 / -32602 errors.

```bash
curl -s -X POST https://mcp.shop.com \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: search_catalog' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
        "_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28",
                 "io.modelcontextprotocol/clientCapabilities":{}},
        "name":"search_catalog",
        "arguments":{"catalog":{"query":"portable travel espresso maker","pagination":{"limit":3}}}}}'
```

- The response may come back as an SSE `data: ` line; strip that prefix before parsing JSON.
- Result: `result.structuredContent` → `{"ucp":{"version":"2026-08-25"},"products":[{id,title,description:{plain},...}]}`. Description is HTML; strip tags before showing.
- Other tools on the server: `lookup_catalog`, `get_product`, cart and checkout tools. **We only call `search_catalog` / `get_product`.** Never call checkout, cart or spend tools.
- In Python, plain `httpx` with the request above is simpler than an MCP SDK (older SDKs speak an older protocol version and get rejected).
