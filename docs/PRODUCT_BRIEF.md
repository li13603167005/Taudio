# Taudio Product Brief

Taudio is a private AI radio concept. It aims to make music recommendation feel less like a static playlist and more like a small companion that understands time, weather, mood, taste, and recent listening context.

## Core Product Idea

The user opens Taudio and hears a continuous radio session:

1. Taudio reads the current context.
2. It chooses a song based on taste, time, weather, and recent plays.
3. It gives a short DJ-style introduction.
4. It plays the song.
5. It automatically continues with the next suitable track.
6. The user can chat with Taudio, edit their taste profile, or choose from the queue.

## Design Principles

- Keep the DJ voice concise and human.
- Do not expose backend/provider errors directly in the listener conversation.
- Avoid repeated recommendations.
- Prefer fresh adjacent discoveries over overfitting to known favorites.
- Keep user taste documents editable and understandable.
- Keep API keys and music account credentials backend-only.

## MVP Scope

- Personal AI DJ web app
- User taste profile document
- Real-time context from weather and time
- External music provider adapter
- Playback queue and recent history
- Mobile-first interface
- Local-first private deployment

## Long-Term Direction

- Better TTS provider
- Stronger recommendation memory
- Authenticated remote access
- Shareable project case study
- Safer provider abstraction layer
