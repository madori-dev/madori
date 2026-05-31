---
title: Deployment
slug: docs/deployment
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Deployment

MADORI runs anywhere Node.js runs. No database required.

## Build

```bash
pnpm build
pnpm start
```

This starts a production Next.js server on port 3000.

## Hosting Options

### VPS (Recommended for full CP)

A VPS gives you a persistent filesystem, meaning the Control Panel works fully — content editing, asset uploads, user management all persist between deploys.

**Providers:** DigitalOcean, Hetzner, Vultr, Linode, AWS EC2

**Deploy script example (Ploi, Forge, or custom):**

```bash
git pull origin main
pnpm install --frozen-lockfile
pnpm build
# Restart your process manager (PM2, Supervisor, systemd)
```

**Nginx reverse proxy:**

```nginx
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
```

### Vercel / Netlify (Frontend only)

Serverless platforms work for the frontend site but the Control Panel won't persist changes — the filesystem is read-only and ephemeral.

Good for: marketing sites, documentation, blogs where content is committed to git.

### Railway / Render

Persistent filesystem + always-on process. Full CP support.

## Environment Variables

Set `NODE_ENV=production` for:
- Secure session cookies
- Disabled GraphQL introspection (unless configured otherwise)
- Optimized Next.js builds

## Process Management

Use a process manager to keep the server running:

**systemd:**

```ini
[Unit]
Description=MADORI CMS
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/my-site
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**PM2:**

```bash
pm2 start pnpm --name madori -- start
```

**Supervisor (Ploi):**

Configure via your server management panel with command `pnpm start` and directory set to your project root.

## SSL

Use Let's Encrypt via your hosting panel (Ploi, Forge) or Certbot for free SSL certificates. Most server management tools handle this with one click.

## Content in Git

Since all content is flat files, you can commit content to your repository. This gives you:
- Version history for all content changes
- Pull request workflow for content review
- Easy rollback if something goes wrong
- Content works across environments (dev/staging/production)
