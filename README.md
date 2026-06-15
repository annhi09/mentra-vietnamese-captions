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

## Test With Even Realities Glasses

1. Pair and connect the Even Realities glasses through MentraOS.
2. Start this server with `npm run dev`.
3. Start the app from MentraOS.
4. Speak Vietnamese near the phone/glasses microphone.
5. Confirm logs show both the original and converted transcript, and the glasses display ASCII-safe captions.

## Development

The Vietnamese conversion utility lives in `src/utils/vietnamese.ts`, with unit tests in `src/utils/vietnamese.test.ts`.

This project is intentionally standalone and does not modify the main MentraOS repository.
