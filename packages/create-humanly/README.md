# create-humanly

Create a local Humanly self-host installation without cloning the repository by
hand.

First check and install Node/npm, Docker, Docker Compose, and the Docker daemon:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/packages/create-humanly/scripts/install-prereqs.sh | bash
```

Then run the installer:

```bash
npx create-humanly@latest
```

The installer downloads Humanly source code, writes a local Docker Compose
configuration, generates local secrets, seeds a default Publisher Portal admin
account, and starts the stack unless `--no-start` is provided.

Node.js and npm are required before `npx create-humanly@latest` because `npx`
runs on Node. The installer still checks Docker before startup and gives a clear
next step if Docker is missing.

Local quickstart email uses `EMAIL_SERVICE=console`, so signup and notification
messages are printed to backend logs. No third-party email provider is required.

## Options

```bash
npx create-humanly@latest my-humanly --no-start
npx create-humanly@latest my-humanly --install-docker
npx create-humanly@latest my-humanly --source-ref v0.5.0
npx create-humanly@latest my-humanly --admin-email you@example.com
```

Run `npx create-humanly@latest --help` for the full option list.
