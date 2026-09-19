# Terminal Music Player

A small, readable command-line music player built with Node.js. The project will support browsing local songs, playback controls, playlists, and an interactive terminal interface.

## Requirements

- Node.js 22 or newer
- npm
- FFmpeg with `ffplay` (required when audio playback is added)

Check your setup:

```bash
node --version
npm --version
ffplay -version
```

## Getting started

```bash
npm install
npm start
```

For automatic restarts while developing:

```bash
npm run dev
```

To make the `music-player` command available locally:

```bash
npm link
music-player
```

## Project structure

```text
├── src/
│   └── cli.js       # CLI entry point
├── music/           # Local audio files (not committed)
├── data/            # Runtime state and playlists (not committed)
├── package.json
└── README.md
```

The application is intentionally dependency-free at this stage. Features will be added in small, focused commits.
