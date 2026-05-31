---
title: Forms
slug: docs/forms
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Forms

MADORI can collect form submissions and store them as flat files.

## Defining a Form

Create a blueprint at `resources/blueprints/forms/{handle}.yaml`:

```yaml
tabs:
  main:
    fields:
      - handle: name
        field:
          type: text
          display: Name
          required: true
      - handle: email
        field:
          type: text
          display: Email
          required: true
      - handle: message
        field:
          type: markdown
          display: Message
```

And a definition at `resources/forms/{handle}.yaml`:

```yaml
title: Contact Form
blueprint: contact
honeypot: true
store_submissions: true
```

## Submissions

Form submissions are stored as timestamped YAML files in `content/forms/{handle}/`:

```yaml
# content/forms/contact/2026-01-15T10-30-45-abc123.yaml
id: abc123
form: contact
submitted_at: 2026-01-15T10:30:45.000Z
data:
  name: Jane Smith
  email: jane@example.com
  message: Hello, I'd like to learn more about your services.
```

## Viewing Submissions

In the Control Panel, navigate to **Forms → {handle}** to view all submissions.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms` | List all forms |
| GET | `/api/forms/{handle}` | Get form definition |
| POST | `/api/forms/{handle}/submit` | Submit form data |
