const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const JSZip = require("jszip");
const forge = require("node-forge");
const { DOMParser } = require("@xmldom/xmldom");
const Signature = require("./vendor/tizen-js/src/packageSigner.js");

const configPath = path.join(__dirname, "..", "installer.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const isWindows = process.platform === "win32";

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 920,
    minHeight: 640,
    title: "Nuvio TV Installer",
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
  return roots.flatMap((root) => names.map((name) => path.join(root, tizenSubdir, name)));
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
      await fsp.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }

  return "";
}

function runCommand(event, command, args, options = {}) {
  emit(event, { type: "command", text: `$ ${command} ${args.join(" ")}` });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, cwd: options.cwd || undefined });

    child.stdout.on("data", (chunk) => emit(event, { type: "stdout", text: chunk.toString() }));
    child.stderr.on("data", (chunk) => emit(event, { type: "stderr", text: chunk.toString() }));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function captureCommand(event, command, args, options = {}) {
  emit(event, { type: "command", text: `$ ${command} ${args.join(" ")}` });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, cwd: options.cwd || undefined });
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
    emit(event, { type: "info", text: `Uso pacchetto gia' scaricato: ${targetPath}` });
  } catch {
    await downloadFile(event, asset.browser_download_url, targetPath);
  }

  return targetPath;
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} richiesto.`);
  }
  return normalized;
}

async function runLg(event, action, options) {
  const device = requireValue(options.deviceName || options.ip, "Nome device/IP LG");
  const aresInstall = await resolveCommand("ares-install");
  if (!aresInstall) {
    throw new Error("ares-install non trovato. Installa LG webOS TV SDK CLI e riapri l'app.");
  }

  if (action === "launch") {
    const aresLaunch = await resolveCommand("ares-launch");
    if (!aresLaunch) {
      throw new Error("ares-launch non trovato. Installa LG webOS TV SDK CLI o aggiungilo al PATH.");
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
    throw new Error(`TV Samsung non trovata in "sdb devices" dopo la connessione a ${ip}. Controlla Developer Mode e Host PC IP sulla TV.`);
  }
  emit(event, { type: "info", text: `Target SDB rilevato: ${target}` });
  return target;
}

function normalizeOptionalPath(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

function readPkcs12(filePath, password, label) {
  const der = forge.asn1.fromDer(forge.util.createBuffer(fs.readFileSync(filePath)));
  try {
    return forge.pkcs12.pkcs12FromAsn1(der, false, password);
  } catch (error) {
    throw new Error(`${label}: certificato o password non validi.`);
  }
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
      throw new Error("config.xml non contiene tizen:application.");
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

  throw new Error("Pacchetto Tizen non valido: config.xml o tizen-manifest.xml mancanti.");
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

async function listSamsungApps(event, sdb, target) {
  const result = await captureCommand(event, sdb, ["-s", target, "shell", "0", "vd_applist"]);
  return parseVdAppList(result.stdout);
}

async function findSamsungInstalledApp(event, sdb, target, identifiers) {
  const candidates = tizenIdentifierCandidates(identifiers);
  if (candidates.length === 0) {
    return null;
  }

  const apps = await listSamsungApps(event, sdb, target);
  return apps.find((app) => [
    app.app_id,
    app.app_tizen_id,
    app.app_package_id,
    app.package_id
  ].some((value) => candidates.includes(String(value || "").trim()))) || null;
}

async function maybeResignTizenPackage(event, packagePath, options) {
  const authorCertPath = normalizeOptionalPath(options.authorCertPath);
  const authorCertPassword = String(options.authorCertPassword || "");
  const distributorCertPath = normalizeOptionalPath(options.distributorCertPath);
  const distributorCertPassword = String(options.distributorCertPassword || "");

  if (!authorCertPath && !distributorCertPath) {
    return packagePath;
  }

  if (!authorCertPath || !authorCertPassword || !distributorCertPath || !distributorCertPassword) {
    throw new Error("Per firmare senza Tizen Studio servono author .p12, author password, distributor .p12 e distributor password.");
  }

  emit(event, { type: "info", text: "Resign WGT con tizen.js, senza comando tizen/Tizen Studio." });

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

  const authorKey = readPkcs12(authorCertPath, authorCertPassword, "Author cert");
  const distributorKey = readPkcs12(distributorCertPath, distributorCertPassword, "Distributor cert");
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
  const resignedPackage = path.join(outputDir, `${parsed.name}-signed-${Date.now()}${parsed.ext || ".wgt"}`);
  const zipData = await outputZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fsp.writeFile(resignedPackage, zipData);

  emit(event, { type: "info", text: `WGT firmato creato: ${resignedPackage}` });
  return resignedPackage;
}

async function installSamsungPackage(event, sdb, target, packagePath) {
  const metadata = await parseTizenPackageMetadata(packagePath);
  const installIds = tizenIdentifierCandidates(metadata.appId, metadata.packageId);
  if (installIds.length === 0) {
    throw new Error("Impossibile leggere application id o package id dal pacchetto Tizen.");
  }

  const remotePath = `/home/owner/share/tmp/sdk_tools/nuvio-package.${metadata.extension}`;
  emit(event, { type: "info", text: `Package id rilevato: ${metadata.packageId}` });
  if (metadata.appId) {
    emit(event, { type: "info", text: `Application id rilevato: ${metadata.appId}` });
  }

  await runCommand(event, sdb, ["-s", target, "shell", "mkdir", "-p", "/home/owner/share/tmp/sdk_tools"]);
  await runCommand(event, sdb, ["-s", target, "push", packagePath, remotePath]);

  let lastError = null;
  for (const installId of installIds) {
    try {
      await runCommand(event, sdb, ["-s", target, "shell", "0", "vd_appinstall", installId, remotePath]);
      return metadata;
    } catch (error) {
      lastError = error;
      emit(event, { type: "info", text: `vd_appinstall con ${installId} non riuscito, provo prossimo identificativo se disponibile.` });
    }
  }

  throw lastError || new Error("vd_appinstall non riuscito.");
}

async function uninstallSamsungApp(event, sdb, target, identifiers) {
  const candidates = tizenIdentifierCandidates(identifiers);
  const installedApp = await findSamsungInstalledApp(event, sdb, target, candidates).catch(() => null);
  const uninstallIds = tizenIdentifierCandidates(
    installedApp?.app_id,
    installedApp?.app_tizen_id,
    candidates
  );

  let lastError = null;
  for (const uninstallId of uninstallIds) {
    try {
      await runCommand(event, sdb, ["-s", target, "shell", "0", "vd_appuninstall", uninstallId]);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    await runCommand(event, sdb, ["-s", target, "uninstall", candidates[0] || config.tizen.appId]);
  } catch (fallbackError) {
    const tizen = await resolveCommand("tizen");
    if (!tizen) {
      throw lastError || fallbackError;
    }
    emit(event, { type: "info", text: "vd_appuninstall/sdb uninstall non riusciti, provo fallback con tizen CLI trovato sul sistema." });
    await runCommand(event, tizen, ["uninstall", "-p", candidates[0] || config.tizen.appId, "-t", target]);
  }
}

async function launchSamsungApp(event, sdb, target, identifiers) {
  const installedApp = await findSamsungInstalledApp(event, sdb, target, identifiers);
  const launchId = installedApp?.app_id || installedApp?.app_tizen_id || tizenIdentifierCandidates(identifiers)[0];
  if (!launchId) {
    throw new Error("App Samsung non trovata. Installa Nuvio o controlla appId in installer.config.json.");
  }
  await runCommand(event, sdb, ["-s", target, "shell", "0", "was_execute", launchId]);
}

async function runSamsung(event, action, options) {
  const ip = requireValue(options.ip, "IP Samsung TV");
  const sdb = await resolveCommand("sdb");
  if (!sdb) {
    throw new Error("sdb non trovato. Serve il binario sdb nel PATH o in una cartella Tizen Studio standard. Il comando tizen non e' piu' richiesto.");
  }

  const target = await connectSamsungDevice(event, sdb, ip);
  const configuredIds = tizenIdentifierCandidates(config.tizen.appId, config.tizen.packageId, config.tizen.appIds);

  if (action === "launch") {
    await launchSamsungApp(event, sdb, target, configuredIds);
    return;
  }

  if (action === "uninstall") {
    await uninstallSamsungApp(event, sdb, target, configuredIds);
    return;
  }

  const packagePath = options.packagePath || await resolveReleaseAsset(event, "tizen");
  const installPackagePath = await maybeResignTizenPackage(event, packagePath, options);
  try {
    await installSamsungPackage(event, sdb, target, installPackagePath);
  } catch (error) {
    try {
      emit(event, { type: "info", text: "vd_appinstall non riuscito, provo fallback con sdb install." });
      await runCommand(event, sdb, ["-s", target, "install", installPackagePath]);
    } catch (fallbackError) {
      const tizen = await resolveCommand("tizen");
      if (!tizen) {
        throw error;
      }
      emit(event, { type: "info", text: "sdb install non riuscito, provo fallback con tizen CLI trovato sul sistema." });
      await runCommand(event, tizen, ["install", "-n", installPackagePath, "-t", target]);
    }
  }

  emit(event, {
    type: "info",
    text: "Come TizenBrew: se vuoi usare debug/autolaunch, imposta Host PC IP a 127.0.0.1 sulla TV dopo l'installazione."
  });
}

ipcMain.handle("installer:run", async (event, request) => {
  const platform = request.platform;
  const action = request.action;
  emit(event, { type: "info", text: `Avvio ${action} su ${platform}.` });

  try {
    if (platform === "lg") {
      await runLg(event, action, request.options || {});
    } else if (platform === "samsung") {
      await runSamsung(event, action, request.options || {});
    } else {
      throw new Error(`Piattaforma non supportata: ${platform}`);
    }

    emit(event, { type: "success", text: "Operazione completata." });
    return { ok: true };
  } catch (error) {
    emit(event, { type: "error", text: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("installer:getConfig", async () => ({
  repo: config.githubRepo,
  webosAppId: config.webos.appId,
  tizenAppId: config.tizen.appId,
  platform: os.platform()
}));
