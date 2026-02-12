# Take This and Go

This bundle installs `FailSafe-Qore` on a Zo Linux host with one command. The launcher script pulls or updates the runtime, installs dependencies, builds, installs systemd services, and starts them.

Use Option 1 for direct install from GitHub, Option 2 if you already cloned this repo, or Option 3 if you are transferring a packaged bundle. After install, set secrets and model policy in `/etc/failsafe-qore/env`.

## Option 1: Direct from GitHub

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/MythologIQ/failsafe-qore/main/deploy/zo/take-this-and-go.sh)"
```

## Option 2: From Cloned Repository

```bash
sudo bash deploy/zo/take-this-and-go.sh
```

## Option 3: Upload Bundle

From Windows:

```powershell
npm run zo:bundle
```

Upload `dist/failsafe-qore-zo-bundle.tgz` to Zo host, extract to `/opt/failsafe-qore`, then run:

```bash
cd /opt/failsafe-qore
sudo bash deploy/zo/take-this-and-go.sh
```

## After Install

Edit `/etc/failsafe-qore/env` and set at minimum:

- `QORE_API_KEY`
- `QORE_PROXY_API_KEY`
- `QORE_ACTOR_KEYS`
- `QORE_ZO_ALLOWED_MODELS`
