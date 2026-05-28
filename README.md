# Nuvio TV Installer

Desktop app to install, update, launch, and uninstall Nuvio on:

- Samsung Tizen TVs
- LG webOS TVs

For Samsung, the flow is designed as a Nuvio version of TizenBrewInstaller: the installed package is the Nuvio WGT published in the GitHub release.

The app automatically downloads the latest Nuvio package from the GitHub release configured in `installer.config.json`.

Available actions in the app:

- `Install / Update`: uses the same flow for first installation and updates. Downloads the latest GitHub release.
- `Launch`: opens Nuvio on the TV.
- `Uninstall`: removes Nuvio from the TV.

## Start

For development:

```bash
npm install
npm start
```

To build the package:

```bash
npm run dist:win
npm run dist:mac
```

With the current configuration, standalone runnable apps are generated without an installer:

- `dist/Nuvio-TV-Installer-<version>-Windows.exe` for Windows
- `dist/mac-arm64/Nuvio TV Installer.app` for macOS Apple Silicon

## App Packages

LG uses an `.ipk` file.

Samsung uses a `.wgt` file. Tizen Studio is not strictly required to create the Nuvio WGT. From the main repo, you can generate it with:

```bash
npm run package:tizen
```

The generated WGT uses the repo's local `nuvio.env.js`.

The installer automatically downloads the correct asset from the latest GitHub release:

- `.ipk` for LG
- `.wgt` for Samsung

## Samsung TV

Before using the installer:

1. Open `Apps` on the TV.
2. Press `12345` on the remote.
3. Enable `Developer Mode`.
4. Enter the computer IP as `Host PC IP`.
5. Restart the TV.

For Samsung, the installer first tries the direct connection used by TizenBrewInstaller, without requiring `sdb` to be installed on the PC. If the direct connection fails, it tries `sdb` as a fallback when available.

The `tizen` command is not required for the main flow.

The installer tries to:

1. connect directly to the TV in Developer Mode;
2. download and copy the Nuvio WGT to the TV;
3. install it with `vd_appinstall`, like TizenBrew/TizenBrewInstaller;
4. use `sdb` or `tizen` fallbacks only when available.

### Samsung Signing

The installer uses the same approach as TizenBrewInstaller:

- reads the TV DUID;
- opens Samsung Account login on first use and uses the internet to create the certificate;
- creates a Samsung certificate for that TV;
- saves the certificate in the app data folder;
- automatically re-signs the `.wgt` before installing it.

You do not need to provide manual `.p12` files.

## LG TV

For LG, the app includes `@webos-tools/cli`, so the user does not need to manually install the LG webOS SDK CLI or `ares-install`.

Before using the installer:

1. Install and open the `Developer Mode` app on the LG TV.
2. Enable Developer Mode.
3. Enable `Key Server`.
4. Read the passphrase shown by the Developer Mode app.
5. In the installer, select `LG TV`, enter the IP and passphrase, then press `Install / Update`.

The LG device name is optional. If you leave it empty, the installer automatically creates a local device from the TV IP.

The app internally uses:

```text
ares-setup-device
ares-novacom --getkey
ares-install
ares-launch
```

If the TV was already configured in the past, you can also enter only the device name or IP and leave the passphrase empty.

Note: `@webos-tools/cli` brings many transitive npm dependencies. This does not mean the app is automatically dangerous, but it increases maintenance, package size, and the chance of antivirus false positives. For clean public distribution, app signing is still recommended.

## GitHub Configuration

Edit `installer.config.json`:

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

The GitHub release must contain at least:

- one `.ipk` asset for LG;
- one `.wgt` asset for Samsung.

## Antivirus Notes

No tool can guarantee that an exe will never be flagged. To reduce false positives:

- sign the exe with a code-signing certificate;
- avoid dynamic downloads of unnecessary tools;
- publish reproducible builds from a clean repo;
- do not include vulnerable npm dependencies unless they are truly needed.
