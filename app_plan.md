# Vietnamese Safe Captions - Requirements

## Problem
Even Realities glasses may not render Vietnamese diacritics correctly. MentraOS transcription can produce Vietnamese text, but marked characters disappear or render badly on glasses.

## Solution
Build a small MentraOS app that receives transcript text, converts Vietnamese diacritics to ASCII-safe characters, then displays the cleaned text on glasses.

## Example
Original:
Tôi đang đi làm

Display:
Toi dang di lam

## MVP
- Receive live transcript events
- Strip Vietnamese marks
- Display ASCII-safe text
- Keep original transcript in logs/state
- Default mode: ASCII Vietnamese

## Do Not Do
- Do not fork full MentraOS yet
- Do not rebuild Bluetooth handling
- Do not use Even Realities demo app as the base