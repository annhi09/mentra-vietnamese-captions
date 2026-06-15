import 'dotenv/config';
import { AppServer, AppSession, ViewType } from '@mentra/sdk';
import type { Response } from 'express';
import {
  containsVietnameseCharacters,
  getVietnameseDisplayText,
  parseVietnameseDisplayMode,
  type VietnameseDisplayMode,
} from './utils/vietnamese';


const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');
const vietnameseDisplayMode = parseVietnameseDisplayMode(process.env.VIETNAMESE_DISPLAY_MODE);
const MAX_TRANSCRIPT_LINES = 200;

type TranscriptLogEntry = {
  id: string;
  originalText: string;
  displayText: string;
  isFinal: boolean;
  containsVietnamese: boolean;
  vietnameseDisplayMode: VietnameseDisplayMode;
  language?: unknown;
  timestamp: string;
};

class VietnameseSafeCaptionsApp extends AppServer {
  private readonly transcriptLog: TranscriptLogEntry[] = [];
  private readonly browserClients = new Set<Response>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    this.setupTranscriptRoutes();
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Vietnamese Safe Captions is ready.");

    // Handle real-time transcription
    // requires microphone permission to be set in the developer console
    session.events.onTranscription((data) => {
      const originalText = data.text;
      const displayText = getVietnameseDisplayText(originalText, vietnameseDisplayMode);
      const metadata = data as unknown as Record<string, unknown>;
      const language = metadata.language ?? metadata.detectedLanguage ?? metadata.locale;
      const containsVietnamese = containsVietnameseCharacters(originalText);

      const logEntry: TranscriptLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalText,
        displayText,
        isFinal: data.isFinal,
        containsVietnamese,
        vietnameseDisplayMode,
        language,
        timestamp: new Date().toISOString(),
      };

      this.addTranscriptEntry(logEntry);

      console.log("Transcript received", {
        originalTranscript: originalText,
        convertedDisplayText: displayText,
        isFinal: data.isFinal,
        containsVietnamese,
        language,
        vietnameseDisplayMode,
        sessionId,
        userId,
      });

      session.layouts.showTextWall(displayText, {
        view: ViewType.MAIN,
        durationMs: data.isFinal ? 3000 : 1000
      });
    })

    session.events.onGlassesBattery((data) => {
      console.log('Glasses battery:', data);
    })
  }

  private setupTranscriptRoutes(): void {
    const expressApp = this.getExpressApp();

    expressApp.get(["/", "/transcript"], (_request, response) => {
      response
        .status(200)
        .type("html")
        .send(this.renderTranscriptPage());
    });

    expressApp.get("/events", (request, response) => {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });

      response.write(`event: history\ndata: ${JSON.stringify(this.transcriptLog)}\n\n`);
      this.browserClients.add(response);

      request.on("close", () => {
        this.browserClients.delete(response);
      });
    });

    expressApp.post("/transcript/clear", (_request, response) => {
      this.transcriptLog.length = 0;
      this.broadcastSse("clear", { clearedAt: new Date().toISOString() });
      response.status(204).send();
    });
  }

  private addTranscriptEntry(entry: TranscriptLogEntry): void {
    this.transcriptLog.push(entry);

    if (this.transcriptLog.length > MAX_TRANSCRIPT_LINES) {
      this.transcriptLog.splice(0, this.transcriptLog.length - MAX_TRANSCRIPT_LINES);
    }

    this.broadcastSse("transcript", entry);
  }

  private broadcastSse(eventName: string, payload: unknown): void {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.browserClients) {
      client.write(message);
    }
  }

  private renderTranscriptPage(): string {
    const initialHistory = JSON.stringify(this.transcriptLog).replace(/</g, "\\u003c");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vietnamese Safe Captions</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #111923;
      --panel-2: #172230;
      --text: #eef5ff;
      --muted: #8fa3b8;
      --accent: #62d6a4;
      --border: #263547;
      --danger: #ff6b7a;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .app {
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      background: rgba(17, 25, 35, 0.96);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 720;
      letter-spacing: 0;
    }

    .meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 14px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status {
      color: var(--muted);
      font-size: 14px;
      white-space: nowrap;
    }

    button {
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      border-color: var(--danger);
      color: #ffd5da;
    }

    main {
      min-height: 0;
      overflow-y: auto;
      padding: 22px;
      scroll-behavior: smooth;
    }

    .empty {
      color: var(--muted);
      font-size: 22px;
      line-height: 1.4;
      padding: 24px 0;
    }

    .caption {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 8px;
      padding: 16px 18px;
      margin: 0 0 14px;
    }

    .caption-header {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      color: var(--accent);
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 700;
    }

    .line {
      display: grid;
      gap: 5px;
      margin-top: 10px;
    }

    .label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      text-transform: uppercase;
    }

    .text {
      font-size: 28px;
      line-height: 1.35;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .display .text {
      color: #d8ffe9;
    }

    @media (max-width: 640px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }

      .actions {
        width: 100%;
        justify-content: space-between;
      }

      main {
        padding: 16px;
      }

      .text {
        font-size: 23px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div>
        <h1>Vietnamese Safe Captions</h1>
        <div class="meta">Original transcript and ASCII-safe glasses display</div>
      </div>
      <div class="actions">
        <span id="connectionStatus" class="status">Connecting...</span>
        <button id="clearButton" type="button">Clear</button>
      </div>
    </header>
    <main id="transcriptList" aria-live="polite"></main>
  </div>

  <script>
    const initialHistory = ${initialHistory};
    const maxTranscriptLines = ${MAX_TRANSCRIPT_LINES};
    const transcriptList = document.getElementById("transcriptList");
    const connectionStatus = document.getElementById("connectionStatus");
    const clearButton = document.getElementById("clearButton");
    let transcriptItems = [];

    function formatTimestamp(timestamp) {
      try {
        return new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(timestamp));
      } catch {
        return timestamp || "";
      }
    }

    function languageText(value) {
      if (value === undefined || value === null || value === "") {
        return "language unknown";
      }

      return "language " + String(value);
    }

    function render() {
      transcriptList.replaceChildren();

      if (transcriptItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Waiting for live transcript events...";
        transcriptList.append(empty);
        return;
      }

      for (const item of transcriptItems) {
        const article = document.createElement("article");
        article.className = "caption";

        const header = document.createElement("div");
        header.className = "caption-header";

        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = item.isFinal ? "Final" : "Interim";

        const time = document.createElement("span");
        time.textContent = formatTimestamp(item.timestamp);

        const language = document.createElement("span");
        language.textContent = languageText(item.language);

        header.append(badge, time, language);

        const original = document.createElement("div");
        original.className = "line original";
        const originalLabel = document.createElement("div");
        originalLabel.className = "label";
        originalLabel.textContent = "Original";
        const originalText = document.createElement("div");
        originalText.className = "text";
        originalText.textContent = item.originalText || "";
        original.append(originalLabel, originalText);

        const display = document.createElement("div");
        display.className = "line display";
        const displayLabel = document.createElement("div");
        displayLabel.className = "label";
        displayLabel.textContent = "Display";
        const displayText = document.createElement("div");
        displayText.className = "text";
        displayText.textContent = item.displayText || "";
        display.append(displayLabel, displayText);

        article.append(header, original, display);
        transcriptList.append(article);
      }

      transcriptList.scrollTop = transcriptList.scrollHeight;
    }

    function setHistory(items) {
      transcriptItems = Array.isArray(items) ? items.slice(-maxTranscriptLines) : [];
      render();
    }

    function appendTranscript(item) {
      transcriptItems.push(item);
      transcriptItems = transcriptItems.slice(-maxTranscriptLines);
      render();
    }

    clearButton.addEventListener("click", async () => {
      clearButton.disabled = true;

      try {
        const response = await fetch("/transcript/clear", { method: "POST" });
        if (!response.ok) {
          throw new Error("Clear failed");
        }
        setHistory([]);
      } catch (error) {
        console.error(error);
      } finally {
        clearButton.disabled = false;
      }
    });

    setHistory(initialHistory);

    const events = new EventSource("/events");
    events.addEventListener("open", () => {
      connectionStatus.textContent = "Live";
    });
    events.addEventListener("error", () => {
      connectionStatus.textContent = "Reconnecting...";
    });
    events.addEventListener("history", (event) => {
      setHistory(JSON.parse(event.data));
    });
    events.addEventListener("transcript", (event) => {
      appendTranscript(JSON.parse(event.data));
    });
    events.addEventListener("clear", () => {
      setHistory([]);
    });
  </script>
</body>
</html>`;
  }
}

// Start the server
// DEV CONSOLE URL: https://console.mentra.glass/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new VietnameseSafeCaptionsApp();

app.start().catch(console.error);
