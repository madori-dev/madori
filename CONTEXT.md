# Madori

Madori is a flat-file content management system. Its language separates authored content structure, reusable field structure, editorial tools, and generated SEO state.

## Language

**Control Panel**:
Authenticated editorial workspace for managing content, definitions, users, settings, and operational tools.
_Avoid_: Admin, dashboard

**Definition**:
Named configuration that declares a content kind such as a collection, taxonomy, global, form, or navigation.
_Avoid_: Content type config

**Blueprint**:
Named field schema and presentation layout used to edit and validate content.
_Avoid_: Form schema

**Fieldset**:
Reusable named group of fields that can be composed into Blueprints and other Fieldsets.
_Avoid_: Field group

**Field Layout**:
Ordered arrangement of fields, tabs, and sections edited by Blueprint and Fieldset tools.
_Avoid_: Form layout

**Settings**:
Runtime site values and project configuration edited through Control Panel.
_Avoid_: Preferences

**SEO Defaults**:
Versioned SEO values inherited by a site, collection, or taxonomy before record overrides are applied.
_Avoid_: SEO settings

**SEO Report**:
Operational snapshot of SEO findings for published content.
_Avoid_: Audit result

**404 Observation**:
Privacy-safe operational count of requests for a missing public path.
_Avoid_: Broken link record
