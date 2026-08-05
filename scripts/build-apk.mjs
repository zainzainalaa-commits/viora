#!/usr/bin/env node
// Builds an Android APK.
//
// `tauri android build` cannot run on a Windows host without Developer Mode:
// it symlinks the compiled .so into jniLibs, and Windows refuses symlink
// creation to unprivileged users. This drives the same three stages directly
// and copies the library instead, which needs no elevation.
//
//   node scripts/build-apk.mjs [--release] [--arch arm64|arm|x86|x86_64] [--skip-web]

import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = join(ROOT, "src-tauri", "gen", "android");

const ARCHES = {
  arm64: { triple: "aarch64-linux-android", abi: "arm64-v8a", gradle: "Arm64", cc: "aarch64-linux-android" },
  arm: { triple: "armv7-linux-androideabi", abi: "armeabi-v7a", gradle: "Arm", cc: "armv7a-linux-androideabi" },
  x86: { triple: "i686-linux-android", abi: "x86", gradle: "X86", cc: "i686-linux-android" },
  x86_64: { triple: "x86_64-linux-android", abi: "x86_64", gradle: "X86_64", cc: "x86_64-linux-android" },
};

/** minSdk in app/build.gradle.kts; the NDK clang wrapper is named per API level. */
const API_LEVEL = 24;

const args = process.argv.slice(2);
const release = args.includes("--release");
const skipWeb = args.includes("--skip-web");
const archKey = valueOf("--arch") ?? "arm64";
const arch = ARCHES[archKey];
if (!arch) fail(`unknown --arch "${archKey}". Use one of: ${Object.keys(ARCHES).join(", ")}`);

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function step(n, total, msg) {
  console.log(`\n[${n}/${total}] ${msg}`);
}

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p)) ?? null;
}

/** Newest versioned subdirectory, e.g. the highest NDK release installed. */
function newestChild(dir) {
  if (!existsSync(dir)) return null;
  const kids = readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  return kids.length ? kids[kids.length - 1] : null;
}

function detectToolchain() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const localAppData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");

  const sdk = firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(localAppData, "Android", "Sdk"),
    join(home, "Android", "Sdk"),
  ]);
  if (!sdk) fail("Android SDK not found. Set ANDROID_HOME.");

  const ndk = firstExisting([process.env.NDK_HOME, process.env.ANDROID_NDK_ROOT]) ?? newestChild(join(sdk, "ndk"));
  if (!ndk) fail(`No NDK under ${join(sdk, "ndk")}. Install one via the SDK manager.`);

  const hostTag = process.platform === "win32" ? "windows-x86_64" : process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64";
  const ndkBin = join(ndk, "toolchains", "llvm", "prebuilt", hostTag, "bin");
  if (!existsSync(ndkBin)) fail(`NDK toolchain missing at ${ndkBin}`);

  const jdk =
    firstExisting([process.env.JAVA_HOME]) ??
    newestChild(join(localAppData, "Programs", "Microsoft")) ??
    newestChild(join(process.env.ProgramFiles ?? "", "Microsoft"));
  if (!jdk || !existsSync(join(jdk, "bin"))) fail("JDK 17 not found. Set JAVA_HOME.");

  return { sdk, ndk, ndkBin, jdk };
}

const tc = detectToolchain();
const ext = process.platform === "win32" ? ".cmd" : "";
const clang = join(tc.ndkBin, `${arch.cc}${API_LEVEL}-clang${ext}`);
if (!existsSync(clang)) fail(`NDK clang missing: ${clang}`);

// Cargo reads the linker and C compiler from per-target env vars. The names use
// underscores where the triple uses hyphens.
const envKey = arch.triple.replace(/-/g, "_");
const env = {
  ...process.env,
  ANDROID_HOME: tc.sdk,
  ANDROID_NDK_ROOT: tc.ndk,
  NDK_HOME: tc.ndk,
  JAVA_HOME: tc.jdk,
  [`CC_${envKey}`]: clang,
  [`CXX_${envKey}`]: join(tc.ndkBin, `${arch.cc}${API_LEVEL}-clang++${ext}`),
  [`AR_${envKey}`]: join(tc.ndkBin, `llvm-ar${process.platform === "win32" ? ".exe" : ""}`),
  [`CARGO_TARGET_${arch.triple.replace(/-/g, "_").toUpperCase()}_LINKER`]: clang,
  PATH: `${join(tc.jdk, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
};

function run(cmd, cwd) {
  execSync(cmd, { cwd, env, stdio: "inherit" });
}

/**
 * `settings.gradle` applies `tauri.settings.gradle`, which lists the Android
 * modules of every Tauri plugin with absolute paths into the Cargo registry.
 * Only the Tauri CLI knows how to resolve those, and it writes the file during
 * `android build` — before the symlink step this script exists to avoid. So we
 * let that command run and fail, then check the file appeared.
 */
function ensureTauriSettings() {
  const settings = join(ANDROID, "tauri.settings.gradle");
  if (existsSync(settings)) return;
  console.log("    tauri.settings.gradle missing — generating it via the Tauri CLI");
  try {
    execSync(`pnpm exec tauri android build --debug --target ${archKey} --apk`, {
      cwd: ROOT,
      env,
      stdio: "ignore",
    });
  } catch {
    // Expected: it gets as far as the symlink and stops there.
  }
  if (!existsSync(settings)) {
    fail(
      "could not generate tauri.settings.gradle.\n" +
        "  Run `pnpm exec tauri android init` once, then retry.",
    );
  }
}

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const profile = release ? "release" : "debug";
const gradleProfile = release ? "Release" : "Debug";
const total = skipWeb ? 3 : 4;
let n = 0;

console.log(`\nViora ${version} — Android ${arch.abi} (${profile})`);

if (!skipWeb) {
  step(++n, total, "Building the web bundle");
  run("pnpm run build", ROOT);
}

step(++n, total, `Compiling the native library for ${arch.triple}`);
run(
  `cargo build --target ${arch.triple}${release ? " --release" : ""} --manifest-path "${join(ROOT, "src-tauri", "Cargo.toml")}"`,
  ROOT,
);

step(++n, total, "Staging the library into jniLibs");
const soName = "libviora_lib.so";
const built = join(ROOT, "src-tauri", "target", arch.triple, profile, soName);
if (!existsSync(built)) fail(`expected ${built} — did the Cargo lib name change?`);
const jniDir = join(ANDROID, "app", "src", "main", "jniLibs", arch.abi);
mkdirSync(jniDir, { recursive: true });
// A plain copy is the whole point: this is the step tauri does with a symlink.
copyFileSync(built, join(jniDir, soName));
console.log(`    ${(statSync(built).size / 1024 / 1024).toFixed(1)} MB -> jniLibs/${arch.abi}/`);

step(++n, total, "Packaging the APK");
ensureTauriSettings();
const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
// The excluded task is the one that shells back out to tauri and symlinks;
// stage 3 already produced its output.
run(
  `${gradlew} assemble${arch.gradle}${gradleProfile} -x rustBuild${arch.gradle}${gradleProfile} --no-daemon`,
  ANDROID,
);

const apkDir = join(ANDROID, "app", "build", "outputs", "apk", archKey === "arm64" ? "arm64" : archKey, profile);
const apk = existsSync(apkDir) ? readdirSync(apkDir).find((f) => f.endsWith(".apk")) : null;
if (!apk) fail(`build reported success but no APK under ${apkDir}`);

const apkPath = join(apkDir, apk);
console.log(`\n✔ ${apk}  (${(statSync(apkPath).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  ${apkPath}\n`);

if (release) {
  console.log("  Release APKs are unsigned. Sign before distributing:");
  console.log("  apksigner sign --ks my-release.jks --out viora.apk " + apk + "\n");
}

void execFileSync;
