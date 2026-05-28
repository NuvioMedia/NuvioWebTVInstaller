# Nuvio TV Installer

Programma desktop per installare, aggiornare, avviare e disinstallare Nuvio su:

- Samsung TV Tizen
- LG TV webOS

Per Samsung il flusso e' pensato come una versione Nuvio di TizenBrewInstaller: cambia il pacchetto installato, che e' il WGT Nuvio pubblicato nella release GitHub.

L'app scarica automaticamente l'ultimo pacchetto Nuvio dalla release GitHub configurata in `installer.config.json`.

Azioni disponibili nell'app:

- `Installa / Aggiorna`: usa lo stesso flusso per prima installazione e aggiornamento. Scarica l'ultima release GitHub.
- `Avvia`: apre Nuvio sulla TV.
- `Disinstalla`: rimuove Nuvio dalla TV.

## Avvio

Per sviluppo:

```bash
npm install
npm start
```

Per creare il pacchetto:

```bash
npm run dist:win
npm run dist:mac
```

Con la configurazione attuale vengono generati app avviabili standalone, senza installer:

- `dist/Nuvio-TV-Installer-<version>-Windows.exe` per Windows
- `dist/mac-arm64/Nuvio TV Installer.app` per macOS Apple Silicon

## Pacchetti App

LG usa un file `.ipk`.

Samsung usa un file `.wgt`. Non serve per forza Tizen Studio per creare il WGT di Nuvio: dalla repo principale puoi generarlo con:

```bash
npm run package:tizen
```

Il WGT generato usa il `nuvio.env.js` locale della repo.

L'installer scarica automaticamente l'asset corretto dall'ultima release GitHub:

- `.ipk` per LG
- `.wgt` per Samsung

## Samsung TV

Prima di usare l'installer:

1. Apri `Apps` sulla TV.
2. Premi `12345` sul telecomando.
3. Attiva `Developer Mode`.
4. Inserisci come `Host PC IP` l'IP del computer.
5. Riavvia la TV.

Per Samsung l'installer prova prima la connessione diretta usata da TizenBrewInstaller, senza richiedere `sdb` installato sul PC. Se la connessione diretta non riesce, prova `sdb` come fallback se presente.

Il comando `tizen` non e' richiesto per il flusso principale.

L'installer prova a:

1. connettersi direttamente alla TV in Developer Mode;
2. scaricare e copiare il WGT Nuvio sulla TV;
3. installarlo con `vd_appinstall`, come fanno TizenBrew/TizenBrewInstaller;
4. usare fallback `sdb` o `tizen` solo se presenti.

### Firma Samsung

L'installer usa lo stesso approccio di TizenBrewInstaller:

- legge la DUID della TV;
- al primo uso apre il login Samsung Account e usa internet per creare il certificato;
- crea un certificato Samsung per quella TV;
- salva il certificato nella cartella dati dell'app;
- rifirma automaticamente il `.wgt` prima di installarlo.

Non devi fornire file `.p12` manuali.

## LG TV

Per LG l'app include `@webos-tools/cli`, quindi l'utente non deve installare manualmente LG webOS SDK CLI o `ares-install`.

Prima di usare l'installer:

1. Installa e apri l'app `Developer Mode` sulla TV LG.
2. Attiva Developer Mode.
3. Attiva `Key Server`.
4. Leggi la passphrase mostrata dall'app Developer Mode.
5. Nell'installer seleziona `LG TV`, inserisci IP e passphrase, poi premi `Installa / Aggiorna`.

Il nome device LG e' opzionale. Se lo lasci vuoto, l'installer crea automaticamente un device locale partendo dall'IP della TV.

L'app usa internamente:

```text
ares-setup-device
ares-novacom --getkey
ares-install
ares-launch
```

Se la TV era gia' stata configurata in passato, puoi anche inserire solo il nome device o l'IP e lasciare vuota la passphrase.

Nota: `@webos-tools/cli` porta molte dipendenze npm transitive. Questo non significa che l'app sia automaticamente pericolosa, ma aumenta manutenzione, dimensione del pacchetto e possibilita' di falsi positivi negli antivirus. Per una distribuzione pubblica pulita resta consigliata la firma dell'app.

## Configurazione GitHub

Modifica `installer.config.json`:

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
    "appIds": ["NuvioTV.NuvioTV", "NuvioTV"],
    "assetPattern": "\\.wgt$"
  }
}
```

La release GitHub deve contenere almeno:

- un asset `.ipk` per LG;
- un asset `.wgt` per Samsung.

## Note Antivirus

Nessun tool puo' garantire che un exe non venga mai segnalato. Per ridurre i falsi positivi:

- firma l'exe con un certificato code-signing;
- evita download dinamici di tool non necessari;
- pubblica build riproducibili da una repo pulita;
- non includere dipendenze npm vulnerabili se non servono davvero.
