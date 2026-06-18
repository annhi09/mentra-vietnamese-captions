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
const GLASSES_MAX_LINES = parsePositiveInteger(process.env.GLASSES_MAX_LINES, 4);
const GLASSES_DISPLAY_DURATION_MS = parsePositiveInteger(process.env.GLASSES_DISPLAY_DURATION_MS, 4000);
const SHOW_INTERIM_ON_GLASSES = parseBoolean(process.env.SHOW_INTERIM_ON_GLASSES, true);
const GLASSES_RENDER_THROTTLE_MS = 120;
const GLASSES_CLEAR_AFTER_SILENCE_MS = parsePositiveInteger(process.env.GLASSES_CLEAR_AFTER_SILENCE_MS, 5000);
const LOG_TRANSCRIPT_EVENT_SHAPE = parseBoolean(process.env.LOG_TRANSCRIPT_EVENT_SHAPE, false);

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() !== "false";
}

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

function getSpeakerLabel(event: unknown): string {
  const metadata = event as Record<string, unknown>;
  const speakerValue =
    metadata.speakerId ??
    metadata.speaker ??
    metadata.speakerLabel ??
    metadata.speaker_id ??
    metadata.speakerNumber;

  if (speakerValue === undefined || speakerValue === null || speakerValue === "") {
    return "";
  }

  const normalized = String(speakerValue).trim();

  if (!normalized) {
    return "";
  }

  const numericMatch = normalized.match(/\d+/);
  return `[${numericMatch?.[0] ?? normalized}]`;
}

function formatSpeakerCaption(speakerLabel: string, text: string): string {
  return speakerLabel ? `${speakerLabel} ${text}` : text;
}

function getTranscriptEventShapeSample(event: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        return [key, value];
      }

      if (Array.isArray(value)) {
        return [key, `[array:${value.length}]`];
      }

      return [key, typeof value];
    }),
  );
}

class VietnameseSafeCaptionsApp extends AppServer {
  private readonly transcriptLog: TranscriptLogEntry[] = [];
  private readonly browserClients = new Set<Response>();
  private currentInterimTranscript: TranscriptLogEntry | null = null;
  private readonly committedUtteranceIds = new Set<string>();
  private hasLoggedTranscriptEventShape = false;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    this.setupTranscriptRoutes();
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    const recentFinalDisplayLines: string[] = [];
    let currentInterimDisplayLine: string | null = null;
    let transcriptSequence = 0;
    let latestRenderableSequence = 0;
    let latestRenderedSequence = 0;
    let pendingGlassesRender: { sequence: number; text: string } | null = null;
    let glassesRenderTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceClearTimer: ReturnType<typeof setTimeout> | null = null;
    let lastGlassesRenderAt = 0;

    const getGlassesCaptionText = () => {
      const lines = currentInterimDisplayLine
        ? [...recentFinalDisplayLines, currentInterimDisplayLine]
        : recentFinalDisplayLines;

      return lines.join("\n");
    };

    const clearGlassesDisplay = (sequence: number) => {
      recentFinalDisplayLines.length = 0;
      currentInterimDisplayLine = null;
      pendingGlassesRender = null;
      latestRenderableSequence = sequence;
      latestRenderedSequence = sequence;

      if (glassesRenderTimer) {
        clearTimeout(glassesRenderTimer);
        glassesRenderTimer = null;
      }

      lastGlassesRenderAt = Date.now();
      session.layouts.showTextWall("", {
        view: ViewType.MAIN,
        durationMs: 1
      });
    };

    const resetSilenceClearTimer = (sequence: number) => {
      if (silenceClearTimer) {
        clearTimeout(silenceClearTimer);
      }

      silenceClearTimer = setTimeout(() => {
        if (sequence < transcriptSequence) {
          return;
        }

        transcriptSequence += 1;
        clearGlassesDisplay(transcriptSequence);
      }, GLASSES_CLEAR_AFTER_SILENCE_MS);
    };

    this.addCleanupHandler(() => {
      if (glassesRenderTimer) {
        clearTimeout(glassesRenderTimer);
      }

      if (silenceClearTimer) {
        clearTimeout(silenceClearTimer);
      }
    });

    const flushPendingGlassesRender = () => {
      glassesRenderTimer = null;

      if (!pendingGlassesRender) {
        return;
      }

      const render = pendingGlassesRender;
      pendingGlassesRender = null;

      if (
        render.sequence < transcriptSequence ||
        render.sequence < latestRenderableSequence ||
        render.sequence <= latestRenderedSequence
      ) {
        return;
      }

      latestRenderedSequence = render.sequence;
      lastGlassesRenderAt = Date.now();
      session.layouts.showTextWall(render.text, {
        view: ViewType.MAIN,
        durationMs: GLASSES_DISPLAY_DURATION_MS
      });
    };

    const scheduleGlassesRender = (sequence: number) => {
      const text = getGlassesCaptionText();

      if (!text) {
        return;
      }

      latestRenderableSequence = sequence;
      pendingGlassesRender = { sequence, text };

      if (glassesRenderTimer) {
        return;
      }

      const elapsedMs = Date.now() - lastGlassesRenderAt;
      const delayMs = Math.max(GLASSES_RENDER_THROTTLE_MS - elapsedMs, 0);

      if (delayMs === 0) {
        flushPendingGlassesRender();
        return;
      }

      glassesRenderTimer = setTimeout(flushPendingGlassesRender, delayMs);
    };

    // Handle real-time transcription
    // requires microphone permission to be set in the developer console
    session.events.onTranscription((data) => {
      transcriptSequence += 1;
      const eventSequence = transcriptSequence;
      const originalText = data.text;
      const displayText = getVietnameseDisplayText(originalText, vietnameseDisplayMode);
      const metadata = data as unknown as Record<string, unknown>;
      const language = metadata.language ?? metadata.detectedLanguage ?? metadata.locale;
      const speakerLabel = getSpeakerLabel(data);
      const speakerDisplayText = formatSpeakerCaption(speakerLabel, displayText);
      const containsVietnamese = containsVietnameseCharacters(originalText);

      if (LOG_TRANSCRIPT_EVENT_SHAPE && !this.hasLoggedTranscriptEventShape) {
        this.hasLoggedTranscriptEventShape = true;
        console.log("Transcript event shape", {
          keys: Object.keys(metadata),
          sample: getTranscriptEventShapeSample(metadata),
        });
      }

      const logEntry: TranscriptLogEntry = {
        id: typeof data.utteranceId === "string" ? data.utteranceId : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalText,
        displayText,
        isFinal: data.isFinal,
        containsVietnamese,
        vietnameseDisplayMode,
        language,
        timestamp: new Date().toISOString(),
      };

      const shouldRenderTranscript = this.recordTranscriptEntry(
        logEntry,
        typeof data.utteranceId === "string" ? data.utteranceId : undefined,
      );

      console.log("Transcript received", {
        originalTranscript: originalText,
        convertedDisplayText: displayText,
        isFinal: data.isFinal,
        containsVietnamese,
        language,
        vietnameseDisplayMode,
        showInterimOnGlasses: SHOW_INTERIM_ON_GLASSES,
        transcriptSequence: eventSequence,
        speakerLabel,
        sessionId,
        userId,
      });

      resetSilenceClearTimer(eventSequence);

      if (!shouldRenderTranscript) {
        return;
      }

      if (data.isFinal) {
        currentInterimDisplayLine = null;
        recentFinalDisplayLines.push(speakerDisplayText);

        if (recentFinalDisplayLines.length > GLASSES_MAX_LINES) {
          recentFinalDisplayLines.splice(0, recentFinalDisplayLines.length - GLASSES_MAX_LINES);
        }

        scheduleGlassesRender(eventSequence);
        return;
      }

      if (SHOW_INTERIM_ON_GLASSES) {
        currentInterimDisplayLine = speakerDisplayText;
        scheduleGlassesRender(eventSequence);
      }
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

      response.write(`event: history\ndata: ${JSON.stringify(this.getBrowserTranscriptItems())}\n\n`);
      this.browserClients.add(response);

      request.on("close", () => {
        this.browserClients.delete(response);
      });
    });

    expressApp.post("/transcript/clear", (_request, response) => {
      this.transcriptLog.length = 0;
      this.currentInterimTranscript = null;
      this.committedUtteranceIds.clear();
      this.broadcastSse("clear", { clearedAt: new Date().toISOString() });
      response.status(204).send();
    });
  }

  private recordTranscriptEntry(entry: TranscriptLogEntry, utteranceId: string | undefined): boolean {
    if (!entry.isFinal) {
      this.currentInterimTranscript = {
        ...entry,
        id: utteranceId ?? "current-interim",
      };
      this.broadcastSse("interim", this.currentInterimTranscript);
      return true;
    }

    if (utteranceId) {
      if (this.committedUtteranceIds.has(utteranceId)) {
        this.currentInterimTranscript = null;
        this.broadcastSse("interim", null);
        return false;
      }

      this.committedUtteranceIds.add(utteranceId);
    }

    this.currentInterimTranscript = null;
    this.transcriptLog.push(entry);

    if (this.transcriptLog.length > MAX_TRANSCRIPT_LINES) {
      this.transcriptLog.splice(0, this.transcriptLog.length - MAX_TRANSCRIPT_LINES);
    }

    this.broadcastSse("transcript", entry);
    this.broadcastSse("interim", null);
    return true;
  }

  private getBrowserTranscriptItems(): TranscriptLogEntry[] {
    return this.currentInterimTranscript
      ? [...this.transcriptLog, this.currentInterimTranscript]
      : [...this.transcriptLog];
  }

  private broadcastSse(eventName: string, payload: unknown): void {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.browserClients) {
      client.write(message);
    }
  }

  private renderTranscriptPage(): string {
    const initialHistory = JSON.stringify(this.getBrowserTranscriptItems()).replace(/</g, "\\u003c");

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
      flex-wrap: wrap;
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

    .tabs {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0d141d;
    }

    .tab {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 7px 10px;
    }

    .tab[aria-selected="true"] {
      background: var(--panel-2);
      color: var(--text);
    }

    .tab:hover {
      border: 0;
      color: var(--text);
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
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .badge {
      border-radius: 999px;
      padding: 3px 7px;
      background: #0d141d;
      color: var(--accent);
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 700;
    }

    .line {
      display: grid;
      gap: 5px;
      margin-top: 8px;
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

    .original .text {
      color: #e8eff8;
    }

    @media (max-width: 640px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }

      .actions {
        width: 100%;
        align-items: flex-start;
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
        <div class="tabs" role="tablist" aria-label="Transcript view">
          <button class="tab" type="button" role="tab" data-view="display" aria-selected="true">Display</button>
          <button class="tab" type="button" role="tab" data-view="original" aria-selected="false">Original</button>
          <button class="tab" type="button" role="tab" data-view="both" aria-selected="false">Both</button>
        </div>
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
    const tabs = Array.from(document.querySelectorAll(".tab"));
    let transcriptItems = [];
    let selectedView = "display";

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

    function createLine(kind, labelText, bodyText) {
      const line = document.createElement("div");
      line.className = "line " + kind;

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = labelText;

      const text = document.createElement("div");
      text.className = "text";
      text.textContent = bodyText || "";

      line.append(label, text);
      return line;
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

        article.append(header);

        if (selectedView === "original") {
          article.append(createLine("original", "Original", item.originalText));
        } else if (selectedView === "both") {
          article.append(
            createLine("original", "Original", item.originalText),
            createLine("display", "Display", item.displayText),
          );
        } else {
          article.append(createLine("display", "Display", item.displayText));
        }

        transcriptList.append(article);
      }

      transcriptList.scrollTop = transcriptList.scrollHeight;
    }

    function setHistory(items) {
      transcriptItems = Array.isArray(items) ? items.slice(-maxTranscriptLines) : [];
      render();
    }

    function appendTranscript(item) {
      transcriptItems = transcriptItems.filter((existing) => existing.isFinal && existing.id !== item.id);
      transcriptItems.push(item);
      transcriptItems = transcriptItems.slice(-maxTranscriptLines);
      render();
    }

    function updateInterim(item) {
      transcriptItems = transcriptItems.filter((existing) => existing.isFinal);

      if (item) {
        transcriptItems.push(item);
      }

      transcriptItems = transcriptItems.slice(-maxTranscriptLines);
      render();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        selectedView = tab.dataset.view || "display";

        for (const candidate of tabs) {
          candidate.setAttribute("aria-selected", String(candidate === tab));
        }

        render();
      });
    });

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
    events.addEventListener("interim", (event) => {
      updateInterim(JSON.parse(event.data));
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
