#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args.splice(portIndex, 2)[1]) : 9223;
const command = args.shift() ?? 'snapshot';
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find(
  (candidate) =>
    candidate.type === 'page' && !candidate.url.startsWith('devtools://'),
);

if (!target?.webSocketDebuggerUrl) {
  throw new Error(`No Electron renderer target is available on port ${port}.`);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);

  if (!request) {
    return;
  }

  pending.delete(message.id);

  if (message.error) {
    request.reject(new Error(message.error.message));
  } else {
    request.resolve(message.result);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId;

  nextId += 1;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }

  return result.result?.value;
}

if (command === 'snapshot') {
  const snapshot = await evaluate(`(() => ({
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      scrollX,
      scrollY,
    },
    controls: [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .slice(0, 100)
      .map((element) => ({
        tag: element.tagName,
        text: (element.textContent ?? '').replace(/\\s+/g, ' ').trim(),
        aria: element.getAttribute('aria-label'),
        role: element.getAttribute('role'),
      })),
    text: (document.body.innerText ?? '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 10000),
  }))()`);

  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} else if (command === 'screenshot') {
  const destination = path.resolve(args[0]);
  const width = Number(args[1] ?? 1225);
  const height = Number(args[2] ?? 768);

  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const result = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(result.data, 'base64'));
  process.stdout.write(`${destination}\n`);
} else if (command === 'click') {
  const label = args.join(' ');
  const result = await evaluate(`(() => {
    const label = ${JSON.stringify(label)}.toLocaleLowerCase();
    const candidates = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
    const element = candidates.find((candidate) => {
      const text = [candidate.textContent, candidate.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
      return text === label;
    }) ?? candidates.find((candidate) => {
      const text = [candidate.textContent, candidate.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
      return text.includes(label);
    });

    if (!element) {
      return { clicked: false };
    }

    element.click();
    return {
      clicked: true,
      text: (element.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      aria: element.getAttribute('aria-label'),
    };
  })()`);

  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === 'eval') {
  const result = await evaluate(args.join(' '));

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === 'wait') {
  await new Promise((resolve) => setTimeout(resolve, Number(args[0] ?? 500)));
} else {
  throw new Error(`Unknown command: ${command}`);
}

socket.close();
