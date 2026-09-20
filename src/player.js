import { spawn } from "node:child_process";

const supportsPlaybackSignals = process.platform === "darwin" || process.platform === "linux";

function runFfplay(args) {
  return new Promise((resolve, reject) => {
    const process = spawn("ffplay", args, {
      shell: false,
      stdio: "ignore",
    });

    process.once("error", reject);
    process.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export async function startSong(filePath) {
  let check;

  try {
    check = await runFfplay(["-version"]);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("ffplay is not installed or is not available in PATH.");
    }

    throw new Error(`Unable to start ffplay: ${error.message}`);
  }

  if (check.code !== 0) {
    throw new Error("ffplay is installed but failed its availability check.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn("ffplay", ["-nodisp", "-autoexit", filePath], {
      shell: false,
      stdio: "ignore",
    });
    const completion = new Promise((resolveCompletion) => {
      child.once("close", (code, signal) => resolveCompletion({ code, signal }));
    });

    child.once("error", (error) => {
      reject(new Error(`Unable to start playback: ${error.message}`));
    });
    child.once("spawn", () => resolve({ pid: child.pid, completion }));
  });
}

function sendSignal(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }

    throw error;
  }
}

function requirePlaybackSignals() {
  if (!supportsPlaybackSignals) {
    throw new Error("Pause and resume are supported only on macOS and Linux.");
  }
}

export function pauseSong(pid) {
  requirePlaybackSignals();
  return sendSignal(pid, "SIGSTOP");
}

export function resumeSong(pid) {
  requirePlaybackSignals();
  return sendSignal(pid, "SIGCONT");
}

export function stopSong(pid, wasPaused = false) {
  const stopped = sendSignal(pid, "SIGTERM");

  if (stopped && wasPaused && supportsPlaybackSignals) {
    sendSignal(pid, "SIGCONT");
  }

  return stopped;
}
