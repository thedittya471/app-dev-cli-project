import readline from "node:readline";
import { getSongPath, getSongs } from "./library.js";
import { pauseSong, resumeSong, startSong, stopSong } from "./player.js";
import {
  addToPlaylist,
  createPlaylist,
  getPlaylist,
  listPlaylists,
  removeFromPlaylist,
} from "./playlists.js";
import {
  clearState,
  getActiveState,
  isProcessRunning,
  writeState,
} from "./state.js";

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForProcessExit(pid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await wait(50);
  }

  throw new Error("Playback did not stop within 5 seconds.");
}

export async function runInteractive() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive mode requires a terminal.");
  }

  const librarySongs = await getSongs();

  if (librarySongs.length === 0) {
    console.log("No music files found.");
    return 0;
  }

  let songs = librarySongs;
  let activePlaylist = null;
  let selectedIndex = 0;
  let message = "Ready";
  let busy = false;
  let closing = false;
  let ownedPlayback = null;
  const intentionalStops = new Set();

  const initialState = await getActiveState();

  if (initialState?.playlist) {
    try {
      const availableSongs = new Set(librarySongs);
      const playlistSongs = (await getPlaylist(initialState.playlist)).filter((song) =>
        availableSongs.has(song),
      );

      if (playlistSongs.length > 0) {
        songs = playlistSongs;
        activePlaylist = initialState.playlist;
      }
    } catch (error) {
      message = error.message;
    }
  }

  const initialIndex = initialState ? songs.indexOf(initialState.song) : -1;

  if (initialIndex >= 0) {
    selectedIndex = initialIndex;
  }

  function render(state) {
    console.clear();
    console.log("🎵 Terminal Music Player\n");

    if (activePlaylist) {
      console.log(`Playlist: ${activePlaylist}\n`);
    }

    songs.forEach((song, index) => {
      const isActive = state?.song === song;
      const marker = isActive ? (state.status === "paused" ? "⏸" : "▶") : " ";
      const cursor = index === selectedIndex ? ">" : " ";
      console.log(`${cursor} ${marker} ${index + 1}. ${song}`);
    });

    console.log(
      "\n[p] Play/Pause  [n] Next  [b] Previous  [s] Stop  [l] Playlists  [q] Quit",
    );
    console.log(`\n${message}`);
  }

  async function refresh() {
    render(await getActiveState());
  }

  async function startSelected() {
    const song = songs[selectedIndex];
    const { pid, completion } = await startSong(getSongPath(song));

    try {
      await writeState({
        pid,
        currentIndex: selectedIndex,
        song,
        status: "playing",
        startedAt: new Date().toISOString(),
        ...(activePlaylist ? { playlist: activePlaylist } : {}),
      });
    } catch (error) {
      stopSong(pid);
      await completion;
      throw error;
    }

    ownedPlayback = { pid, completion };
    message = `Playing: ${song}`;

    void completion
      .then(async ({ code, signal }) => {
        await clearState(pid);

        if (ownedPlayback?.pid === pid) {
          ownedPlayback = null;
        }

        if (closing || intentionalStops.delete(pid)) {
          return;
        }

        message =
          code === 0 && !signal
            ? `Finished: ${song}`
            : `Playback ended${signal ? ` (${signal})` : ` with code ${code}`}.`;
        if (!busy) {
          await refresh();
        }
      })
      .catch((error) => {
        if (!closing) {
          message = error.message;

          if (!busy) {
            void refresh();
          }
        }
      });
  }

  async function stopActive(state) {
    if (!state) {
      message = "Nothing is currently playing.";
      return;
    }

    intentionalStops.add(state.pid);
    const stopped = stopSong(state.pid, state.status === "paused");

    if (stopped) {
      if (ownedPlayback?.pid === state.pid) {
        await ownedPlayback.completion;
      } else {
        await waitForProcessExit(state.pid);
      }
    }

    await clearState(state.pid);
    message = stopped ? `Stopped: ${state.song}` : "Nothing is currently playing.";
  }

  async function togglePlayback() {
    const state = await getActiveState();

    if (!state) {
      await startSelected();
      return;
    }

    const paused = state.status === "paused";
    const signaled = paused ? resumeSong(state.pid) : pauseSong(state.pid);

    if (!signaled) {
      await clearState(state.pid);
      message = "Nothing is currently playing.";
      return;
    }

    await writeState({ ...state, status: paused ? "playing" : "paused" });
    message = `${paused ? "Resumed" : "Paused"}: ${state.song}`;
  }

  async function changeTrack(offset) {
    const state = await getActiveState();
    const activeIndex = state ? songs.indexOf(state.song) : -1;
    const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex;

    if (state) {
      await stopActive(state);
    }

    selectedIndex = (currentIndex + offset + songs.length) % songs.length;
    await startSelected();
  }

  async function ask(question) {
    process.stdin.setRawMode(false);
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      return (await new Promise((resolve) => prompt.question(question, resolve))).trim();
    } finally {
      prompt.close();
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
  }

  function printPlaylists(playlists) {
    if (playlists.length === 0) {
      console.log("No playlists have been created yet.");
      return;
    }

    playlists.forEach((playlist, index) => {
      console.log(`${index + 1}. ${playlist.name} (${playlist.songs.length} songs)`);
    });
  }

  async function choosePlaylist(playlists) {
    if (playlists.length === 0) {
      throw new Error("No playlists have been created yet.");
    }

    const selection = await ask("Playlist name or number: ");
    const playlist = /^\d+$/.test(selection)
      ? playlists[Number(selection) - 1]
      : playlists.find((entry) => entry.name === selection);

    if (!playlist) {
      throw new Error(`Playlist not found: ${selection}`);
    }

    return playlist;
  }

  async function openPlaylistMenu() {
    console.clear();
    console.log("🎵 Playlists\n");
    const playlists = await listPlaylists();
    printPlaylists(playlists);
    console.log(
      "\n[c] Create  [a] Add selected song  [s] Show  [p] Play  [r] Remove entry  [u] Full library  [b] Back",
    );

    const action = (await ask("\nChoose an action: ")).toLowerCase();

    if (action === "" || action === "b") {
      return;
    }

    if (action === "c") {
      const name = await ask("New playlist name: ");
      const playlist = await createPlaylist(name);
      message = `Created playlist: ${playlist}`;
      return;
    }

    if (action === "u") {
      const state = await getActiveState();
      songs = librarySongs;
      activePlaylist = null;
      selectedIndex = Math.max(state ? songs.indexOf(state.song) : 0, 0);
      message = "Using the full music library.";
      return;
    }

    if (!["a", "s", "p", "r"].includes(action)) {
      throw new Error(`Unknown playlist action: ${action}`);
    }

    const playlist = await choosePlaylist(playlists);

    if (action === "a") {
      const song = songs[selectedIndex];
      await addToPlaylist(playlist.name, song);
      message = `Added to ${playlist.name}: ${song}`;
      return;
    }

    if (action === "s") {
      const availableSongs = new Set(librarySongs);
      const entries = playlist.songs.map(
        (song, index) =>
          `${index + 1}. ${song}${availableSongs.has(song) ? "" : " (missing)"}`,
      );
      message = entries.length > 0 ? `${playlist.name}:\n${entries.join("\n")}` : `${playlist.name} is empty.`;
      return;
    }

    if (action === "r") {
      if (playlist.songs.length === 0) {
        throw new Error(`Playlist "${playlist.name}" is empty.`);
      }

      playlist.songs.forEach((song, index) => console.log(`${index + 1}. ${song}`));
      const position = await ask("Entry number to remove: ");
      const removed = await removeFromPlaylist(playlist.name, position);
      message = `Removed from ${playlist.name}: ${removed}`;
      return;
    }

    const availableSongs = new Set(librarySongs);
    const playlistSongs = playlist.songs.filter((song) => availableSongs.has(song));

    if (playlistSongs.length === 0) {
      throw new Error(`Playlist "${playlist.name}" has no playable songs.`);
    }

    await stopActive(await getActiveState());
    songs = playlistSongs;
    activePlaylist = playlist.name;
    selectedIndex = 0;
    await startSelected();
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });

  function restoreTerminal() {
    process.stdin.off("keypress", handleKeypress);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  async function quit() {
    closing = true;
    let exitCode = 0;

    try {
      await stopActive(await getActiveState());
    } catch (error) {
      exitCode = 1;
      console.error(`\n${error.message}`);
    } finally {
      restoreTerminal();
      console.log("\nGoodbye!");
      finish(exitCode);
    }
  }

  async function handleKeypress(_input, key = {}) {
    if (busy) {
      return;
    }

    const action = key.ctrl && key.name === "c" ? "q" : key.name;

    if (!["p", "n", "b", "s", "l", "q"].includes(action)) {
      return;
    }

    busy = true;

    try {
      if (action === "p") {
        await togglePlayback();
      } else if (action === "n") {
        await changeTrack(1);
      } else if (action === "b") {
        await changeTrack(-1);
      } else if (action === "s") {
        await stopActive(await getActiveState());
      } else if (action === "l") {
        await openPlaylistMenu();
      } else {
        await quit();
        return;
      }
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }

    await refresh();
  }

  process.stdin.on("keypress", handleKeypress);

  try {
    await refresh();
    return await finished;
  } finally {
    if (!closing) {
      restoreTerminal();
    }
  }
}
