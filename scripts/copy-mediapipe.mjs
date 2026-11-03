// Copies the MediaPipe runtime (JS + WASM) into public/ so the app serves it itself. Runs before every build.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/mediapipe", { recursive: true });
cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe", { recursive: true });
console.log("copied MediaPipe runtime to public/mediapipe");
