---
title: Deployment
slug: deployment
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Deployment

Madori runs anywhere Node.js runs. All content is stored as flat files — no database required. This makes deployment straightforward: build the Next.js application and serve it from any hosting environment that provides a persistent filesystem.

For full Control Panel functionality (content editing, asset uploads, user management), you need a hosting environment with a writable filesystem. Serverless platforms work for read-only frontends where content is committed to Git.

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies, disabled introspection, and optimised builds |
| `PORT` | No | `3000` | Port for the Node.js server |
| `HOSTNAME` | No | `0.0.0.0` | Bind address for the server |
| `DISABLE_CP` | No | — | Set to `true` to disable the Control Panel in production |

### Build Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build the Next.js application for production |
| `pnpm start` | Start the production server |
| `pnpm dev` | Start the development server with hot reload |

### madori.config.ts (Deployment-Relevant Options)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphql.introspection` | `boolean` | `true` in dev | Set to `false` in production to hide schema from public inspection |
| `cp.enabled` | `boolean` | `true` | Disable the CP if deploying frontend-only |
| `auth.storeConfig.sessionDurationMs` | `number` | `86400000` | Session expiry — consider shortening for production |

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 18+ | 20 LTS |
| RAM | 256 MB | 512 MB+ |
| Disk | Project size + assets | SSD for responsive CP |
| pnpm | 8+ | Latest |

---

## Usage Examples

### Basic Production Build

```bash
pnpm build
pnpm start
```

This starts a production Next.js server on port 3000.

### VPS Deployment (Recommended for Full CP)

A VPS provides a persistent filesystem, meaning the Control Panel works fully — content editing, asset uploads, and user management all persist between deploys.

**Providers:** DigitalOcean, Hetzner, Vultr, Linode, AWS EC2

**Deploy script:**

```bash
git pull origin main
pnpm install --frozen-lockfile
pnpm build
# Restart your process manager
pm2 restart madori
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yoursite.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Process Management with systemd

```ini
[Unit]
Description=Madori CMS
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/my-site
ExecStart=/usr/bin/pnpm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Process Management with PM2

```bash
pm2 start pnpm --name madori -- start
pm2 save
pm2 startup
```

### Vercel / Netlify (Frontend Only)

Serverless platforms work for the frontend site but the Control Panel won't persist changes — the filesystem is read-only and ephemeral.

Good for: marketing sites, documentation, and blogs where content is committed to Git.

### Railway / Render

Persistent filesystem with always-on processes. Full Control Panel support without VPS management.

---

## Common Patterns

### Content in Git

Since all content is flat files, commit content to your repository:

```bash
git add content/
git commit -m "Update blog posts"
git push
```

This gives you:
- Version history for all content changes
- Pull request workflow for content review
- Easy rollback if something goes wrong
- Consistent content across dev/staging/production

### Automated Deployment on Push

Use GitHub Actions or similar CI to deploy on push to main:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ssh deploy@yourserver.com "cd /var/www/my-site && git pull && pnpm install --frozen-lockfile && pnpm build && pm2 restart madori"
```

### Separate Frontend and CP Deployments

Deploy the frontend to a CDN/serverless platform and the CP to a VPS:

```ts
// madori.config.ts on the frontend deployment
const config = {
  cp: { enabled: false },
  graphql: { enabled: true, introspection: false },
}
```

The frontend reads content from the GraphQL API while the CP runs on a separate server with filesystem access.

### SSL with Let's Encrypt

Use Certbot for free SSL certificates:

```bash
sudo certbot --nginx -d yoursite.com
```

Most server management tools (Ploi, Forge, Coolify) handle SSL with one click.

### Health Check Endpoint

Use the GraphQL endpoint as a health check:

```bash
curl -f http://localhost:3000/api/graphql?query={__typename}
```

Returns `200` if the server is healthy.

### Asset Backup

Back up uploaded assets separately since they're not always in Git:

```bash
# Rsync assets to backup location
rsync -avz /var/www/my-site/public/assets/ /backups/assets/
```

