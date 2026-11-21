"""Competitors stage: queries Shopify's stateless MCP catalog search for real competing products."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from pipeline.context import Emit, RunContext

SHOPIFY_MCP_URL = "https://mcp.shop.com"
MCP_PROTOCOL_VERSION = "2026-07-28"
MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    "Mcp-Method": "tools/call",
    "Mcp-Name": "search_catalog",
}

TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", text)).strip()


def _parse_mcp_response(body: str) -> dict[str, Any]:
    stripped = body.strip()
    if not stripped:
        raise ValueError("Empty response from Shopify MCP")

    if stripped.startswith("{"):
        return json.loads(stripped)

    parsed_payloads: list[dict[str, Any]] = []
    for line in stripped.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            obj = json.loads(payload)
            if isinstance(obj, dict):
                parsed_payloads.append(obj)
        except json.JSONDecodeError:
            continue

    for obj in reversed(parsed_payloads):
        if "result" in obj or "error" in obj:
            return obj
    if parsed_payloads:
        return parsed_payloads[-1]

    raise ValueError("Could not parse JSON-RPC payload from Shopify MCP response")


def _extract_products(rpc: dict[str, Any]) -> list[dict[str, Any]]:
    if "error" in rpc and rpc["error"]:
        err = rpc["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise RuntimeError(f"Shopify MCP error: {msg}")

    result = rpc.get("result")
    if not isinstance(result, dict):
        return []

    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        products = structured.get("products")
        if isinstance(products, list):
            return [p for p in products if isinstance(p, dict)]

    # Fallback: some MCP responses serialize structured payloads inside content[].text
    content = result.get("content")
    if isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            text = block.get("text")
            if isinstance(text, str) and text.strip().startswith("{"):
                try:
                    data = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict) and isinstance(data.get("products"), list):
                    return [p for p in data["products"] if isinstance(p, dict)]

    return []


def _parse_price_value(val: Any, key_hint: str = "") -> float | None:
    if val is None or isinstance(val, bool):
        return None

    if isinstance(val, int):
        if val <= 0:
            return None
        # Minor units (cents) are integers like 4999 or 1500; divide by 100
        if val >= 100 or "cent" in key_hint or "minor" in key_hint:
            return round(val / 100.0, 2)
        return float(val)

    if isinstance(val, float):
        return round(val, 2) if val > 0 else None

    if isinstance(val, str):
        cleaned = re.sub(r"[^0-9.]", "", val)
        if not cleaned:
            return None
        try:
            num = float(cleaned)
        except ValueError:
            return None
        if num <= 0:
            return None
        if "." not in cleaned and ("cent" in key_hint or "minor" in key_hint):
            return round(num / 100.0, 2)
        return round(num, 2)

    if isinstance(val, dict):
        for sub_key in (
            "min",
            "minVariantPrice",
            "min_variant_price",
            "min_price",
            "amount",
            "value",
            "price",
            "max",
            "maxVariantPrice",
            "max_variant_price",
            "max_price",
        ):
            if sub_key in val:
                parsed = _parse_price_value(val[sub_key], sub_key.lower())
                if parsed is not None:
                    return parsed

    return None


def _extract_price_usd(product: dict[str, Any]) -> float | None:
    for key in ("price_range", "priceRange", "price"):
        if key in product:
            parsed = _parse_price_value(product[key], key.lower())
            if parsed is not None:
                return parsed

    for list_key in ("variants", "offers"):
        items = product.get(list_key)
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                for key in ("price_range", "priceRange", "price"):
                    if key in item:
                        parsed = _parse_price_value(item[key], key.lower())
                        if parsed is not None:
                            return parsed
    return None


def _extract_url_from_obj(val: Any) -> str | None:
    if isinstance(val, str):
        s = val.strip()
        return s if s else None
    if isinstance(val, dict):
        for key in ("url", "src", "image_url", "imageUrl", "href"):
            u = val.get(key)
            if isinstance(u, str) and u.strip():
                return u.strip()
    if isinstance(val, list):
        for item in val:
            u = _extract_url_from_obj(item)
            if u:
                return u
    return None


def _extract_image_url(product: dict[str, Any]) -> str | None:
    for key in ("image_url", "imageUrl", "featured_image", "featuredImage", "image", "images", "media"):
        if key in product:
            u = _extract_url_from_obj(product[key])
            if u:
                return u

    variants = product.get("variants")
    if isinstance(variants, list):
        for variant in variants:
            if isinstance(variant, dict):
                for key in ("image_url", "imageUrl", "image", "featured_image"):
                    u = _extract_url_from_obj(variant.get(key))
                    if u:
                        return u
    return None


def _extract_product_url(product: dict[str, Any]) -> str | None:
    for key in (
        "url",
        "product_url",
        "productUrl",
        "online_store_url",
        "onlineStoreUrl",
        "shop_url",
        "shopUrl",
        "permalink",
        "href",
        "link",
    ):
        u = _extract_url_from_obj(product.get(key))
        if u:
            return u
    return None


def _map_product(product: dict[str, Any]) -> dict[str, Any] | None:
    raw_title = product.get("title")
    if isinstance(raw_title, dict):
        raw_title = raw_title.get("plain") or raw_title.get("text")
    title = _strip_html(str(raw_title or ""))
    if not title:
        return None

    return {
        "title": title,
        "price_usd": _extract_price_usd(product),
        "image_url": _extract_image_url(product),
        "url": _extract_product_url(product),
    }


async def run(ctx: RunContext, emit: Emit) -> None:
    pitch = ctx.pitch or {}
    query = str(pitch.get("one_liner") or pitch.get("title") or "").strip()
    if not query:
        ctx.competitors = []
        await emit("competitors", "boardroom", {"items": []})
        return

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
                "io.modelcontextprotocol/clientCapabilities": {},
            },
            "name": "search_catalog",
            "arguments": {
                "catalog": {
                    "query": query,
                    "pagination": {"limit": 5},
                }
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            resp = await http.post(SHOPIFY_MCP_URL, headers=MCP_HEADERS, json=payload)
            resp.raise_for_status()
            rpc = _parse_mcp_response(resp.text)

        products = _extract_products(rpc)
        if products:
            print(f"[competitors] first product keys: {list(products[0].keys())}")

        items: list[dict[str, Any]] = []
        for product in products:
            mapped = _map_product(product)
            if mapped is not None:
                items.append(mapped)
                if len(items) >= 3:
                    break

        ctx.competitors = items
        await emit("competitors", "boardroom", {"items": items})
    except Exception as exc:  # noqa: BLE001
        ctx.competitors = []
        await emit(
            "error",
            "boardroom",
            {
                "message": f"Shopify competitor search failed ({type(exc).__name__})",
                "recoverable": True,
            },
        )
        await emit("competitors", "boardroom", {"items": []})
