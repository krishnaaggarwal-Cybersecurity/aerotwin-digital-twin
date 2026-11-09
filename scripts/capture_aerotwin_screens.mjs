import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const work = path.join(root, 'scripts', 'walkthrough-work')
const profile = path.join(work, 'edge-profile')
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const appUrl = process.env.AEROTWIN_CAPTURE_URL || 'http://127.0.0.1:5193/#/dashboard'
const captures = [
  { file: 'live-dashboard.jpg', route: '/dashboard', title: 'Dashboard', wait: 1800 },
  { file: 'live-telemetry.jpg', route: '/telemetry', title: 'Telemetry', wait: 700 },
  { file: 'live-prediction.jpg', route: '/prediction', title: 'Fault Prediction', wait: 900 },
  { file: 'live-digital-twin.jpg', route: '/digital-twin', title: 'Digital Twin', wait: 6500 },
  { file: 'live-mission.jpg', route: '/mission', title: 'Mission Reliability', wait: 700 },
  { file: 'live-fleet.jpg', route: '/fleet', title: 'Fleet', wait: 800 },
  { file: 'live-uav.jpg', route: '/uav', title: 'Virtual UAV', wait: 800 },
  { file: 'live-data-lab.jpg', route: '/data-lab', title: 'Data Lab', wait: 500 },
  { file: 'live-assistant.jpg', route: '/assistant', title: 'AI Assistant', wait: 500 },
]

async function availablePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

class Cdp {
  constructor(webSocketUrl) {
    this.nextId = 0
    this.pending = new Map()
    this.socket = new WebSocket(webSocketUrl)
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const request = this.pending.get(message.id)
      if (!request) return
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
  }

  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
    this.socket.send(JSON.stringify({ id, method, params }))
    return result
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Browser evaluation failed')
    }
    return response.result?.value
  }

  close() {
    this.socket.close()
  }
}

async function waitForDevTools(port, process) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`
  for (let attempt = 0; attempt < 80; attempt++) {
    if (process.exitCode !== null) throw new Error(`Edge exited with status ${process.exitCode}`)
    try {
      const response = await fetch(versionUrl)
      if (response.ok) return response.json()
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Edge DevTools')
}

async function main() {
  await mkdir(work, { recursive: true })
  const port = await availablePort()
  const browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    appUrl,
  ], { stdio: 'ignore', windowsHide: true })

  let cdp
  let browserCdp
  try {
    const version = await waitForDevTools(port, browser)
    browserCdp = new Cdp(version.webSocketDebuggerUrl)
    await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'deny' })
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/list`)
    const targets = await targetResponse.json()
    const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
    if (!page) throw new Error('Edge did not open a browser page')
    cdp = new Cdp(page.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await delay(2500)
    console.log(`Capturing from ${await cdp.evaluate('location.href')}`)

    for (const capture of captures) {
      await cdp.evaluate(`(() => {
        history.pushState({}, '', ${JSON.stringify(`#${capture.route}`)});
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.scrollTo(0, 0);
      })()`)
      await delay(capture.wait)
      const state = await cdp.evaluate(`(() => {
        return document.querySelector('main h1')?.innerText || '';
      })()`)
      const title = state
      if (title !== capture.title) throw new Error(`Expected ${capture.title} at ${capture.route}, captured ${title || 'an empty page'}`)
      const twinState = capture.route === '/digital-twin'
        ? await cdp.evaluate(`(() => ({ canvas: Boolean(document.querySelector('canvas')), labels: document.querySelectorAll('.engine-viewer-hud').length }))()`)
        : null
      if (twinState && (!twinState.canvas || !twinState.labels)) {
        throw new Error(`Digital Twin 3D viewer did not render: ${JSON.stringify(twinState)}`)
      }
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 91, fromSurface: true })
      await writeFile(path.join(work, capture.file), Buffer.from(screenshot.data, 'base64'))
      console.log(`${capture.file}: ${title} (${capture.route})${twinState ? ` · 3D canvas ${twinState.canvas ? 'ready' : 'missing'}` : ''}`)
    }

    await cdp.evaluate(`(() => {
      history.pushState({}, '', '#/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    })()`)
    await delay(600)
    const sosState = await cdp.evaluate(`(async () => {
      const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Preview SOS drill');
      if (!button) return { error: 'SOS drill button not found' };
      button.scrollIntoView({ block: 'center', behavior: 'instant' });
      button.click();
      await new Promise(resolve => setTimeout(resolve, 150));
      const preview = document.querySelector('.sos-preview');
      if (!preview) return { error: 'SOS drill preview did not open' };
      preview.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 150));
      const rect = preview.getBoundingClientRect();
      return { path: location.hash, label: button.innerText.trim(), top: Math.round(rect.top), bottom: Math.round(rect.bottom), text: preview.innerText };
    })()`)
    if (sosState?.error) throw new Error(sosState.error)
    if (sosState.top < 0 || sosState.bottom > 720 || !sosState.text.includes('SIMULATED INCIDENT BRIEF')) {
      throw new Error(`SOS drill is not fully visible in capture: ${JSON.stringify(sosState)}`)
    }
    const sosScreenshot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 91, fromSurface: true })
    await writeFile(path.join(work, 'live-sos-drill.jpg'), Buffer.from(sosScreenshot.data, 'base64'))
    console.log(`live-sos-drill.jpg: ${sosState.path} · verified preview visible`)

    await cdp.evaluate(`(() => {
      history.pushState({}, '', '#/assistant');
      window.dispatchEvent(new PopStateEvent('popstate'));
    })()`)
    await delay(700)
    const answerState = await cdp.evaluate(`(() => {
      const input = document.querySelector('textarea[aria-label="Ask about current engine data"]');
      if (!input) return { error: 'Assistant input not found' };
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setValue.call(input, 'What is the current engine health and mission reliability?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.assistant-input button[type="submit"]')?.click();
      return { submitted: true };
    })()`)
    if (answerState?.error) throw new Error(answerState.error)
    await delay(700)
    const assistantScreenshot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 91, fromSurface: true })
    await writeFile(path.join(work, 'live-assistant-answer.jpg'), Buffer.from(assistantScreenshot.data, 'base64'))
    console.log('live-assistant-answer.jpg: actual browser assistant response')
  } finally {
    cdp?.close()
    await browserCdp?.send('Browser.close').catch(() => undefined)
    browserCdp?.close()
    browser.kill()
    await delay(500)
    await rm(profile, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
