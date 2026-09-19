import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportedExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
const musicDirectory = new URL("../music/", import.meta.url);
const musicDirectoryPath = fileURLToPath(musicDirectory);

export async function getSongs(directory = musicDirectory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function getSongPath(song) {
  return path.join(musicDirectoryPath, song);
}
