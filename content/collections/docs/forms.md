---
title: Forms
slug: forms
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Forms

Forms let you collect data from site visitors — contact enquiries, newsletter sign-ups, surveys, event registrations — and store submissions as flat files. The form system handles definition, frontend rendering, server-side validation, spam protection, and data export without requiring external services.

A form in Madori has two parts:

1. A **blueprint** that defines the form's fields (what data you collect)
2. A **definition** that configures behaviour (honeypot protection, submission storage)

Submissions are stored as timestamped YAML files and can be viewed in the Control Panel or exported as CSV/JSON.

---

## Configuration Reference

### Form Blueprint

Form blueprints define the fields visitors fill in. They live at `resources/blueprints/forms/{handle}.yaml` and follow the same structure as collection blueprints.

```yaml
# resources/blueprints/forms/contact.yaml
tabs:
  main:
    display: Form Fields
    fields:
      - handle: name
        field:
          type: text
          display: Full Name
          required: true
          validate:
            - required
            - min:2
            - max:100

      - handle: email
        field:
          type: text
          display: Email Address
          required: true
          validate:
            - required
            - email

      - handle: message
        field:
          type: markdown
          display: Message
          required: true
          validate:
            - required
            - min:10
            - max:5000
```

All [field types](/docs/field-types) and [validation rules](/docs/blueprints#validation-rules) available in collection blueprints work in form blueprints.

### Form Definition

Form definitions configure runtime behaviour. They live at `resources/forms/{handle}.yaml`:

```yaml
# resources/forms/contact.yaml
title: Contact Form
blueprint: contact
honeypot: true
store_submissions: true
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | `string` | — | Display name shown in the Control Panel |
| `blueprint` | `string` | — | Handle of the form blueprint to use |
| `honeypot` | `boolean` | `false` | Enable honeypot spam protection |
| `store_submissions` | `boolean` | `true` | Whether to persist submissions as files |

### File Structure

```
resources/
├── blueprints/forms/
│   ├── contact.yaml          # Field definitions
│   └── newsletter.yaml
├── forms/
│   ├── contact.yaml          # Form definition (behaviour config)
│   └── newsletter.yaml
content/
└── forms/
    ├── contact/              # Stored submissions
    │   ├── 2026-01-15T10-30-45-abc123.yaml
    │   └── 2026-01-16T09-15-22-def456.yaml
    └── newsletter/
```

### Submission Storage Format

Each submission is stored as a YAML file at `content/forms/{handle}/{timestamp}-{uuid}.yaml`:

```yaml
id: "550e8400-e29b-41d4-a716-446655440000"
form: "contact"
submitted_at: "2026-01-15T10:30:45.000Z"
data:
  name: "Jane Smith"
  email: "jane@example.com"
  message: "Hello, I'd like to learn more about your services."
```

The filename combines a timestamp (for chronological sorting) and a UUID (for uniqueness). The `data` field contains the submitted values keyed by field handle.

---

## Frontend Integration

### Rendering a Form

Build your form HTML using the field handles defined in your blueprint. Submit to the form's API endpoint:

```html
<form action="/api/forms/contact/submit" method="POST" id="contact-form">
  <div>
    <label for="name">Full Name</label>
    <input type="text" id="name" name="name" required minlength="2" maxlength="100" />
  </div>

  <div>
    <label for="email">Email Address</label>
    <input type="email" id="email" name="email" required />
  </div>

  <div>
    <label for="message">Message</label>
    <textarea id="message" name="message" required minlength="10" maxlength="5000"></textarea>
  </div>

  <!-- Honeypot field — hidden from real users -->
  <div style="position: absolute; left: -9999px;" aria-hidden="true">
    <input type="text" name="_honeypot" tabindex="-1" autocomplete="off" />
  </div>

  <button type="submit">Send Message</button>
</form>
```

### Submitting with JavaScript

For a better user experience, submit forms via `fetch` and handle validation errors inline:

```javascript
const form = document.getElementById('contact-form')

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  const formData = new FormData(form)
  const data = Object.fromEntries(formData.entries())

  const response = await fetch('/api/forms/contact/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (response.ok) {
    // Submission successful
    form.reset()
    showMessage('Thank you! Your message has been sent.')
  } else {
    const result = await response.json()
    if (result.error?.code === 'VALIDATION_ERROR') {
      // Display field-level errors
      displayFieldErrors(result.error.fields)
    }
  }
})

function displayFieldErrors(fields) {
  // Clear previous errors
  document.querySelectorAll('.field-error').forEach(el => el.remove())

  for (const [handle, messages] of Object.entries(fields)) {
    const input = document.querySelector(`[name="${handle}"]`)
    if (input) {
      const errorEl = document.createElement('span')
      errorEl.className = 'field-error'
      errorEl.textContent = messages[0]
      input.parentNode.appendChild(errorEl)
    }
  }
}
```

### React Integration

For React/Next.js projects, use the built-in `MadoriForm` and `FormField` components:

```tsx
import { MadoriForm, FormField } from '@/components/site/MadoriForm'

export function ContactForm() {
  return (
    <MadoriForm
      handle="contact"
      successMessage={<p>Thank you! Your message has been sent.</p>}
      className="space-y-4"
    >
      {({ errors, submitting }) => (
        <>
          <FormField handle="name" label="Full Name" errors={errors.name}>
            <input type="text" id="name" name="name" required />
          </FormField>

          <FormField handle="email" label="Email Address" errors={errors.email}>
            <input type="email" id="email" name="email" required />
          </FormField>

          <FormField handle="message" label="Message" errors={errors.message}>
            <textarea id="message" name="message" required />
          </FormField>

          {/* Honeypot */}
          <input type="text" name="_honeypot" style={{ display: 'none' }} tabIndex={-1} />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </>
      )}
    </MadoriForm>
  )
}
```

The `MadoriForm` component:
- Submits to `/api/forms/{handle}/submit` automatically
- Catches `VALIDATION_ERROR` responses and exposes field-level errors via the render prop
- Displays a success message after successful submission

The `FormField` component:
- Wraps each input with a label and error display area
- Shows validation errors adjacent to the field using `role="alert"` for accessibility
- Accepts `errors` from the parent render prop keyed by field handle

If you prefer building the form manually, you can handle the validation response directly:

#### Manual React Integration

```tsx
import { useState } from 'react'

interface FormErrors {
  [field: string]: string[]
}

export function ContactForm() {
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})

    const formData = new FormData(event.currentTarget)
    const data = Object.fromEntries(formData.entries())

    const response = await fetch('/api/forms/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (response.ok) {
      setSubmitted(true)
    } else {
      const result = await response.json()
      if (result.error?.fields) {
        setErrors(result.error.fields)
      }
    }
  }

  if (submitted) {
    return <p>Thank you! Your message has been sent.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Full Name</label>
        <input type="text" id="name" name="name" required />
        {errors.name && <span className="error">{errors.name[0]}</span>}
      </div>

      <div>
        <label htmlFor="email">Email Address</label>
        <input type="email" id="email" name="email" required />
        {errors.email && <span className="error">{errors.email[0]}</span>}
      </div>

      <div>
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" required />
        {errors.message && <span className="error">{errors.message[0]}</span>}
      </div>

      {/* Honeypot */}
      <input type="text" name="_honeypot" style={{ display: 'none' }} tabIndex={-1} />

      <button type="submit">Send Message</button>
    </form>
  )
}
```

### Validation Error Response

When submission data fails validation, the API returns a `422` response with field-level errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": {
      "email": ["Must be a valid email address"],
      "message": ["Must be at least 10 characters"]
    }
  }
}
```

Each key in `fields` maps to a field handle from the blueprint, and the value is an array of error messages. Display these adjacent to the corresponding form inputs.

---

## Submission Handling

### How Submissions Are Processed

When a visitor submits a form:

1. The API receives the POST request at `/api/forms/{handle}/submit`
2. If honeypot protection is enabled, the `_honeypot` field is checked — if filled, the submission is silently discarded (returns `201` to avoid revealing detection)
3. The submission data is validated against the form blueprint's validation rules
4. If validation passes, the submission is stored as a YAML file in `content/forms/{handle}/`
5. A success response is returned with the submission data

### Viewing in the Control Panel

Navigate to **Forms** in the CP sidebar to see all defined forms. Click a form to view its submissions:

- Submissions are listed with timestamp and summary fields
- Click any submission to view all submitted field values in a read-only detail view
- Submissions are sorted newest-first by default

### Deleting Submissions

In the submission detail view, click **Delete** and confirm. Deleted submissions are permanently removed from the filesystem and cannot be recovered.

---

## Export

### CSV Export

Export all submissions for a form as a comma-separated values file:

```
GET /api/forms/{handle}/export/csv
```

The CSV includes:

- `id` and `submitted_at` columns for every submission
- One column per unique field handle found across all submissions (sorted alphabetically)
- Values containing commas, quotes, or newlines are properly escaped

Open the downloaded file in Excel, Google Sheets, or any spreadsheet application.

### JSON Export

Export all submissions as a JSON array:

```
GET /api/forms/{handle}/export/json
```

Returns a JSON array where each element contains:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "form": "contact",
    "submittedAt": "2026-01-15T10:30:45.000Z",
    "data": {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "message": "Hello, I'd like to learn more."
    }
  }
]
```

Both exports are also available via buttons in the Control Panel form detail view.

---

## Honeypot Protection

Honeypot protection filters bot submissions without requiring CAPTCHAs or third-party services. When enabled, a hidden field is added to your form that real users never see or fill in. Bots that auto-fill all fields will trigger the filter.

### Enabling Honeypot

Set `honeypot: true` in your form definition:

```yaml
# resources/forms/contact.yaml
title: Contact Form
blueprint: contact
honeypot: true
```

### Frontend Implementation

Add a hidden input named `_honeypot` to your form. It must be visually hidden but present in the DOM:

```html
<!-- Hidden from human users via CSS positioning -->
<div style="position: absolute; left: -9999px;" aria-hidden="true">
  <label for="website">Website</label>
  <input type="text" id="website" name="_honeypot" tabindex="-1" autocomplete="off" />
</div>
```

Do not use `display: none` or `visibility: hidden` — some bots detect these and skip the field. Instead, position the field offscreen.

### How It Works

1. A real user submits the form — the `_honeypot` field is empty
2. The server checks the honeypot field value
3. If empty → submission is processed normally
4. If filled → submission is silently discarded
5. Both cases return a `201` status to avoid revealing the filtering to bots

The honeypot field is stripped from submission data before storage, so it never appears in your stored submissions or exports.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms` | List all form definitions |
| GET | `/api/forms/{handle}` | Get a single form definition |
| POST | `/api/forms/{handle}/submit` | Submit form data |
| GET | `/api/forms/{handle}/submissions` | List submissions (paginated) |
| GET | `/api/forms/{handle}/submissions/{id}` | Get a single submission |
| DELETE | `/api/forms/{handle}/submissions/{id}` | Delete a submission |
| GET | `/api/forms/{handle}/export/csv` | Export submissions as CSV |
| GET | `/api/forms/{handle}/export/json` | Export submissions as JSON |

### Pagination Parameters

The submissions list endpoint accepts query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `number` | `1` | Page number (1-indexed) |
| `perPage` | `number` | `20` | Results per page (max 100) |
| `sort` | `string` | `newest` | Sort order: `newest` or `oldest` |

Response includes pagination metadata:

```json
{
  "data": {
    "submissions": [...],
    "total": 47,
    "page": 1,
    "perPage": 20
  }
}
```

---

## Usage Examples

### Contact Form

A standard contact form with name, email, subject selection, and message body:

**Blueprint** (`resources/blueprints/forms/contact.yaml`):

```yaml
tabs:
  main:
    display: Form Fields
    fields:
      - handle: name
        field:
          type: text
          display: Full Name
          required: true
          validate:
            - required
            - min:2
            - max:100

      - handle: email
        field:
          type: text
          display: Email Address
          required: true
          validate:
            - required
            - email

      - handle: subject
        field:
          type: select
          display: Subject
          required: true
          options:
            options:
              - General Inquiry
              - Support
              - Feedback
              - Partnership

      - handle: message
        field:
          type: markdown
          display: Message
          required: true
          validate:
            - required
            - min:10
            - max:5000
```

**Definition** (`resources/forms/contact.yaml`):

```yaml
title: Contact Form
blueprint: contact
honeypot: true
store_submissions: true
```

### Newsletter Sign-up

A minimal form collecting just an email address:

**Blueprint** (`resources/blueprints/forms/newsletter.yaml`):

```yaml
tabs:
  main:
    fields:
      - handle: email
        field:
          type: text
          display: Email Address
          required: true
          validate:
            - required
            - email

      - handle: interests
        field:
          type: multiselect
          display: Interests
          options:
            options:
              - Product Updates
              - Engineering Blog
              - Community Events
```

**Definition** (`resources/forms/newsletter.yaml`):

```yaml
title: Newsletter
blueprint: newsletter
honeypot: true
store_submissions: true
```

### Event Registration

A more complex form with conditional fields:

**Blueprint** (`resources/blueprints/forms/event-registration.yaml`):

```yaml
tabs:
  main:
    display: Registration
    fields:
      - handle: full_name
        field:
          type: text
          display: Full Name
          required: true
          validate:
            - required
            - max:200

      - handle: email
        field:
          type: text
          display: Email
          required: true
          validate:
            - required
            - email

      - handle: ticket_type
        field:
          type: select
          display: Ticket Type
          required: true
          default: general
          options:
            options:
              - general
              - vip
              - student

      - handle: dietary_requirements
        field:
          type: text
          display: Dietary Requirements
          options:
            placeholder: Leave blank if none
          visibility:
            field: ticket_type
            operator: not_equals
            value: student

      - handle: company
        field:
          type: text
          display: Company Name
          visibility:
            field: ticket_type
            operator: equals
            value: vip
```

---

## Common Patterns

### Client-Side Validation Before Submission

Mirror your blueprint's validation rules in HTML attributes for immediate feedback, then rely on server-side validation as the source of truth:

```html
<input
  type="email"
  name="email"
  required
  pattern="[^@]+@[^@]+\.[^@]+"
  title="Please enter a valid email address"
/>
```

The server always validates regardless of client-side checks, so validation cannot be bypassed.

### Redirect After Submission

Redirect users to a thank-you page after successful submission:

```javascript
const response = await fetch('/api/forms/contact/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

if (response.ok) {
  window.location.href = '/thank-you'
}
```

### Multiple Forms on One Page

Use different form handles and submit to their respective endpoints:

```html
<form action="/api/forms/contact/submit" method="POST">
  <!-- Contact form fields -->
</form>

<form action="/api/forms/newsletter/submit" method="POST">
  <!-- Newsletter fields -->
</form>
```

### Progressive Enhancement

Build forms that work without JavaScript, then enhance with async submission:

```html
<form action="/api/forms/contact/submit" method="POST" id="contact-form">
  <!-- Fields -->
  <button type="submit">Send</button>
</form>

<script>
  // Enhance with JS when available
  document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    // ... async submission with error handling
  })
</script>
```

### Styling Validation Errors

Apply consistent error styling using a utility class:

```css
.field-error {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: #dc2626;
}

input:invalid,
textarea:invalid {
  border-color: #dc2626;
}
```

### Automated Export Backups

Use the export API endpoints in a scheduled task to create regular backups:

```bash
# Download CSV backup of contact form submissions
curl -o "backups/contact-$(date +%Y%m%d).csv" \
  https://yoursite.com/api/forms/contact/export/csv

# Download JSON backup
curl -o "backups/contact-$(date +%Y%m%d).json" \
  https://yoursite.com/api/forms/contact/export/json
```

### Conditional Fields in Forms

When your blueprint uses visibility conditions, handle them on the frontend by showing/hiding fields based on user input:

```javascript
const ticketType = document.querySelector('[name="ticket_type"]')
const companyField = document.getElementById('company-group')

ticketType.addEventListener('change', (e) => {
  companyField.style.display = e.target.value === 'vip' ? 'block' : 'none'
})
```

Hidden fields are excluded from the submission payload by the server if their visibility condition evaluates to `false`, so even if a hidden field is submitted, it won't be stored.
