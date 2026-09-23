#!/usr/bin/env python3
"""One-shot HTTP client for the FusionSolar widget.

Qt's QML XMLHttpRequest hides Set-Cookie and cannot attach a Cookie header.
This helper performs a single request and prints status, headers and body as JSON.
Redirects are not followed; the widget decides whether to request the next URL.
"""

import base64
import json
import sys
from http.client import HTTPConnection, HTTPSConnection
from urllib.parse import urlparse


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=True)
    sys.stdout.write("\n")


def fail(message):
    emit({
        "status": 0,
        "error": message,
        "location": "",
        "setCookies": [],
        "headerMap": {},
        "body": "",
    })


def main():
    if len(sys.argv) < 2:
        fail("Missing request payload")
        return 0

    try:
        raw = base64.b64decode(sys.argv[1])
        request = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        fail("Could not read request: %s" % exc)
        return 0

    url = urlparse(str(request.get("url") or ""))
    if url.scheme not in ("http", "https") or not url.hostname:
        fail("Unsupported URL")
        return 0

    method = str(request.get("method") or "GET").upper()
    headers = request.get("headers") or {}
    if not isinstance(headers, dict):
        headers = {}
    clean_headers = {}
    for key, value in headers.items():
        if value is None:
            continue
        clean_headers[str(key)] = str(value)
    clean_headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )

    body = request.get("body")
    data = None
    if body is not None:
        data = body.encode("utf-8") if isinstance(body, str) else json.dumps(body).encode("utf-8")

    path = url.path or "/"
    if url.query:
        path += "?" + url.query

    timeout = request.get("timeout") or 25
    try:
        timeout = float(timeout)
    except (TypeError, ValueError):
        timeout = 25

    port = url.port or (443 if url.scheme == "https" else 80)
    connection_class = HTTPSConnection if url.scheme == "https" else HTTPConnection
    connection = connection_class(url.hostname, port, timeout=timeout)
    try:
        connection.request(method, path, body=data, headers=clean_headers)
        response = connection.getresponse()
        payload = response.read()
        header_map = {}
        set_cookies = []
        for key, value in response.getheaders():
            lowered = key.lower()
            header_map[lowered] = value
            if lowered == "set-cookie":
                set_cookies.append(value)
        text = payload.decode("utf-8", errors="replace")
        emit({
            "status": response.status,
            "error": "",
            "location": header_map.get("location", ""),
            "setCookies": set_cookies,
            "headerMap": header_map,
            "body": text,
        })
    except Exception as exc:
        fail(str(exc))
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        fail(str(exc))
        sys.exit(0)
