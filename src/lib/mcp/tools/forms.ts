import type { McpToolDefinition, McpToolHandler } from '../server'

/**
 * MCP tool definitions for form operations.
 *
 * Requirements: 17.8, 17.10
 */

const listFormsDefinition: McpToolDefinition = {
  name: 'list_forms',
  description:
    'List all forms configured in the CMS. Returns the handle, title, and submission count for each form.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  resource: 'forms',
  action: 'read',
}

const getFormDefinition: McpToolDefinition = {
  name: 'get_form',
  description:
    'Get the full definition of a specific form by its handle. Returns the form configuration including fields, validation rules, and submission settings.',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'The form handle (e.g. "contact", "newsletter")',
      },
    },
    required: ['handle'],
  },
  resource: 'forms',
  action: 'read',
}

const listSubmissionsDefinition: McpToolDefinition = {
  name: 'list_submissions',
  description:
    'List submissions for a specific form. Returns submission data, timestamps, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      form: {
        type: 'string',
        description: 'The form handle to list submissions for',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of submissions to return',
      },
      offset: {
        type: 'number',
        description: 'Skip this many submissions (for pagination)',
      },
    },
    required: ['form'],
  },
  resource: 'forms',
  action: 'read',
}

const deleteSubmissionDefinition: McpToolDefinition = {
  name: 'delete_submission',
  description:
    'Delete a specific form submission by its ID. Permanently removes the submission data.',
  inputSchema: {
    type: 'object',
    properties: {
      form: {
        type: 'string',
        description: 'The form handle the submission belongs to',
      },
      id: {
        type: 'string',
        description: 'The unique ID of the submission to delete',
      },
    },
    required: ['form', 'id'],
  },
  resource: 'forms',
  action: 'write',
}

// Placeholder handlers — will delegate to ContentEngine once wired up
const listFormsHandler: McpToolHandler = async () => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({ forms: [] }),
    },
  ],
})

const getFormHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: args.handle,
        title: null,
        fields: [],
        submissions: 0,
      }),
    },
  ],
})

const listSubmissionsHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        form: args.form,
        submissions: [],
        total: 0,
      }),
    },
  ],
})

const deleteSubmissionHandler: McpToolHandler = async (args) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        deleted: true,
        form: args.form,
        id: args.id,
      }),
    },
  ],
})

/**
 * All form tool registrations.
 */
export const formTools: Array<{
  definition: McpToolDefinition
  handler: McpToolHandler
}> = [
  { definition: listFormsDefinition, handler: listFormsHandler },
  { definition: getFormDefinition, handler: getFormHandler },
  { definition: listSubmissionsDefinition, handler: listSubmissionsHandler },
  { definition: deleteSubmissionDefinition, handler: deleteSubmissionHandler },
]
