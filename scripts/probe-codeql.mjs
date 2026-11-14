// Probe for IS #294, never merged: query input reaches eval (js/code-injection).
import http from "node:http";

http
  .createServer((req, res) => {
    const code = new URL(req.url, "http://localhost").searchParams.get("x");
    res.end(String(eval(code)));
  })
  .listen(0);
