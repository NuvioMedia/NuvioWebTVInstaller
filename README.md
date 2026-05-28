# Nuvio TV Installer

App Electron per installare, aggiornare e disinstallare Nuvio TV su LG webOS e Samsung Tizen.

## Guida rapida

1. Scarica o apri `Nuvio-TV-Installer-0.1.0-Setup.exe`.
2. Installa e avvia `Nuvio TV Installer`.
3. Scegli `Samsung TV` oppure `LG TV`.
4. Inserisci l'IP della TV.
5. Lascia vuoto `Pacchetto locale opzionale` per usare automaticamente l'ultima release GitHub.
6. Premi `Installa`, `Aggiorna`, `Avvia` o `Disinstalla`.
7. Controlla il riquadro `Log` per vedere i comandi eseguiti e gli eventuali errori.

`Installa` e `Aggiorna` usano lo stesso pacchetto della release piu' recente. Se l'app e' gia' presente sulla TV, il tool della piattaforma gestisce l'aggiornamento/sovrascrittura.

## Requisiti sul PC dell'utente

- LG: LG webOS TV SDK CLI nel `PATH`, poi configurare la TV con `ares-setup-device`.
- Samsung: TV in Developer Mode e `sdb` funzionante. Il comando `tizen` di Tizen Studio non e' richiesto: la firma del `.wgt` usa `tizen.js` incluso nell'installer.

## Uso con Samsung TV

Prima di usare l'installer:

1. Sulla TV apri `Apps`.
2. Premi `12345` con il telecomando.
3. Attiva `Developer Mode`.
4. In `Host PC IP` inserisci l'IP del PC dove stai eseguendo l'installer.
5. Conferma e riavvia la TV.
6. Assicurati che `sdb` sia disponibile sul PC. Puo' essere nel `PATH`, dentro `C:\tizen-studio\tools`, oppure in una distribuzione separata dei tool Samsung.

Poi nell'installer:

1. Clicca `Samsung TV`.
2. Inserisci `IP TV`, ad esempio `192.168.1.50`.
3. Lascia vuoti i campi certificato se il `.wgt` della release e' gia' firmato correttamente.
4. Inserisci `Author cert .p12`, `Password author cert`, `Distributor cert .p12` e `Password distributor cert` solo se devi resignare il `.wgt`, ad esempio su Tizen 7+ o quando la TV rifiuta il certificato del pacchetto.
5. Lascia vuoto `Pacchetto locale opzionale` per scaricare il `.wgt` dall'ultima release GitHub, oppure inserisci il percorso completo di un `.wgt` locale.
6. Premi l'azione desiderata.

L'installer replica il flusso TizenBrewInstaller, ma senza richiedere il comando `tizen`: esegue `sdb connect <IP TV>`, legge `sdb devices`, rileva il target reale della TV, firma con `tizen.js` se hai indicato i `.p12`, carica il pacchetto in `/home/owner/share/tmp/sdk_tools/` e installa con `vd_appinstall`. Se quel flusso fallisce, prova `sdb install`; se anche quello fallisce e il comando `tizen` esiste sul PC, lo usa solo come ultimo fallback.

## Uso con LG TV

Prima di usare l'installer:

1. Installa LG webOS TV SDK CLI.
2. Configura la TV con `ares-setup-device`.
3. Verifica che `ares-install` funzioni dal terminale.

Poi nell'installer:

1. Clicca `LG TV`.
2. Inserisci `IP TV` oppure il `Nome device ares` configurato con `ares-setup-device`.
3. Lascia vuoto `Pacchetto locale opzionale` per scaricare l'`.ipk` dall'ultima release GitHub, oppure inserisci il percorso completo di un `.ipk` locale.
4. Premi l'azione desiderata.

Per disinstallare, l'installer usa l'app id configurato in `installer.config.json`.

## Asset GitHub

L'app scarica l'ultima release da `NuvioMedia/NuvioWeb` e cerca:

- LG: un asset `.ipk`
- Samsung: un asset `.wgt`

I pattern e gli app id sono in `installer.config.json`.

Per creare il `.wgt` Samsung senza Tizen Studio, dalla root della repo principale esegui:

```bash
npm run package:tizen
```

Il file generato ha un nome tipo `NuvioTV_0.2.0.wgt`. Caricalo negli asset della release GitHub, oppure selezionalo nel campo `Pacchetto locale opzionale`.

## Configurazione

Modifica `installer.config.json` se cambi repo, app id o nome degli asset:

```json
{
  "githubRepo": "NuvioMedia/NuvioWeb",
  "webos": {
    "appId": "space.nuvio.webos",
    "assetPattern": "\\.ipk$"
  },
  "tizen": {
    "appId": "NuvioTV.NuvioTV",
    "packageId": "NuvioTV",
    "appIds": [
      "NuvioTV.NuvioTV",
      "NuvioTV"
    ],
    "assetPattern": "\\.wgt$"
  }
}
```

`assetPattern` e' una regex applicata agli asset dell'ultima release GitHub.

## Env Nuvio

L'exe non contiene `nuvio.env.js` e non deve contenere chiavi. Le configurazioni runtime vanno gestite dentro i pacchetti pubblicati in release, preferibilmente caricando un env ospitato lato web come gia' previsto dal bootstrap Tizen.

## Problemi comuni

- `sdb non trovato`: installa o copia i Samsung/Tizen device tools e aggiungi la cartella di `sdb` al `PATH`. L'installer cerca anche `C:\tizen-studio\tools`.
- Samsung non appare in `sdb devices`: controlla Developer Mode, Host PC IP, riavvio TV e firewall del PC.
- Samsung rifiuta il pacchetto: firma il `.wgt` con certificati Samsung validi inserendo author/distributor `.p12` e relative password.
- `ares-install non trovato`: installa LG webOS TV SDK CLI o aggiungilo al `PATH`.
- Nessun asset trovato: pubblica nella release GitHub un file `.ipk` per LG o `.wgt` per Samsung.

## Sviluppo

```bash
npm install
npm start
```

## Build exe Windows

```bash
npm install
npm run build:win
```

L'exe finale viene generato in `dist/`.

Per ridurre i falsi positivi antivirus serve firmare il binario con un certificato Code Signing valido e distribuire un installer non offuscato. Nessun tool puo' garantire zero rilevamenti, ma firma, reputazione del publisher e build pulita sono i fattori principali.

## Samsung come TizenBrew

Il flusso replica quello usato da TizenBrewInstaller, ma usa `tizen.js` e `sdb` come percorso principale:

1. Sulla TV apri Apps, premi `12345`, abilita Developer Mode e imposta Host PC IP all'IP del PC.
2. Riavvia la TV.
3. L'installer esegue `sdb connect <TV IP>`.
4. L'installer legge `sdb devices` e usa il target rilevato, ad esempio `192.168.1.50:26101`.
5. Legge `config.xml` dal `.wgt` e ricava il package id reale.
6. Se inserisci certificati `.p12`, firma il pacchetto localmente con `tizen.js`.
7. Copia il file sulla TV con `sdb -s <target> push <file.wgt> /home/owner/share/tmp/sdk_tools/nuvio-package.wgt`.
8. Installa con `sdb -s <target> shell 0 vd_appinstall <applicationId|packageId> /home/owner/share/tmp/sdk_tools/nuvio-package.wgt`.
9. Per disinstallare o avviare, legge `vd_applist`, cerca gli id configurati in `installer.config.json` e usa `vd_appuninstall` o `was_execute`.

L'app cerca `sdb` sia nel `PATH` sia nei path standard Tizen Studio:

- Windows: `C:\tizen-studio\tools`
- macOS/Linux: `~/tizen-studio/tools`

Nota: `tizen.js` evita il Tizen Studio CLI per firma/resign/package, ma non sostituisce il protocollo di collegamento alla TV. Per installare fisicamente sulla TV serve ancora `sdb` o un binario compatibile.
