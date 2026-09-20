#!/usr/bin/env node

import { getSongPath, getSongs } from "./library.js";
import { runInteractive } from "./interactive.js";
import { pauseSong, resumeSong, startSong, stopSong } from "./player.js";
import {
  addToPlaylist,
  createPlaylist,
  getPlaylist,
  removeFromPlaylist,
} from "./playlists.js";
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
  "interactive",
  "playlist",
]);

const help = `
🎵 Terminal Music Player

Usage:
  music-player <command>
  music-player

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
  interactive  Open interactive mode
  playlist  Create and manage playlists
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

async function playTrack(songs, currentIndex, playlist) {
  const song = songs[currentIndex];
  const { pid, completion } = await startSong(getSongPath(song));

  try {
    await writeState({
      pid,
      currentIndex,
      song,
      status: "playing",
      startedAt: new Date().toISOString(),
      ...(playlist ? { playlist } : {}),
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

function findSong(songs, selection) {
  return /^\d+$/.test(selection)
    ? songs[Number(selection) - 1]
    : songs.find((song) => song === selection);
}

async function main(argv) {
  const command = argv[2];

  if (!command || command === "interactive") {
    return runInteractive();
  }

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
    const song = findSong(songs, selection);

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

  if (command === "playlist") {
    const action = argv[3];
    const name = argv[4];

    if (!action || !name) {
      console.error("Usage: music-player playlist <create|add|show|play|remove> <name> [song]");
      return 1;
    }

    const playlistName = name.trim();

    if (action === "create") {
      const playlist = await createPlaylist(playlistName);
      console.log(`Created playlist: ${playlist}`);
      return 0;
    }

    if (action === "add") {
      const selection = argv[5];

      if (!selection) {
        console.error("Usage: music-player playlist add <name> <number|filename>");
        return 1;
      }

      const songs = await getSongs();
      const song = findSong(songs, selection);

      if (!song) {
        console.error(`Song not found: ${selection}`);
        return 1;
      }

      await addToPlaylist(playlistName, song);
      console.log(`Added to ${playlistName}: ${song}`);
      return 0;
    }

    if (action === "show") {
      const playlist = await getPlaylist(playlistName);

      if (playlist.length === 0) {
        console.log(`Playlist "${playlistName}" is empty.`);
        return 0;
      }

      const availableSongs = new Set(await getSongs());
      playlist.forEach((song, index) => {
        console.log(`${index + 1}. ${song}${availableSongs.has(song) ? "" : " (missing)"}`);
      });
      return 0;
    }

    if (action === "play") {
      const availableSongs = new Set(await getSongs());
      const songs = (await getPlaylist(playlistName)).filter((song) =>
        availableSongs.has(song),
      );

      if (songs.length === 0) {
        console.log(`Playlist "${playlistName}" has no playable songs.`);
        return 0;
      }

      const activeState = await getActiveState();

      if (activeState) {
        console.error(`Already playing: ${activeState.song}`);
        return 1;
      }

      return playTrack(songs, 0, playlistName);
    }

    if (action === "remove") {
      const position = argv[5];

      if (!position) {
        console.error("Usage: music-player playlist remove <name> <position>");
        return 1;
      }

      const song = await removeFromPlaylist(playlistName, position);
      console.log(`Removed from ${playlistName}: ${song}`);
      return 0;
    }

    console.error(`Unknown playlist command: ${action}`);
    return 1;
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
    const librarySongs = await getSongs();

    if (librarySongs.length === 0) {
      console.log("No music files found.");
      return 0;
    }

    const state = await getActiveState();

    if (!state) {
      console.log("Nothing is currently playing.");
      return 0;
    }

    const availableSongs = new Set(librarySongs);
    const songs = state.playlist
      ? (await getPlaylist(state.playlist)).filter((song) => availableSongs.has(song))
      : librarySongs;

    if (songs.length === 0) {
      console.log("No playable songs found.");
      return 0;
    }

    const offset = command === "next" ? 1 : -1;
    let currentIndex = songs.indexOf(state.song);

    if (currentIndex < 0) {
      currentIndex = Number.isInteger(state.currentIndex)
        ? state.currentIndex
        : command === "next"
          ? -1
          : 0;
    }

    const selectedIndex =
      ((currentIndex + offset) % songs.length + songs.length) % songs.length;

    await stopPlayback(state);
    return playTrack(songs, selectedIndex, state.playlist);
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
