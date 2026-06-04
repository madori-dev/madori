---
title: Editor Guide
slug: editor-guide
status: published
createdAt: 2026-05-31T20:00:00.000Z
updatedAt: 2026-05-31T20:00:00.000Z
---

# Editor Guide

This guide walks you through everyday tasks in the Madori Control Panel — creating content, managing files, organising navigation, and working with form submissions. No technical knowledge required.

---

## Configuration Reference

As an editor, you don't need to configure files — but here's what you'll encounter in the Control Panel interface:

### Control Panel Sections

| Section | Location | Purpose |
|---------|----------|---------|
| Collections | Sidebar → collection name | Create, edit, and manage content entries |
| Assets | Sidebar → Assets | Upload and organise files and images |
| Navigation | Sidebar → Navigation | Manage site menus and link trees |
| Forms | Sidebar → Forms | View submissions and export data |
| Globals | Sidebar → Globals | Edit site-wide settings |
| Taxonomies | Sidebar → Taxonomies | Manage tags and categories |
| Users | Sidebar → Users | Manage user accounts (admin only) |

### Field Types You'll Encounter

| Field | What It Looks Like | What You Enter |
|-------|-------------------|----------------|
| Text | Single line input | Short text (titles, names) |
| Rich text | Toolbar with formatting | Formatted content (bold, links, headings) |
| Number | Number input with arrows | Numeric values |
| Toggle | On/off switch | Yes or no |
| Select | Dropdown menu | Choose one option |
| Date | Calendar picker | Pick a date |
| Asset | File browser button | Select an image or file |

### Status Values

| Status | Meaning |
|--------|---------|
| Draft | Not visible on the live site |
| Published | Visible on the live site |

---

## Usage Examples

### Signing In

Open the Control Panel by visiting your site's URL followed by `/cp` (for example, `https://yoursite.com/cp`). Enter your email and password to sign in.

Once logged in, you'll see the sidebar on the left with links to each section: Collections, Assets, Navigation, Forms, and more.

---

### Creating and Editing Content

Content in MADORI lives in **collections**. A collection is a group of similar items — like blog posts, pages, or products. Each item in a collection is called an **entry**.

### Creating a new entry

1. In the sidebar, click the collection you want to add to (e.g. **Blog**)
2. Click the **Create Entry** button at the top of the list
3. Fill in the fields — the available fields depend on how the collection was set up
4. Click **Save** when you're done

Your new entry is live immediately.

### Editing an existing entry

1. Navigate to the collection in the sidebar
2. Click on the entry you want to edit
3. Make your changes in the form fields
4. Click **Save**

### Understanding fields

When you create or edit an entry, you'll see different types of fields:

- **Text** — a single line of text (titles, names)
- **Rich text** — a full text editor with formatting options (bold, italic, links, headings)
- **Number** — numeric values
- **Toggle** — an on/off switch
- **Select** — choose one option from a dropdown
- **Date** — pick a date from a calendar
- **Asset** — attach an image or file (see the Assets section below)

Some fields may be marked as required — you'll see an error message if you try to save without filling them in.

### Using page builders (Replicator blocks)

Some collections let you build pages from reusable blocks. You'll see a section where you can:

- **Add a block** — click the add button and choose a block type (e.g. text section, image gallery, call-to-action)
- **Reorder blocks** — drag blocks up and down to rearrange the page layout
- **Duplicate a block** — click the duplicate icon to copy a block and its content
- **Collapse blocks** — click the block header to collapse or expand it, making long pages easier to work with
- **Delete a block** — click the delete icon to remove a block

If you prefer not to drag, you can also use the arrow buttons to move blocks up or down.

### Tips for content creation

- Save regularly — MADORI will warn you if you try to leave the page with unsaved changes
- Use the collapse feature when working with many blocks to keep the page manageable
- If a field shows an error, check the message next to it for what needs fixing

---

### Managing Assets (Files and Images)

The **Assets** section is your file library. You can upload images, documents, videos, and other files here, then use them in your content.

### Uploading files

1. Go to **Assets** in the sidebar
2. Either drag and drop files onto the page, or click the **Upload** button and select files from your computer
3. You can upload multiple files at once — each file shows a progress indicator while uploading

If a file is too large or the wrong type, you'll see a clear message explaining the issue.

### Organising with folders

Keep your assets tidy using folders:

1. Click **Create Folder** and give it a name (e.g. "Blog Images" or "Downloads")
2. Click on a folder to navigate into it
3. Use the breadcrumb trail at the top to go back to parent folders

You can create folders inside folders for deeper organisation.

### Viewing and editing file details

Click on any file to see its details:

- **Filename** — you can rename the file
- **Alt text** — add a description for accessibility (important for images)
- **File size** and **dimensions** — displayed automatically for images
- **File type** — shown as an icon or thumbnail preview

Changes to alt text and filename save immediately.

### Working with multiple files

- **Select multiple files** — hold Shift or Cmd/Ctrl while clicking
- **Move files** — select files, then choose a destination folder
- **Delete files** — select files and click delete (you'll be asked to confirm)

### Inserting assets into content

When editing content, asset fields show a picker button. Click it to open the asset browser within your editor, where you can:

- Browse folders
- Search by filename
- Select an existing file or upload a new one
- Confirm your selection

### Tips for asset management

- Add alt text to all images — it helps with accessibility and search engines
- Use a consistent folder structure (e.g. one folder per collection or per year)
- Upload images at the size you need them rather than relying on the browser to resize

---

### Editing Navigation

The **Navigation** section lets you manage your site's menus — the links visitors see in your header, footer, or sidebar.

### Understanding navigation trees

A navigation is a list of links arranged in a tree structure. Items can be nested to create dropdown menus or sub-sections. For example:

```
Home
About
  ├── Our Team
  └── Contact
Blog
```

### Adding a navigation item

1. Go to **Navigation** in the sidebar and select the navigation you want to edit (e.g. "Main" or "Footer")
2. Click **Add Item**
3. Choose the item type:
   - **URL** — enter any web address
   - **Entry** — link to a page or post from one of your collections
   - **Text only** — a label with no link (useful as a group heading in dropdowns)
4. Enter a label (the text visitors will see)
5. Click **Save**

### Reordering items

Drag items up and down to change their order. To nest an item (make it a child of another item), drag it slightly to the right onto the parent item.

If you prefer the keyboard, use the arrow buttons next to each item to move it up, down, or change its nesting level.

### Editing and removing items

- **Edit** — click on an item's label or URL to change it inline
- **Remove** — click the delete icon on an item. If the item has children, you'll be asked whether to delete the children too or move them up a level

### Nesting limits

Some navigations have a maximum depth configured. If you've reached the limit, you won't be able to nest items any further and you'll see a visual indicator.

### Tips for navigation editing

- Keep top-level navigation short (5–7 items) for clarity
- Use descriptive labels — visitors should know where a link goes before clicking
- Check your navigation on mobile if your site has responsive menus

---

### Working with Forms

The **Forms** section shows you all the forms on your site (like contact forms, sign-up forms, or survey forms) and their submissions.

### Viewing submissions

1. Go to **Forms** in the sidebar
2. Click on a form (e.g. "Contact Form")
3. You'll see a list of all submissions, showing the date and a summary of each one
4. Click any submission to see the full details

### Exporting submissions

Need your form data in a spreadsheet or another tool? You can export submissions:

- **CSV export** — click the **Export CSV** button to download a spreadsheet-compatible file. Open it in Excel, Google Sheets, or any spreadsheet application.
- **JSON export** — click the **Export JSON** button for a format suitable for importing into other software or databases.

Both exports include all submissions for the selected form.

### Deleting submissions

To remove a submission:

1. Open the submission you want to delete
2. Click the **Delete** button
3. Confirm when prompted

Deleted submissions are permanently removed and cannot be recovered.

### Spam protection

Forms can include honeypot protection, which automatically filters out spam submissions. These are discarded silently — you'll only see real submissions in your list.

### Tips for form management

- Check submissions regularly so you don't miss enquiries
- Use CSV export to create backups of important form data
- If you notice spam getting through, ask your developer to review the honeypot settings

---

## Common Patterns

### Quick Reference

| Task | Where to Find It |
|------|------------------|
| Create content | Sidebar → Collection → Create Entry |
| Upload files | Sidebar → Assets → Upload or drag and drop |
| Edit alt text | Assets → click file → edit Alt text field |
| Edit navigation | Sidebar → Navigation → select a navigation |
| View form submissions | Sidebar → Forms → select a form |
| Export submissions | Forms → form → Export CSV or Export JSON |

### Efficient Content Workflows

- **Batch editing:** Open multiple browser tabs to edit several entries at once
- **Keyboard shortcuts:** Use Tab to move between fields quickly
- **Collapse blocks:** When working with page builders, collapse finished blocks to focus on the one you're editing
- **Save regularly:** Madori warns you if you try to leave with unsaved changes, but saving often prevents lost work

### Organising Your Content

- **Use descriptive titles:** They appear in lists and search results
- **Set status to Draft** while working, then switch to Published when ready
- **Use folders in Assets** to keep images organised (e.g. one folder per collection or topic)
- **Add alt text** to all images for accessibility and search engines

### Getting Help

If something isn't working as expected or you need a new field, collection, or form added, reach out to your developer. They can adjust the site's configuration to match your needs.
