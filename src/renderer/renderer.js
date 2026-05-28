const state = {
  platform: "samsung",
  busy: false,
  config: null,
  language: localStorage.getItem("nuvio-installer-language") || "it"
};

const copy = {
  it: {
    ui: {
      language: "Lingua",
      ip: "IP TV",
      deviceName: "Nome device LG opzionale",
      lgPassphrase: "Passphrase Developer Mode LG",
      guideTitle: "Come procedere",
      install: "Installa / Aggiorna",
      launch: "Avvia",
      uninstall: "Disinstalla",
      clearLog: "Pulisci",
      log: "Log"
    },
    logPrefix: {
      info: "[info] ",
      success: "[ok] ",
      error: "[errore] "
    },
    platforms: {
      samsung: {
        title: "Samsung TV",
        subtitle: "Installa o aggiorna Nuvio TV sulla Samsung TV.",
        requirements: "L'installer prova a comunicare direttamente con la TV come TizenBrewInstaller. sdb viene usato solo come fallback se presente. La firma Samsung viene gestita automaticamente con login Samsung Account quando serve.",
        guide: [
          "Sulla TV apri Apps, premi 12345, attiva Developer Mode e inserisci l'IP di questo computer come Host PC IP.",
          "Riavvia la TV, poi inserisci qui l'IP della TV Samsung.",
          "Premi Installa / Aggiorna: l'installer scarica automaticamente l'ultimo WGT Nuvio dalla release GitHub.",
          "Al primo uso puo' aprirsi il login Samsung; serve internet solo per creare automaticamente il certificato della TV.",
          "Usa Avvia solo dopo un'installazione riuscita. Usa Disinstalla per rimuovere Nuvio dalla TV."
        ]
      },
      lg: {
        title: "LG TV",
        subtitle: "Installa o aggiorna Nuvio TV sulla LG TV.",
        requirements: "I comandi webOS ares sono inclusi nell'app. Al primo uso inserisci la passphrase mostrata dall'app Developer Mode della TV LG per configurare la connessione.",
        guide: [
          "Attiva Developer Mode sulla TV LG e verifica che PC e TV siano nella stessa rete.",
          "Apri l'app Developer Mode sulla TV e leggi la passphrase.",
          "Inserisci IP della TV e passphrase. Il nome device LG e' opzionale.",
          "Premi Installa / Aggiorna: l'installer scarica automaticamente l'ultimo IPK Nuvio dalla release GitHub.",
          "Usa Avvia per aprire Nuvio e Disinstalla per rimuoverlo."
        ]
      }
    }
  },
  en: {
    ui: {
      language: "Language",
      ip: "TV IP",
      deviceName: "Optional LG device name",
      lgPassphrase: "LG Developer Mode passphrase",
      guideTitle: "How to proceed",
      install: "Install / Update",
      launch: "Launch",
      uninstall: "Uninstall",
      clearLog: "Clear",
      log: "Log"
    },
    logPrefix: {
      info: "[info] ",
      success: "[ok] ",
      error: "[error] "
    },
    platforms: {
      samsung: {
        title: "Samsung TV",
        subtitle: "Install or update Nuvio TV on your Samsung TV.",
        requirements: "The installer first tries to communicate directly with the TV like TizenBrewInstaller. sdb is used only as a fallback if available. Samsung signing is handled automatically with Samsung Account login when needed.",
        guide: [
          "On the TV, open Apps, press 12345, enable Developer Mode, and enter this computer's IP as Host PC IP.",
          "Restart the TV, then enter the Samsung TV IP here.",
          "Press Install / Update: the installer automatically downloads the latest Nuvio WGT from the GitHub release.",
          "On first use, Samsung login may open; internet is only needed to create the TV certificate automatically.",
          "Use Launch only after a successful installation. Use Uninstall to remove Nuvio from the TV."
        ]
      },
      lg: {
        title: "LG TV",
        subtitle: "Install or update Nuvio TV on your LG TV.",
        requirements: "webOS ares commands are bundled with the app. On first use, enter the passphrase shown by the LG TV Developer Mode app to configure the connection.",
        guide: [
          "Enable Developer Mode on the LG TV and make sure the computer and TV are on the same network.",
          "Open the Developer Mode app on the TV and read the passphrase.",
          "Enter the TV IP and passphrase. The LG device name is optional.",
          "Press Install / Update: the installer automatically downloads the latest Nuvio IPK from the GitHub release.",
          "Use Launch to open Nuvio and Uninstall to remove it."
        ]
      }
    }
  }
};

const elements = {
  title: document.getElementById("platform-title"),
  subtitle: document.getElementById("platform-subtitle"),
  language: document.getElementById("language"),
  languageLabel: document.getElementById("language-label"),
  guide: document.getElementById("guide-panel"),
  requirements: document.getElementById("requirements"),
  repo: document.getElementById("repo-pill"),
  ipLabel: document.getElementById("ip-label"),
  ip: document.getElementById("ip"),
  deviceNameLabel: document.getElementById("device-name-label"),
  deviceName: document.getElementById("deviceName"),
  deviceNameRow: document.getElementById("device-name-row"),
  lgPassphraseLabel: document.getElementById("lg-passphrase-label"),
  lgPassphrase: document.getElementById("lgPassphrase"),
  lgPassphraseRow: document.getElementById("lg-passphrase-row"),
  packagePath: document.getElementById("packagePath"),
  installButton: document.getElementById("install-button"),
  launchButton: document.getElementById("launch-button"),
  uninstallButton: document.getElementById("uninstall-button"),
  logTitle: document.getElementById("log-title"),
  clearLog: document.getElementById("clear-log"),
  log: document.getElementById("log")
};

function t() {
  return copy[state.language] || copy.it;
}

function appendLog(type, text) {
  const prefix = {
    command: "",
    stdout: "",
    stderr: "",
    info: t().logPrefix.info,
    success: t().logPrefix.success,
    error: t().logPrefix.error
  }[type] || "";
  elements.log.textContent += `${prefix}${text}`.replace(/\n?$/, "\n");
  elements.log.scrollTop = elements.log.scrollHeight;
}

function renderPlatform() {
  const dictionary = t();
  const platformCopy = dictionary.platforms[state.platform];

  document.documentElement.lang = state.language;
  elements.language.value = state.language;
  elements.languageLabel.textContent = dictionary.ui.language;
  elements.title.textContent = platformCopy.title;
  elements.subtitle.textContent = platformCopy.subtitle;
  elements.ipLabel.textContent = dictionary.ui.ip;
  elements.deviceNameLabel.textContent = dictionary.ui.deviceName;
  elements.lgPassphraseLabel.textContent = dictionary.ui.lgPassphrase;
  elements.installButton.textContent = dictionary.ui.install;
  elements.launchButton.textContent = dictionary.ui.launch;
  elements.uninstallButton.textContent = dictionary.ui.uninstall;
  elements.logTitle.textContent = dictionary.ui.log;
  elements.clearLog.textContent = dictionary.ui.clearLog;
  elements.requirements.textContent = platformCopy.requirements;
  renderGuide(platformCopy.guide, dictionary.ui.guideTitle);
  elements.deviceNameRow.classList.toggle("hidden", state.platform !== "lg");
  elements.lgPassphraseRow.classList.toggle("hidden", state.platform !== "lg");

  document.querySelectorAll(".platform-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === state.platform);
  });
}

function renderGuide(items, title) {
  elements.guide.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = title;

  const list = document.createElement("ol");
  items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.appendChild(listItem);
  });

  elements.guide.append(heading, list);
}

function setBusy(nextBusy) {
  state.busy = nextBusy;
  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.disabled = nextBusy;
  });
}

async function runAction(action) {
  if (state.busy) {
    return;
  }

  setBusy(true);
  const request = {
    platform: state.platform,
    action,
    options: {
      ip: elements.ip.value.trim(),
      deviceName: elements.deviceName.value.trim(),
      lgPassphrase: elements.lgPassphrase.value,
      packagePath: elements.packagePath.value.trim()
    }
  };

  const result = await window.nuvioInstaller.run(request);
  setBusy(false);

  if (!result.ok) {
    appendLog("error", result.error);
  }
}

window.nuvioInstaller.onLog((payload) => appendLog(payload.type, payload.text));

document.querySelectorAll(".platform-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.platform = button.dataset.platform;
    renderPlatform();
  });
});

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => runAction(button.dataset.action));
});

elements.language.addEventListener("change", () => {
  state.language = elements.language.value;
  localStorage.setItem("nuvio-installer-language", state.language);
  renderPlatform();
});

elements.clearLog.addEventListener("click", () => {
  elements.log.textContent = "";
});

window.nuvioInstaller.getConfig().then((config) => {
  state.config = config;
  elements.repo.textContent = config.repo;
  renderPlatform();
});
