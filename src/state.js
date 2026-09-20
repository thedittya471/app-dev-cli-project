import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const dataDirectory = new URL("../data/", import.meta.url);
const stateFile = new URL("player-state.json", dataDirectory);
const temporaryStateFile = new URL("player-state.tmp.json", dataDirectory);

export async function readState() {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export async function writeState(state) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryStateFile, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporaryStateFile, stateFile);
}

export async function clearState() {
  await rm(stateFile, { force: true });
}

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export async function getActiveState() {
  const state = await readState();

  if (!state) {
    return null;
  }

  if (!isProcessRunning(state.pid)) {
    await clearState();
    return null;
  }

  return state;
}