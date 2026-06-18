# Vietnamese Safe Captions

Vietnamese Safe Captions is a standalone MentraOS display smart glasses app for Even Realities and other MentraOS-compatible display glasses. It receives live MentraOS transcript events, preserves the original transcript internally, and displays an ASCII-safe version on glasses when Vietnamese diacritics are present.

Example:

```text
Original transcript: Tôi đang đi làm
Glasses display:     Toi dang di lam
```

The app is based on the official `Mentra-Community/MentraOS-Display-Example-App` structure. MentraOS display apps run as external web servers connected to MentraOS Cloud.

## Behavior

- Subscribes to MentraOS transcription events.
- Detects Vietnamese characters in transcript text.
- Converts Vietnamese diacritics to ASCII-safe text before display.
- Keeps English and normal Latin text unchanged.
- Shows low-latency interim captions on glasses while speaking.
- Replaces the active interim caption with the final caption when MentraOS sends the final event.
- Shows only the current speech window on glasses.
- Clears the glasses caption window after 5 seconds of silence by default.
- Shows up to 4 recent final caption lines from the current speech window by default.
- Coalesces rapid glasses updates to the newest transcript state with a 120 ms throttle.
- Adds speaker labels on glasses when MentraOS transcript events include speaker metadata.
- Preserves the original transcript in app logs/state.
- Serves a live browser transcript page at `/` and `/transcript`.
- Streams live browser updates with Server-Sent Events from `/events`.
- Updates the current browser interim caption in place instead of appending every interim event.
- Keeps the most recent 200 transcript lines in memory.
- Logs original transcript, converted display text, final/interim state, language metadata when present, and display mode.

## Configuration

Create `.env` from the example:

```sh
cp .env.example .env
```

Set these values:

```env
PORT=3000
PACKAGE_NAME=com.yourname.vietnamese_safe_captions
MENTRAOS_API_KEY=your_api_key_here
VIETNAMESE_DISPLAY_MODE=ascii
GLASSES_MAX_LINES=4
GLASSES_DISPLAY_DURATION_MS=4000
SHOW_INTERIM_ON_GLASSES=true
GLASSES_CLEAR_AFTER_SILENCE_MS=5000
LOG_TRANSCRIPT_EVENT_SHAPE=false
```

`VIETNAMESE_DISPLAY_MODE` can be:

- `ascii`: strip Vietnamese diacritics before display. This is the default.
- `original`: display transcript text exactly as MentraOS sends it.

Glasses display settings:

- `GLASSES_MAX_LINES`: number of recent final caption lines to show on glasses. Default: `4`.
- `GLASSES_DISPLAY_DURATION_MS`: how long the recent final captions remain visible on glasses. Default: `4000`.
- `SHOW_INTERIM_ON_GLASSES`: show interim transcript updates on glasses for lower latency. Default: `true`.
- `GLASSES_CLEAR_AFTER_SILENCE_MS`: clear the glasses live caption window after this many milliseconds without transcript events. Default: `5000`.
- `LOG_TRANSCRIPT_EVENT_SHAPE`: set to `true` temporarily to log transcript event keys and inspect speaker metadata availability. Default: `false`.

The glasses display format is recent final lines from the current speech window plus one current interim line. New transcript events update the latest pending glasses text immediately; rapid interim bursts are lightly throttled to one render about every 120 ms, always using the newest transcript state. Display duration does not queue or delay newer captions. After silence, the glasses live buffer is cleared so old conversation does not reappear when new speech starts.

## Install

Install dependencies:

```sh
npm install
```

Run tests:

```sh
npm test
```

Run the development server:

```sh
npm run dev
```

Open the browser transcript page:

```text
http://localhost:3000/
http://localhost:3000/transcript
```

The page shows newest captions at the bottom, auto-scrolls to the latest line, and has Display, Original, and Both tabs. Display is the default tab.

## Register In MentraOS

1. Open `https://console.mentra.glass`.
2. Sign in with the same account used by your MentraOS phone app.
3. Create an app with a unique package name, for example `com.yourname.vietnamese_safe_captions`.
4. Set the public URL to your externally reachable app URL. For local development, expose `PORT` with ngrok or a similar tunnel:

```sh
ngrok http 3000
```

5. Copy the public ngrok URL into the app's Public URL field.
6. Add the `MICROPHONE` permission in the MentraOS Developer Console.
7. Copy the API key from the console into `MENTRAOS_API_KEY`.

The `PACKAGE_NAME` in `.env` must exactly match the package name registered in the console.

## Browser Transcript Page

The app serves a live caption page from the same server used by MentraOS:

```text
GET /
GET /transcript
GET /events
POST /transcript/clear
```

Use `/events` only from the browser page or an SSE client. It streams history on connect, then pushes each new transcript item as it arrives. The Clear button calls `POST /transcript/clear` and clears the in-memory history for all connected browser clients.

Interim transcript events update one current interim line in the browser. When the final transcript arrives, the app commits one final line and clears the interim line.

The browser only receives transcript items:

- `timestamp`
- `originalText`
- `displayText`
- `isFinal`
- `language`

`MENTRAOS_API_KEY` stays server-side and is never embedded in browser/client code.

For Render, open your deployed app URL directly:

```text
https://your-render-service-name.onrender.com/
https://your-render-service-name.onrender.com/transcript
```

Use the same Render URL as the MentraOS app Public URL in `https://console.mentra.glass`.

## Test With Even Realities Glasses

1. Pair and connect the Even Realities glasses through MentraOS.
2. Start this server with `npm run dev`.
3. Open `http://localhost:3000/transcript`, or open your ngrok/Render URL in a browser.
4. Start the app from MentraOS.
5. Speak English near the phone/glasses microphone and confirm the browser and glasses show English unchanged.
6. Speak Vietnamese near the phone/glasses microphone and confirm the browser shows both forms:

```text
Original: Tôi đang đi làm
Display: Toi dang di lam
```

7. Confirm logs show both the original and converted transcript, the browser auto-scrolls, and the glasses display ASCII-safe captions.
8. Confirm interim speech updates quickly in place on glasses:

```text
Uh,
Uh, ok
Uh, okay.
```

9. Confirm final captions remain as recent history within the current speech window, for example:

```text
Hello Long.
How are you?
I am going to work.
See you later.
```

10. Stop speaking for at least 5 seconds, then speak again. The glasses should start a fresh caption window without old lines from the previous conversation.

## Development

The Vietnamese conversion utility lives in `src/utils/vietnamese.ts`, with unit tests in `src/utils/vietnamese.test.ts`.

This project is intentionally standalone and does not modify the main MentraOS repository.
