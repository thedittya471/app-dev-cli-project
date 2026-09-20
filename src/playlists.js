import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const dataDirectory = new URL("../data/", import.meta.url);
const playlistsFile = new URL("playlists.json", dataDirectory);
const temporaryPlaylistsFile = new URL("playlists.tmp.json", dataDirectory);

function normalizeName(name) {
  const normalized = name?.trim();

  if (!normalized || !/^[a-z0-9_-]+$/i.test(normalized)) {
    throw new Error("Playlist names may contain only letters, numbers, hyphens, and underscores.");
  }

  return normalized;
}

async function readPlaylists() {
  let playlists;

  try {
    playlists = JSON.parse(await readFile(playlistsFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return Object.create(null);
    }

    if (error instanceof SyntaxError) {
      throw new Error("The playlists file contains invalid JSON.");
    }

    throw error;
  }

  if (
    !playlists ||
    typeof playlists !== "object" ||
    Array.isArray(playlists) ||
    Object.values(playlists).some(
      (songs) => !Array.isArray(songs) || songs.some((song) => typeof song !== "string"),
    )
  ) {
    throw new Error("The playlists file has an invalid structure.");
  }

  return Object.assign(Object.create(null), playlists);
}

async function writePlaylists(playlists) {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await writeFile(temporaryPlaylistsFile, `${JSON.stringify(playlists, null, 2)}\n`);
    await rename(temporaryPlaylistsFile, playlistsFile);
  } finally {
    await rm(temporaryPlaylistsFile, { force: true });
  }
}

function requirePlaylist(playlists, name) {
  if (!Object.hasOwn(playlists, name)) {
    throw new Error(`Playlist not found: ${name}`);
  }

  return playlists[name];
}

export async function createPlaylist(name) {
  const normalizedName = normalizeName(name);
  const playlists = await readPlaylists();

  if (Object.hasOwn(playlists, normalizedName)) {
    throw new Error(`Playlist already exists: ${normalizedName}`);
  }

  playlists[normalizedName] = [];
  await writePlaylists(playlists);
  return normalizedName;
}

export async function addToPlaylist(name, song) {
  const normalizedName = normalizeName(name);
  const playlists = await readPlaylists();
  const songs = requirePlaylist(playlists, normalizedName);

  if (songs.includes(song)) {
    throw new Error(`Song is already in playlist "${normalizedName}": ${song}`);
  }

  songs.push(song);
  await writePlaylists(playlists);
}

export async function getPlaylist(name) {
  const normalizedName = normalizeName(name);
  const playlists = await readPlaylists();
  return [...requirePlaylist(playlists, normalizedName)];
}

export async function listPlaylists() {
  const playlists = await readPlaylists();

  return Object.entries(playlists)
    .map(([name, songs]) => ({ name, songs: [...songs] }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

export async function removeFromPlaylist(name, position) {
  const normalizedName = normalizeName(name);
  const playlists = await readPlaylists();
  const songs = requirePlaylist(playlists, normalizedName);
  const index = Number(position) - 1;

  if (!/^\d+$/.test(position) || index < 0 || index >= songs.length) {
    throw new Error(`Playlist position not found: ${position}`);
  }

  const [removedSong] = songs.splice(index, 1);
  await writePlaylists(playlists);
  return removedSong;
}
