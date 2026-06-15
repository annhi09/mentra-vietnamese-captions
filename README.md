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
- Preserves the original transcript in app logs/state.
- Serves a live browser transcript page at `/` and `/transcript`.
- Streams live browser updates with Server-Sent Events from `/events`.
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
```

`VIETNAMESE_DISPLAY_MODE` can be:

- `ascii`: strip Vietnamese diacritics before display. This is the default.
- `original`: display transcript text exactly as MentraOS sends it.

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

The page shows newest captions at the bottom, auto-scrolls to the latest line, and displays both the original transcript and the ASCII-safe display text sent to the glasses.

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

## Development

The Vietnamese conversion utility lives in `src/utils/vietnamese.ts`, with unit tests in `src/utils/vietnamese.test.ts`.

This project is intentionally standalone and does not modify the main MentraOS repository.
