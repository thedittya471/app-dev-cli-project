#!/usr/bin/env node

import { getSongPath, getSongs } from "./library.js";
import { playSong } from "./player.js";

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

    console.log(`Playing: ${song}`);
    await playSong(getSongPath(song));
    console.log(`Finished: ${song}`);
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
