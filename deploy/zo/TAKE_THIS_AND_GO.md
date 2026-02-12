# Take This and Go

## Fast Path (Recommended)

On Zo host:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/MythologIQ/failsafe-qore/main/deploy/zo/bootstrap-zo.sh)"
```

Then edit:

- `/etc/failsafe-qore/env`

Set at minimum:

- `QORE_API_KEY`
- `QORE_PROXY_API_KEY`
- `QORE_ACTOR_KEYS`
- `QORE_ZO_ALLOWED_MODELS`

Restart services:

```bash
sudo systemctl restart failsafe-qore.service failsafe-fallback-watcher.service
```

Check status:

```bash
sudo systemctl status failsafe-qore.service --no-pager
sudo systemctl status failsafe-fallback-watcher.service --no-pager
```

## One-File Upload Path

From Windows:

```powershell
npm run zo:bundle
```

Upload `dist/failsafe-qore-zo-bundle.tgz` to Zo host, then:

```bash
sudo mkdir -p /opt/failsafe-qore
sudo tar -xzf failsafe-qore-zo-bundle.tgz -C /opt/failsafe-qore
cd /opt/failsafe-qore
sudo bash deploy/zo/bootstrap-zo.sh
```
