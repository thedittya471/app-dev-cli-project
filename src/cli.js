#!/usr/bin/env node

import { getSongPath, getSongs } from "./library.js";
import { startSong } from "./player.js";
import { clearState, getActiveState, writeState } from "./state.js";

const commands = new Set([
  "list",
  "play",
  "pause",
  "resume",
  "stop",
  "next",
  "previous",
  "status",
]);

const help = `
🎵 Terminal Music Player

Usage:
  music-player <command>

Commands:
  help      Show this help message
  list      List songs in the music library
  play      Play a song by list number or filename
  pause     Pause playback
  resume    Resume playback
  stop      Stop playback
  next      Play the next song
  previous  Play the previous song
  status    Show the current playback status
`;

async function main(argv) {
  const command = argv[2] ?? "help";

  if (command === "help") {
    console.log(help);
    return 0;
  }

  if (!commands.has(command)) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "music-player help" to see available commands.');
    return 1;
  }

  if (command === "list") {
    const songs = await getSongs();

    if (songs.length === 0) {
      console.log("No music files found.");
      return 0;
    }

    songs.forEach((song, index) => console.log(`${index + 1}. ${song}`));
    return 0;
  }

  if (command === "play") {
    const selection = argv[3];

    if (!selection) {
      console.error("Usage: music-player play <number|filename>");
      return 1;
    }

    const songs = await getSongs();
    const song = /^\d+$/.test(selection)
      ? songs[Number(selection) - 1]
      : songs.find((name) => name === selection);

    if (!song) {
      console.error(`Song not found: ${selection}`);
      return 1;
    }

    const activeState = await getActiveState();

    if (activeState) {
      console.error(`Already playing: ${activeState.song}`);
      return 1;
    }

    const { pid, completion } = await startSong(getSongPath(song));

    await writeState({
      pid,
      currentIndex: songs.indexOf(song),
      song,
      status: "playing",
      startedAt: new Date().toISOString(),
    });

    console.log(`Playing: ${song}`);

    try {
      const playback = await completion;

      if (playback.signal) {
        throw new Error(`Playback was interrupted by ${playback.signal}.`);
      }

      if (playback.code !== 0) {
        throw new Error(`Playback failed with exit code ${playback.code}.`);
      }

      console.log(`Finished: ${song}`);
    } finally {
      await clearState();
    }

    return 0;
  }

  if (command === "status") {
    const state = await getActiveState();

    if (!state) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    console.log(`Status: ${state.status}`);
    console.log(`Song: ${state.song}`);
    console.log(`Process ID: ${state.pid}`);
    return 0;
  }

  console.log(`The "${command}" command is not implemented yet.`);
  return 0;
}

try {
  process.exitCode = await main(process.argv);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
