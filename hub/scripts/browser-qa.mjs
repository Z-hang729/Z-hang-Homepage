import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const origin = process.env.QA_URL || "http://127.0.0.1:4322";
const base = (process.env.SITE_BASE_PATH || "/").replace(/\/$/, "");
const root = path.resolve(".local/qa");
mkdirSync(root, { recursive: true });
const browser =
  process.env.BROWSER_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find(existsSync);
if (!browser)
  throw Error("Set BROWSER_PATH to a Chrome or Chromium executable.");
const child = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=9236",
    `--user-data-dir=${path.join(root, "browser")}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let adminRestore;
try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9236/json/list")).json();
      if (targets.length) break;
    } catch {}
    await pause(200);
  }
  if (!targets?.length) throw Error("Browser debugging unavailable");
  socket = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let serial = 0;
  const pending = new Map(),
    errors = [],
    badResponses = [];
  socket.onmessage = (e) => {
    const value = JSON.parse(e.data);
    if (value.id) {
      const p = pending.get(value.id);
      if (!p) return;
      pending.delete(value.id);
      value.error
        ? p.reject(Error(value.error.message))
        : p.resolve(value.result);
    } else if (value.method === "Runtime.exceptionThrown")
      errors.push(value.params.exceptionDetails);
    else if (
      value.method === "Runtime.consoleAPICalled" &&
      value.params.type === "error"
    )
      errors.push(value.params.args.map((a) => a.value || a.description));
    else if (
      value.method === "Network.responseReceived" &&
      value.params.response.status >= 400
    )
      badResponses.push({
        url: value.params.response.url,
        status: value.params.response.status,
      });
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error("Condition timed out: " + expression);
  };
  const go = async (route) => {
    await call("Page.navigate", { url: origin + base + route });
    await until(
      "document.readyState==='complete' && !!document.querySelector('main')",
    );
    await pause(200);
  };
  const screenshot = async (name, full = true) => {
    const result = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: full,
    });
    writeFileSync(
      path.join(root, name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/");
  await evaluate(
    "localStorage.setItem('zh-theme','light');document.documentElement.dataset.theme='light'",
  );
  await screenshot("home-desktop");
  await screenshot("home-viewport", false);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await evaluate("document.querySelector('.theme-toggle').click()");
  assert.equal(
    await evaluate("document.documentElement.dataset.theme"),
    "dark",
  );
  await screenshot("home-dark");
  await call("Page.reload");
  await until(
    "document.readyState==='complete' && document.documentElement.dataset.theme==='dark'",
  );
  await evaluate("document.querySelector('.theme-toggle').click()");
  await evaluate("document.querySelector('[data-search-open]').click()");
  await until("!!document.querySelector('.pagefind-ui__search-input')");
  await evaluate(
    "(()=>{const input=document.querySelector('.pagefind-ui__search-input');input.value='plasma';input.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await until("document.querySelectorAll('.pagefind-ui__result').length>0");
  await screenshot("search");
  await evaluate("document.querySelector('[data-search-close]').click()");
  await go("/research/");
  await evaluate("document.querySelector('[data-view=timeline]').click()");
  assert.equal(
    await evaluate("document.querySelector('[data-cards]').dataset.layout"),
    "timeline",
  );
  await evaluate(
    "(()=>{const f=document.querySelector('[data-filter=title]');f.value='nonexistent-xyz';f.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  assert.equal(
    await evaluate("document.querySelector('[data-empty]').hidden"),
    false,
  );
  await go("/notes/space-plasma-physics/");
  await until("document.querySelector('.katex')");
  await until("document.querySelector('.mermaid svg .node') && document.querySelector('.mermaid svg').textContent.includes('Physical question')");
  await pause(250);
  await screenshot("note-desktop");
  await go("/admin/");
  assert.equal(
    await evaluate("document.querySelector('[data-admin-root]').dataset.local"),
    "false",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await go("/");
  await screenshot("home-mobile");
  await screenshot("home-mobile-viewport", false);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
    "Homepage mobile overflow",
  );
  await evaluate("document.querySelector('.menu-toggle').click()");
  assert.equal(
    await evaluate(
      "document.querySelector('.menu-toggle').getAttribute('aria-expanded')",
    ),
    "true",
  );
  await screenshot("mobile-menu");
  for (const route of [
    "/research/",
    "/notes/",
    "/projects/",
    "/about/",
    "/cv/",
    "/publications/",
    "/notes/space-plasma-physics/",
    "/research/tio-image-alignment/",
    "/admin/",
  ]) {
    await go(route);
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
      "Mobile overflow at " + route,
    );
  }
  await go("/notes/space-plasma-physics/");
  assert.equal(
    await evaluate("document.querySelector('[data-toc]').open"),
    false,
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.pdf-preview')).display==='none'",
    ),
    true,
  );
  await screenshot("note-mobile");
  const pdf = await fetch(origin + base + "/documents/demo-handout.pdf");
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") || "", /pdf/);
  const pdfBody = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBody.subarray(0, 5).toString(), "%PDF-");
  for(const width of [1280,768,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=768});
    for(const route of ['/','/research/','/notes/space-plasma-physics/']) {
      await go(route);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${width}px overflow at ${route}`);
    }
  }
  if (process.env.QA_ADMIN_URL) {
    const adminOrigin = process.env.QA_ADMIN_URL;
    const request = async (route, body, token) => {
      const [endpoint,query]=route.split('?');
      const response = await fetch(adminOrigin + '/api/local-admin/' + endpoint + '/' + (query?'?'+query:''), {
        method: body ? 'POST' : 'GET',
        headers: body ? {'Origin':adminOrigin,'Content-Type':'application/json','X-Local-Admin-Token':token} : {},
        body:body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.ok,true,`Local admin ${route}: ${response.status}`);
      return response.json();
    };
    const {csrfToken}=await request('session');
    const original=await request('file?path=src%2Fdata%2Fprofile.yaml');
    adminRestore=async()=>{const latest=await request('file?path=src%2Fdata%2Fprofile.yaml');await request('save',{path:original.path,content:original.content,revision:latest.revision},csrfToken)};
    await call('Page.navigate',{url:adminOrigin+'/admin/'});
    await until("document.querySelectorAll('#admin-files button').length>0");
    await evaluate("document.querySelector('#admin-files button[data-path=\"src/data/profile.yaml\"]').click()");
    await until("document.querySelector('#admin-content').value.includes('displayName:')");
    await evaluate("(()=>{const el=document.querySelector('#admin-content');el.value=el.value.replace(/^tagline:.*$/m,'tagline: Browser verified profile update');document.querySelector('#admin-save').click()})()");
    for(let i=0;i<40;i++){if((await(await fetch(adminOrigin+'/')).text()).includes('Browser verified profile update'))break;await pause(200);if(i===39)throw Error('Saved profile was not reflected on the homepage')}
    await screenshot('admin-mobile');
    await adminRestore();adminRestore=undefined;
    await call('Page.navigate',{url:adminOrigin+'/admin/'});
    await until("document.querySelectorAll('#admin-files button').length>0");
  }
  assert.deepEqual(errors, [], "Browser console errors");
  assert.deepEqual(badResponses, [], "Failed browser requests");
  const summary = {
    passed: [
      "desktop and mobile pages",
      "theme and persistence",
      "Pagefind full-text search",
      "archive filters and timeline",
      "KaTeX",
      "Mermaid",
      "mobile menu and collapsed TOC",
      "PDF access",
      "public admin read-only",
      "no console errors or failed requests",
    ],
    screenshots: root,
  };
  if(process.env.QA_ADMIN_URL) summary.passed.push('local profile save, homepage update, and original content restored');
  summary.passed.push('laptop, tablet, and 320 px narrow-mobile layouts');
  writeFileSync(
    path.join(root, "results.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (adminRestore) await adminRestore();
  socket?.close();
  child.kill();
}
