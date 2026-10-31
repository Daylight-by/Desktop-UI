// Local validation helper. Requires a temporary WebView2 debugging port.
const port = Number(process.env.LITE_DEBUG_PORT || 9225);
async function main() {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  if (!process.argv[2]) {
    console.log(JSON.stringify(pages.map(({ id, title, url }) => ({ id, title, url }))));
    return;
  }
  const widget = process.env.LITE_DEBUG_WIDGET || 'weg';
  const page = pages.find((page) => page.url.includes(`/${widget}/`) || page.url.endsWith(`/${widget}`));
  if (!page) throw new Error('Dock WebView was not found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function request(method, params) { return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Runtime evaluation timed out')), 15000);
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      if (message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.result.exceptionDetails)));
      else if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    socket.send(JSON.stringify({ id: 1, method, params }));
  }); }
  try {
    if (process.argv[2] === '--cdp') {
      const call = JSON.parse(process.argv[3]);
      console.log(JSON.stringify(await request(call.method, call.params)));
    } else if (process.argv[2] === '--screenshot') {
      const region = await request('Runtime.evaluate', { expression: `(()=>{const e=document.querySelector('.qq-island');if(!e)throw Error('Island hidden');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`, returnByValue: true });
      const shot = await request('Page.captureScreenshot', { format: 'png', clip: region.result.value });
      const path = require('node:path').resolve('island-preview.png');
      require('node:fs').writeFileSync(path, Buffer.from(shot.data, 'base64'));
      console.log(path);
    } else {
      const result = await request('Runtime.evaluate', { expression: process.argv[2], awaitPromise: true, returnByValue: true });
      console.log(JSON.stringify(result.result?.value));
    }
  } finally { socket.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
