const state = {
  platform: "samsung",
  busy: false,
  config: null
};

const platformCopy = {
  samsung: {
    title: "Samsung TV",
    subtitle: "Installa o aggiorna il pacchetto Tizen pubblicato nell'ultima release GitHub.",
    requirements: "Flusso TizenBrew senza comando tizen: abilita Developer Mode sulla TV, imposta Host PC IP all'IP del PC, riavvia la TV. L'app usa sdb per connettersi/installare e tizen.js per firmare il .wgt se indichi i certificati .p12."
  },
  lg: {
    title: "LG TV",
    subtitle: "Installa o aggiorna il pacchetto webOS pubblicato nell'ultima release GitHub.",
    requirements: "Richiede LG webOS TV SDK CLI nel PATH e device configurato con ares-setup-device. Puoi usare il nome device ares o l'IP."
  }
};

const elements = {
  title: document.getElementById("platform-title"),
  subtitle: document.getElementById("platform-subtitle"),
  requirements: document.getElementById("requirements"),
  repo: document.getElementById("repo-pill"),
  ip: document.getElementById("ip"),
  deviceName: document.getElementById("deviceName"),
  deviceNameRow: document.getElementById("device-name-row"),
  signingFields: document.getElementById("samsung-signing-fields"),
  authorCertPath: document.getElementById("authorCertPath"),
  authorCertPassword: document.getElementById("authorCertPassword"),
  distributorCertPath: document.getElementById("distributorCertPath"),
  distributorCertPassword: document.getElementById("distributorCertPassword"),
  packagePath: document.getElementById("packagePath"),
  log: document.getElementById("log")
};

function appendLog(type, text) {
  const prefix = {
    command: "",
    stdout: "",
    stderr: "",
    info: "[info] ",
    success: "[ok] ",
    error: "[errore] "
  }[type] || "";
  elements.log.textContent += `${prefix}${text}`.replace(/\n?$/, "\n");
  elements.log.scrollTop = elements.log.scrollHeight;
}

function renderPlatform() {
  const copy = platformCopy[state.platform];
  elements.title.textContent = copy.title;
  elements.subtitle.textContent = copy.subtitle;
  elements.requirements.textContent = copy.requirements;
  elements.deviceNameRow.classList.toggle("hidden", state.platform !== "lg");
  elements.signingFields.classList.toggle("hidden", state.platform !== "samsung");

  document.querySelectorAll(".platform-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === state.platform);
  });
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
      authorCertPath: elements.authorCertPath.value.trim(),
      authorCertPassword: elements.authorCertPassword.value,
      distributorCertPath: elements.distributorCertPath.value.trim(),
      distributorCertPassword: elements.distributorCertPassword.value,
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

document.getElementById("clear-log").addEventListener("click", () => {
  elements.log.textContent = "";
});

window.nuvioInstaller.getConfig().then((config) => {
  state.config = config;
  elements.repo.textContent = config.repo;
  renderPlatform();
});
