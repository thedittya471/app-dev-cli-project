#!/usr/bin/env node

import { getSongPath, getSongs } from "./library.js";
import { pauseSong, resumeSong, startSong, stopSong } from "./player.js";
import {
  clearState,
  getActiveState,
  isProcessRunning,
  writeState,
} from "./state.js";

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

async function waitForProcessExit(pid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Playback did not stop within 5 seconds.");
}

async function stopPlayback(state) {
  const stopped = stopSong(state.pid, state.status === "paused");

  if (stopped) {
    await waitForProcessExit(state.pid);
  }

  await clearState(state.pid);
  return stopped;
}

async function playTrack(songs, currentIndex) {
  const song = songs[currentIndex];
  const { pid, completion } = await startSong(getSongPath(song));

  try {
    await writeState({
      pid,
      currentIndex,
      song,
      status: "playing",
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    stopSong(pid);
    await completion;
    throw error;
  }

  console.log(`Playing: ${song}`);
  let stopped = false;

  try {
    const playback = await completion;

    if (playback.signal === "SIGTERM") {
      stopped = true;
      return 0;
    }

    if (playback.signal) {
      throw new Error(`Playback was interrupted by ${playback.signal}.`);
    }

    if (playback.code !== 0) {
      throw new Error(`Playback failed with exit code ${playback.code}.`);
    }

    console.log(`Finished: ${song}`);
    return 0;
  } finally {
    if (!stopped) {
      await clearState(pid);
    }
  }
}

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

    return playTrack(songs, songs.indexOf(song));
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

  if (command === "stop") {
    const state = await getActiveState();

    if (!state) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    if (!(await stopPlayback(state))) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    console.log(`Stopped: ${state.song}`);
    return 0;
  }

  if (command === "pause" || command === "resume") {
    const state = await getActiveState();

    if (!state) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    if (command === "pause" && state.status === "paused") {
      console.log(`Already paused: ${state.song}`);
      return 0;
    }

    if (command === "resume" && state.status !== "paused") {
      console.log(`Already playing: ${state.song}`);
      return 0;
    }

    const signaled = command === "pause" ? pauseSong(state.pid) : resumeSong(state.pid);

    if (!signaled) {
      await clearState(state.pid);
      console.log("Nothing is currently playing.");
      return 0;
    }

    await writeState({
      ...state,
      status: command === "pause" ? "paused" : "playing",
    });
    console.log(`${command === "pause" ? "Paused" : "Resumed"}: ${state.song}`);
    return 0;
  }

  if (command === "next" || command === "previous") {
    const songs = await getSongs();

    if (songs.length === 0) {
      console.log("No music files found.");
      return 0;
    }

    const state = await getActiveState();

    if (!state) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    const currentIndex = Number.isInteger(state.currentIndex) ? state.currentIndex : 0;
    const offset = command === "next" ? 1 : -1;
    const selectedIndex = (currentIndex + offset + songs.length) % songs.length;

    await stopPlayback(state);
    return playTrack(songs, selectedIndex);
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
