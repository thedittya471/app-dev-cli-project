import { spawn } from "node:child_process";

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

export async function playSong(filePath) {
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

  let playback;

  try {
    playback = await runFfplay(["-nodisp", "-autoexit", filePath]);
  } catch (error) {
    throw new Error(`Unable to start playback: ${error.message}`);
  }

  if (playback.signal) {
    throw new Error(`Playback was interrupted by ${playback.signal}.`);
  }

  if (playback.code !== 0) {
    throw new Error(`Playback failed with exit code ${playback.code}.`);
  }
}
