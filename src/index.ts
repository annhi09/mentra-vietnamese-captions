import 'dotenv/config';
import { AppServer, AppSession, ViewType } from '@mentra/sdk';
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

type TranscriptLogEntry = {
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

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
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
        originalText,
        displayText,
        isFinal: data.isFinal,
        containsVietnamese,
        vietnameseDisplayMode,
        language,
        timestamp: new Date().toISOString(),
      };

      this.transcriptLog.push(logEntry);

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
}

// Start the server
// DEV CONSOLE URL: https://console.mentra.glass/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new VietnameseSafeCaptionsApp();

app.start().catch(console.error);
