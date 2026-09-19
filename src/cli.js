#!/usr/bin/env node

import { getSongs } from "./library.js";

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
  play      Start playback
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

  console.log(`The "${command}" command is not implemented yet.`);
  return 0;
}

try {
  process.exitCode = await main(process.argv);
} catch (error) {
  console.error(`Unable to read the music library: ${error.message}`);
  process.exitCode = 1;
}
