const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const querystring = require("node:querystring");
const { Readable } = require("node:stream");
const adbhost = require("adbhost");
const AdbPacket = require("adbhost/lib/packet.js");
const JSZip = require("jszip");
const forge = require("node-forge");
const { DOMParser } = require("@xmldom/xmldom");
const { Signature, SamsungCertificateCreator } = require("tizen");

const configPath = path.join(__dirname, "..", "installer.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const isWindows = process.platform === "win32";
const appIconPath = path.join(__dirname, "..", "build", "icon.png");
const adbCommands = AdbPacket.commands;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: "Nuvio TV Installer",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function emit(event, payload) {
  event.sender.send("installer:log", payload);
}

function executableCandidates(command) {
  const names = isWindows ? [`${command}.exe`, `${command}.bat`, `${command}.cmd`, command] : [command];
  const home = os.homedir();
  const localBinDir = path.join(__dirname, "..", "node_modules", ".bin");
  const roots = isWindows
    ? [
        "C:\\tizen-studio",
        path.join(process.env.LOCALAPPDATA || "", "tizen-studio")
      ]
    : [
        path.join(home, "tizen-studio"),
        "/opt/tizen-studio"
      ];

  const tizenSubdir = command === "tizen" ? path.join("tools", "ide", "bin") : "tools";
  return [
    ...names.map((name) => path.join(localBinDir, name)),
    ...webOsCliCandidates(command),
    ...roots.flatMap((root) => names.map((name) => path.join(root, tizenSubdir, name)))
  ];
}

function webOsCliCandidates(command) {
  if (!command.startsWith("ares")) {
    return [];
  }

  try {
    const packageJsonPath = require.resolve("@webos-tools/cli/package.json");
    const packageRoot = path.dirname(packageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const binPath = packageJson.bin?.[command];
    return binPath ? [path.join(packageRoot, binPath)] : [];
  } catch {
    return [];
  }
}

function lookupCommand(command) {
  return new Promise((resolve) => {
    const lookup = isWindows ? "where" : "which";
    const child = spawn(lookup, [command], { shell: false });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("exit", (code) => {
      const firstMatch = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      resolve(code === 0 && firstMatch ? firstMatch : "");
    });
    child.on("error", () => resolve(""));
  });
}

async function resolveCommand(command) {
  const fromPath = await lookupCommand(command);
  if (fromPath) {
    return fromPath;
  }

  for (const candidate of executableCandidates(command)) {
    try {
      await fsp.access(candidate, candidate.endsWith(".js") ? fs.constants.R_OK : fs.constants.X_OK);
      return candidate;
    } catch {}
  }

  return "";
}

function runCommand(event, command, args, options = {}) {
  const spawnSpec = resolveSpawnSpec(command, args);
  emit(event, { type: "command", text: `$ ${spawnSpec.displayCommand} ${formatCommandArgs(spawnSpec.args)}` });

  return new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      shell: false,
      cwd: options.cwd || undefined,
      env: spawnSpec.env
    });

    child.stdout.on("data", (chunk) => emit(event, { type: "stdout", text: chunk.toString() }));
    child.stderr.on("data", (chunk) => emit(event, { type: "stderr", text: chunk.toString() }));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`${command} exited with code ${code}`);
        error.code = code;
        reject(error);
      }
    });
  });
}

function captureCommand(event, command, args, options = {}) {
  const spawnSpec = resolveSpawnSpec(command, args);
  emit(event, { type: "command", text: `$ ${spawnSpec.displayCommand} ${formatCommandArgs(spawnSpec.args)}` });

  return new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      shell: false,
      cwd: options.cwd || undefined,
      env: spawnSpec.env
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      emit(event, { type: "stdout", text });
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      emit(event, { type: "stderr", text });
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function resolveSpawnSpec(command, args) {
  if (String(command).endsWith(".js")) {
    return {
      command: process.execPath,
      args: [command, ...args],
      displayCommand: command,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      }
    };
  }

  return {
    command,
    args,
    displayCommand: command,
    env: process.env
  };
}

function formatCommandArgs(args) {
  const hiddenValueFlags = new Set(["--passphrase"]);
  return args
    .map((arg, index) => hiddenValueFlags.has(args[index - 1]) ? "********" : arg)
    .join(" ");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Nuvio-TV-Installer"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(event, url, targetPath) {
  emit(event, { type: "info", text: `Download ${url}` });
  const response = await fetch(url, {
    headers: { "User-Agent": "Nuvio-TV-Installer" }
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const file = fs.createWriteStream(targetPath);
  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(response.body);
    body.pipe(file);
    body.on("error", reject);
    file.on("finish", resolve);
    file.on("error", reject);
  });
}

async function resolveReleaseAsset(event, platform) {
  const platformConfig = config[platform];
  const release = await fetchJson(`https://api.github.com/repos/${config.githubRepo}/releases/latest`);
  const matcher = new RegExp(platformConfig.assetPattern, "i");
  const asset = release.assets.find((item) => matcher.test(item.name));

  if (!asset) {
    throw new Error(`No ${platform} asset matching ${platformConfig.assetPattern} found in latest release.`);
  }

  const cacheDir = path.join(app.getPath("userData"), "packages", release.tag_name || "latest");
  const targetPath = path.join(cacheDir, asset.name);

  try {
    await fsp.access(targetPath, fs.constants.R_OK);
    emit(event, { type: "info", text: `Using already downloaded package: ${targetPath}` });
  } catch {
    await downloadFile(event, asset.browser_download_url, targetPath);
  }

  return targetPath;
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

async function runLg(event, action, options) {
  const ip = String(options.ip || "").trim();
  const passphrase = String(options.lgPassphrase || "").trim();
  const device = passphrase
    ? await configureLgDevice(event, ip, options.deviceName, passphrase)
    : requireValue(options.deviceName || ip, "LG device name/IP");
  const aresInstall = await resolveCommand("ares-install");
  if (!aresInstall) {
    throw new Error("ares-install was not found in the app package.");
  }

  if (action === "launch") {
    const aresLaunch = await resolveCommand("ares-launch");
    if (!aresLaunch) {
      throw new Error("ares-launch was not found in the app package.");
    }
    await runCommand(event, aresLaunch, ["--device", device, config.webos.appId]);
    return;
  }

  if (action === "uninstall") {
    await runCommand(event, aresInstall, ["--device", device, "--remove", config.webos.appId]);
    return;
  }

  const packagePath = options.packagePath || await resolveReleaseAsset(event, "webos");
  await runCommand(event, aresInstall, ["--device", device, packagePath]);
}

function defaultLgDeviceName(ip) {
  return `nuvio-lg-${String(ip || "").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "tv"}`;
}

async function configureLgDevice(event, ip, requestedDeviceName, passphrase) {
  const host = requireValue(ip, "IP LG TV");
  const deviceName = String(requestedDeviceName || "").trim() || defaultLgDeviceName(host);
  const aresSetupDevice = await resolveCommand("ares-setup-device");
  const aresNovacom = await resolveCommand("ares-novacom");

  if (!aresSetupDevice || !aresNovacom) {
    throw new Error("webOS commands ares-setup-device/ares-novacom were not found in the app package.");
  }

  emit(event, { type: "info", text: `Automatically configuring LG webOS device: ${deviceName}` });

  const deviceInfoArgs = [
    "--info", "username=prisoner",
    "--info", `host=${host}`,
    "--info", "port=9922",
    "--info", "default=true"
  ];

  try {
    await runCommand(event, aresSetupDevice, ["--add", deviceName, ...deviceInfoArgs]);
  } catch (error) {
    emit(event, { type: "info", text: "LG device already exists or add failed, trying modify." });
    await runCommand(event, aresSetupDevice, ["--modify", deviceName, ...deviceInfoArgs]);
  }

  await runCommand(event, aresNovacom, ["--device", deviceName, "--getkey", "--passphrase", passphrase]);
  emit(event, { type: "success", text: "LG connection configured." });
  return deviceName;
}

function parseSdbTarget(output, ip) {
  const normalizedIp = String(ip || "").trim();
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .find((target) => target && target !== "List" && target.includes(normalizedIp)) || "";
}

async function connectSamsungDevice(event, sdb, ip) {
  await runCommand(event, sdb, ["connect", ip]);
  const devices = await captureCommand(event, sdb, ["devices"]);
  const target = parseSdbTarget(devices.stdout, ip);
  if (!target) {
    throw new Error(`Samsung TV was not found in "sdb devices" after connecting to ${ip}. Check Developer Mode and Host PC IP on the TV.`);
  }
  emit(event, { type: "info", text: `Detected SDB target: ${target}` });
  return target;
}

function connectSamsungAdb(event, ip) {
  emit(event, { type: "info", text: `Direct connection to Samsung TV ${ip}:26101.` });

  return new Promise((resolve, reject) => {
    const adbClient = adbhost.createConnection({ host: ip, port: 26101 });
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        try {
          adbClient._stream?.destroy();
        } catch {}
        reject(error);
        return;
      }
      emit(event, { type: "success", text: "Direct Samsung connection is active." });
      resolve(adbClient);
    }

    const timeout = setTimeout(() => {
      finish(new Error("Timed out while opening direct Samsung connection."));
    }, 6000);

    adbClient._stream.on("connect", () => {
      setTimeout(() => finish(), 800);
    });
    adbClient._stream.on("error", (error) => {
      finish(error);
    });
    adbClient._stream.on("close", () => {
      if (!settled) {
        finish(new Error("Direct Samsung connection was closed."));
      }
    });
  });
}

async function connectSamsungTransport(event, ip) {
  try {
    const adbClient = await connectSamsungAdb(event, ip);
    return { type: "adb", adbClient, target: ip };
  } catch (error) {
    emit(event, { type: "info", text: `Direct connection failed (${error.message}). Trying sdb fallback.` });
  }

  const sdb = await resolveCommand("sdb");
  if (!sdb) {
    throw new Error("Unable to connect to the TV. Check Developer Mode, Host PC IP, and that the PC/TV are on the same network. sdb fallback is not available.");
  }

  const target = await connectSamsungDevice(event, sdb, ip);
  return { type: "sdb", sdb, target };
}

function closeSamsungTransport(transport) {
  if (transport?.type !== "adb") {
    return;
  }

  try {
    transport.adbClient?._stream?.end();
    transport.adbClient?._stream?.destroy();
  } catch {}
}

function adbCreateStream(adbClient, command) {
  return new Promise((resolve, reject) => {
    const stream = adbClient.createStream(command);
    let output = "";
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(output);
    }

    stream.on("data", (chunk) => {
      output += chunk.toString();
    });
    stream.on("error", finish);
    stream.on("end", () => finish());
    stream.on("close", () => finish());
  });
}

async function captureSamsungShell(event, transport, args) {
  if (transport.type === "adb") {
    const command = `shell:${args.join(" ")}`;
    emit(event, { type: "command", text: `$ adbhost ${command}` });
    const stdout = await adbCreateStream(transport.adbClient, command);
    if (stdout) {
      emit(event, { type: "stdout", text: stdout });
    }
    return { stdout, stderr: "" };
  }

  return captureCommand(event, transport.sdb, ["-s", transport.target, "shell", ...args]);
}

async function runSamsungShell(event, transport, args) {
  const result = await captureSamsungShell(event, transport, args);
  return result.stdout;
}

function pushFileAdb(adbClient, remotePath, data) {
  return new Promise((resolve, reject) => {
    const shell = adbClient.createStream("sync:");
    let interval;
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    const timeout = setTimeout(() => {
      finish(new Error(`Timeout push ${remotePath}`));
    }, 30000);

    shell.on("error", (error) => {
      finish(error);
    });

    interval = setInterval(() => {
      if (shell._remoteId === -1) {
        return;
      }

      try {
        const statBuffer = Buffer.alloc(8);
        statBuffer.write("STAT", 0);
        statBuffer.writeUInt32LE(remotePath.length, 4);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, statBuffer);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, Buffer.from(remotePath));

        const sendBuffer = Buffer.alloc(8);
        sendBuffer.writeUInt32LE(0x444E4553, 0);
        sendBuffer.writeUInt32LE(remotePath.length + 6, 4);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, sendBuffer);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, Buffer.from(`${remotePath},33261`));

        for (let offset = 0; offset < data.length; offset += 1420) {
          const chunk = data.slice(offset, offset + 1420);
          const buffer = Buffer.alloc(8 + chunk.length);
          buffer.write("DATA", 0);
          buffer.writeUInt32LE(chunk.length, 4);
          chunk.copy(buffer, 8);
          adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, buffer);
        }

        const doneData = Buffer.alloc(8);
        doneData.write("DONE", 0);
        doneData.writeUInt32LE(Math.floor(Date.now() / 1000), 4);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, doneData);

        const quitData = Buffer.alloc(8);
        quitData.write("QUIT", 0);
        adbClient._writePacket(adbCommands.WRTE, shell._localId, shell._remoteId, quitData);

        finish();
      } catch (error) {
        finish(error);
      }
    }, 100);
  });
}

async function pushSamsungFile(event, transport, localPath, remotePath) {
  if (transport.type === "adb") {
    emit(event, { type: "command", text: `$ adbhost push ${localPath} ${remotePath}` });
    await pushFileAdb(transport.adbClient, remotePath, fs.readFileSync(localPath));
    return;
  }

  await runCommand(event, transport.sdb, ["-s", transport.target, "push", localPath, remotePath]);
}

function throwIfSamsungOutputFailed(output, context) {
  const failedLine = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /install failed|uninstall failed|check certificate error|error/i.test(line));

  if (failedLine) {
    throw new Error(`${context}: ${failedLine}`);
  }
}

function getSamsungCertificateConfigPath(target) {
  const safeTarget = String(target || "default").replace(/[^a-z0-9_.-]+/gi, "_");
  return path.join(app.getPath("userData"), "samsung-certificates", `${safeTarget}.json`);
}

async function readSamsungCertificateConfig(target) {
  try {
    const configJson = await fsp.readFile(getSamsungCertificateConfigPath(target), "utf8");
    return JSON.parse(configJson);
  } catch {
    return null;
  }
}

async function writeSamsungCertificateConfig(target, certificateConfig) {
  const configPath = getSamsungCertificateConfigPath(target);
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  await fsp.writeFile(configPath, JSON.stringify(certificateConfig, null, 2));
}

function samsungAccessInfoHtml(status = "waiting") {
  const isDone = status === "done";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nuvio Samsung Login</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: Arial, sans-serif; color: #f4f7fb; background: #111418; display: grid; place-items: center; }
    main { width: min(720px, calc(100vw - 32px)); border: 1px solid #2c3440; border-radius: 8px; padding: 24px; background: #161b22; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { color: #aab6c5; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${isDone ? "Samsung authorization complete" : "Samsung authorization in progress"}</h1>
    <p>${isDone ? "You can close this window and return to the Nuvio installer. The process will continue automatically." : "Complete the Samsung login in the opened window. The Nuvio installer will receive authorization automatically."}</p>
  </main>
</body>
</html>`;
}

function parseSamsungAccessInfo(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

  const value = String(rawValue).trim();
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {}

  const parsed = querystring.parse(value);
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function extractSamsungAccessInfoFromRequest(request, body = "") {
  const url = new URL(request.url, "http://127.0.0.1:4794");
  const queryInfo = parseSamsungAccessInfo(url.searchParams.get("code") || url.searchParams.get("accessInfo"));
  if (queryInfo) {
    return queryInfo;
  }

  const queryObject = Object.fromEntries(url.searchParams.entries());
  if (queryObject.access_token || queryObject.accessToken) {
    return queryObject;
  }

  const formBody = querystring.parse(body);
  return parseSamsungAccessInfo(formBody.code || formBody.accessInfo) || formBody;
}

function hasSamsungAccessInfo(accessInfo) {
  return Boolean(accessInfo && (accessInfo.access_token || accessInfo.accessToken));
}

function waitForSamsungAccessInfo(event) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let server;

    function finish(accessInfo, response) {
      if (settled) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(samsungAccessInfoHtml("done"));
        return;
      }

      settled = true;
      clearTimeout(timeout);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(samsungAccessInfoHtml("done"));
      server.close();
      resolve(accessInfo);
    }

    const timeout = setTimeout(() => {
      if (server) {
        server.close();
      }
      reject(new Error("Samsung login timed out. Try the installation again and complete the login within 5 minutes."));
    }, 5 * 60 * 1000);

    server = http.createServer((request, response) => {
      if (request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          try {
            const accessInfo = extractSamsungAccessInfoFromRequest(request, body);
            if (!hasSamsungAccessInfo(accessInfo)) {
              response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
              response.end(samsungAccessInfoHtml());
              return;
            }
            finish(accessInfo, response);
          } catch (error) {
            response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            response.end(samsungAccessInfoHtml());
          }
        });
        return;
      }

      const accessInfo = extractSamsungAccessInfoFromRequest(request);
      if (hasSamsungAccessInfo(accessInfo)) {
        finish(accessInfo, response);
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(samsungAccessInfoHtml());
    });

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Unable to open the local Samsung server on port 4794: ${error.message}`));
    });

    server.listen(4794, "127.0.0.1", () => {
      const authUrl = "https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h&actionID=StartOAuth2&accessToken=Y&redirect_uri=http://localhost:4794/signin/callback";
      emit(event, { type: "info", text: "Opening Samsung login. Complete sign-in in the browser, then return to the installer." });
      shell.openExternal(authUrl);
    });
  });
}

async function getSamsungDuid(event, transport) {
  const result = await captureSamsungShell(event, transport, ["0", "getduid"]);
  const duid = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!duid) {
    throw new Error("Unable to read the Samsung TV DUID.");
  }
  emit(event, { type: "info", text: `Detected Samsung DUID: ${duid}` });
  return duid;
}

async function createSamsungCertificateForTarget(event, transport) {
  const duid = await getSamsungDuid(event, transport);
  const accessInfo = await waitForSamsungAccessInfo(event);
  const accessToken = accessInfo.access_token || accessInfo.accessToken;
  const userId = accessInfo.userId || accessInfo.user_id;
  if (!accessToken || !userId) {
    throw new Error("Samsung did not return valid authorization data. Try signing in again.");
  }
  const password = crypto.randomBytes(18).toString("base64url");
  const authorInfo = {
    name: "Nuvio",
    email: accessInfo.inputEmailID || accessInfo.email || userId,
    password,
    privilegeLevel: "Partner"
  };

  emit(event, { type: "info", text: "Creating the Samsung certificate for this TV. This may take 30-60 seconds." });
  const creator = new SamsungCertificateCreator();
  const certificate = await creator.createCertificate(authorInfo, {
    accessToken,
    userId
  }, [duid]);

  if (!certificate.authorCert || !certificate.distributorCert) {
    throw new Error("Samsung did not return a valid certificate.");
  }

  const certificateConfig = {
    authorCert: Buffer.from(certificate.authorCert, "binary").toString("base64"),
    distributorCert: Buffer.from(certificate.distributorCert, "binary").toString("base64"),
    distributorXML: certificate.distributorXML ? Buffer.from(certificate.distributorXML, "utf8").toString("base64") : "",
    password,
    duid,
    createdAt: new Date().toISOString()
  };

  await writeSamsungCertificateConfig(transport.target, certificateConfig);

  if (certificate.distributorXML) {
    const profilePath = path.join(app.getPath("userData"), "samsung-certificates", `${String(transport.target).replace(/[^a-z0-9_.-]+/gi, "_")}-device-profile.xml`);
    await fsp.writeFile(profilePath, certificate.distributorXML, "utf8");
    await runSamsungShell(event, transport, ["0", "mkdir", "-p", "/home/owner/share/tmp/sdk_tools"]);
    await pushSamsungFile(event, transport, profilePath, "/home/owner/share/tmp/sdk_tools/device-profile.xml");
  }

  emit(event, { type: "success", text: "Samsung certificate created and saved for this TV." });
  return certificateConfig;
}

async function getOrCreateSamsungCertificate(event, transport) {
  const existing = await readSamsungCertificateConfig(transport.target);
  if (existing?.authorCert && existing?.distributorCert && existing?.password) {
    emit(event, { type: "info", text: "Using the Samsung certificate already saved for this TV." });
    return existing;
  }
  return createSamsungCertificateForTarget(event, transport);
}

async function parseTizenPackageMetadata(packagePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(packagePath));
  const configFile = zip.files["config.xml"];
  const manifestFile = zip.files["tizen-manifest.xml"];

  if (configFile) {
    const xml = await configFile.async("string");
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const application = doc.getElementsByTagName("tizen:application")[0]
      || doc.getElementsByTagNameNS("http://tizen.org/ns/widgets", "application")[0];
    if (!application) {
      throw new Error("config.xml does not contain tizen:application.");
    }
    return {
      packageId: application.getAttribute("package") || "",
      appId: application.getAttribute("id") || "",
      extension: "wgt"
    };
  }

  if (manifestFile) {
    const xml = await manifestFile.async("string");
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const manifest = doc.getElementsByTagName("manifest")[0];
    return {
      packageId: manifest?.getAttribute("package") || "",
      appId: manifest?.getAttribute("package") || "",
      extension: "tpk"
    };
  }

  throw new Error("Invalid Tizen package: config.xml or tizen-manifest.xml is missing.");
}

function parseVdAppList(output) {
  return String(output || "")
    .split("---------------------------------------------------------------------------------------------")
    .map((entry) => entry
      .replace(/--------------/g, "")
      .replace(/-------------/g, "")
      .replace(/\s+=/g, "=")
      .replace(/\r/g, "")
      .trim())
    .filter(Boolean)
    .map((entry) => {
      const app = {};
      entry.split(/\n/).forEach((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          return;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        app[key] = value;
      });
      return app;
    })
    .filter((app) => Object.keys(app).length > 0);
}

function tizenIdentifierCandidates(...values) {
  return Array.from(new Set(values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

async function listSamsungApps(event, transport) {
  const result = await captureSamsungShell(event, transport, ["0", "vd_applist"]);
  return parseVdAppList(result.stdout);
}

async function findSamsungInstalledApp(event, transport, identifiers) {
  const candidates = tizenIdentifierCandidates(identifiers);
  if (candidates.length === 0) {
    return null;
  }

  const apps = await listSamsungApps(event, transport);
  return apps.find((app) => [
    app.app_id,
    app.app_tizen_id,
    app.app_package_id,
    app.package_id
  ].some((value) => candidates.includes(String(value || "").trim()))) || null;
}

async function resignTizenPackageWithSamsungCertificate(event, packagePath, certificateConfig) {
  emit(event, { type: "info", text: "Automatically signing the WGT with the saved Samsung certificate." });

  const zip = await JSZip.loadAsync(fs.readFileSync(packagePath));
  const unsignedFiles = await Promise.all(Object.keys(zip.files).map(async (filename) => {
    const file = zip.files[filename];
    if (file.dir || filename === "author-signature.xml" || filename === "signature1.xml") {
      return null;
    }
    return {
      uri: encodeURIComponent(filename),
      data: await file.async("nodebuffer")
    };
  }));

  const authorDer = forge.util.createBuffer(Buffer.from(certificateConfig.authorCert, "base64").toString("binary"));
  const distributorDer = forge.util.createBuffer(Buffer.from(certificateConfig.distributorCert, "base64").toString("binary"));
  const authorKey = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(authorDer), false, certificateConfig.password);
  const distributorKey = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(distributorDer), false, certificateConfig.password);

  const authorSignature = new Signature("AuthorSignature", unsignedFiles.filter(Boolean));
  const authorFiles = await authorSignature.sign(authorKey);
  const distributorSignature = new Signature("DistributorSignature", authorFiles);
  const distributorFiles = await distributorSignature.sign(distributorKey);

  const outputZip = new JSZip();
  distributorFiles.forEach((file) => {
    outputZip.file(decodeURIComponent(file.uri), file.data);
  });

  const outputDir = path.join(app.getPath("userData"), "resigned");
  await fsp.mkdir(outputDir, { recursive: true });
  const parsed = path.parse(packagePath);
  const resignedPackage = path.join(outputDir, `${parsed.name}-samsung-signed-${Date.now()}${parsed.ext || ".wgt"}`);
  const zipData = await outputZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fsp.writeFile(resignedPackage, zipData);

  emit(event, { type: "info", text: `Automatically signed WGT: ${resignedPackage}` });
  return resignedPackage;
}

async function prepareSamsungPackage(event, transport, packagePath) {
  const certificateConfig = await getOrCreateSamsungCertificate(event, transport);
  return resignTizenPackageWithSamsungCertificate(event, packagePath, certificateConfig);
}

async function installSamsungPackage(event, transport, packagePath) {
  const metadata = await parseTizenPackageMetadata(packagePath);
  const installIds = tizenIdentifierCandidates(metadata.appId, metadata.packageId);
  if (installIds.length === 0) {
    throw new Error("Unable to read the application id or package id from the Tizen package.");
  }

  const remotePath = `/home/owner/share/tmp/sdk_tools/nuvio-package.${metadata.extension}`;
  emit(event, { type: "info", text: `Detected package id: ${metadata.packageId}` });
  if (metadata.appId) {
    emit(event, { type: "info", text: `Detected application id: ${metadata.appId}` });
  }

  await runSamsungShell(event, transport, ["0", "mkdir", "-p", "/home/owner/share/tmp/sdk_tools"]);
  await pushSamsungFile(event, transport, packagePath, remotePath);

  let lastError = null;
  for (const installId of installIds) {
    try {
      const output = await runSamsungShell(event, transport, ["0", "vd_appinstall", installId, remotePath]);
      throwIfSamsungOutputFailed(output, "vd_appinstall failed");
      return metadata;
    } catch (error) {
      lastError = error;
      emit(event, { type: "info", text: `vd_appinstall with ${installId} failed, trying the next identifier if available.` });
    }
  }

  throw lastError || new Error("vd_appinstall failed.");
}

async function uninstallSamsungApp(event, transport, identifiers) {
  const candidates = tizenIdentifierCandidates(identifiers);
  const installedApp = await findSamsungInstalledApp(event, transport, candidates).catch(() => null);
  const uninstallIds = tizenIdentifierCandidates(
    installedApp?.app_id,
    installedApp?.app_tizen_id,
    candidates
  );

  let lastError = null;
  for (const uninstallId of uninstallIds) {
    try {
      const output = await runSamsungShell(event, transport, ["0", "vd_appuninstall", uninstallId]);
      throwIfSamsungOutputFailed(output, "vd_appuninstall failed");
      return;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    if (transport.type !== "sdb") {
      throw lastError || new Error("sdb uninstall fallback is not available with a direct connection.");
    }
    await runCommand(event, transport.sdb, ["-s", transport.target, "uninstall", candidates[0] || config.tizen.appId]);
  } catch (fallbackError) {
    const tizen = await resolveCommand("tizen");
    if (!tizen) {
      throw lastError || fallbackError;
    }
    emit(event, { type: "info", text: "vd_appuninstall/sdb uninstall failed, trying fallback with the tizen CLI found on the system." });
    await runCommand(event, tizen, ["uninstall", "-p", candidates[0] || config.tizen.appId, "-t", transport.target]);
  }
}

async function launchSamsungApp(event, transport, identifiers) {
  const installedApp = await findSamsungInstalledApp(event, transport, identifiers);
  const launchId = installedApp?.app_id || installedApp?.app_tizen_id || tizenIdentifierCandidates(identifiers)[0];
  if (!launchId) {
    throw new Error("Samsung app was not found. Install Nuvio or check appId in installer.config.json.");
  }
  const output = await runSamsungShell(event, transport, ["0", "was_execute", launchId]);
  throwIfSamsungOutputFailed(output, "Samsung app launch failed");
}

async function runSamsung(event, action, options) {
  const ip = requireValue(options.ip, "IP Samsung TV");
  const transport = await connectSamsungTransport(event, ip);
  const configuredIds = tizenIdentifierCandidates(config.tizen.appId, config.tizen.packageId, config.tizen.appIds);

  try {
    if (action === "launch") {
      await launchSamsungApp(event, transport, configuredIds);
      return;
    }

    if (action === "uninstall") {
      await uninstallSamsungApp(event, transport, configuredIds);
      return;
    }

    const packagePath = options.packagePath || await resolveReleaseAsset(event, "tizen");
    const installPackagePath = await prepareSamsungPackage(event, transport, packagePath);
    try {
      await installSamsungPackage(event, transport, installPackagePath);
    } catch (error) {
      try {
        if (transport.type !== "sdb") {
          throw error;
        }
        emit(event, { type: "info", text: "vd_appinstall failed, trying fallback with sdb install." });
        await runCommand(event, transport.sdb, ["-s", transport.target, "install", installPackagePath]);
      } catch (fallbackError) {
        const tizen = await resolveCommand("tizen");
        if (!tizen) {
          throw error;
        }
        emit(event, { type: "info", text: "sdb install failed, trying fallback with the tizen CLI found on the system." });
        await runCommand(event, tizen, ["install", "-n", installPackagePath, "-t", transport.target]);
      }
    }

    emit(event, {
      type: "info",
      text: "Like TizenBrew: if you want to use debug/autolaunch, set Host PC IP to 127.0.0.1 on the TV after installation."
    });
  } finally {
    closeSamsungTransport(transport);
  }
}

ipcMain.handle("installer:run", async (event, request) => {
  const platform = request.platform;
  const action = request.action;
  emit(event, { type: "info", text: `Starting ${action} on ${platform}.` });

  try {
    if (platform === "lg") {
      await runLg(event, action, request.options || {});
    } else if (platform === "samsung") {
      await runSamsung(event, action, request.options || {});
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    emit(event, { type: "success", text: "Operation completed." });
    return { ok: true };
  } catch (error) {
    emit(event, { type: "error", text: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
});

const { dialog } = require('electron');
ipcMain.handle("installer:selectFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'TV Packages', extensions: ['wgt', 'ipk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle("installer:getConfig", async () => ({
  repo: config.githubRepo,
  webosAppId: config.webos.appId,
  tizenAppId: config.tizen.appId,
  platform: os.platform()
}));
