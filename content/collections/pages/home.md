---
title: Home
slug: home
status: published
createdAt: 2026-06-03T08:15:33.462Z
updatedAt: 2026-06-03T12:00:00.000Z
template: home
order: 1
blocks:
  - _type: hero
    title: The flat-file CMS for React applications
    subtitle: Built on React, powered by TypeScript. A Statamic-inspired content management system for the JavaScript ecosystem.
    primary_button_text: Get Started
    primary_button_link: /getting-started
    secondary_button_text: View on GitHub
    secondary_button_link: https://github.com/madori-dev/madori

  - _type: features_grid
    title: Everything you need to manage content
    subtitle: A complete content management toolkit, no database required.
    features:
      - _type: feature_item
        feature_name: Collections
        feature_description: Organize your content into structured collections with custom blueprints and fields.
        feature_icon: Layers
      - _type: feature_item
        feature_name: Blueprints
        feature_description: Define flexible content schemas with a visual editor or YAML configuration.
        feature_icon: Layout
      - _type: feature_item
        feature_name: Taxonomies
        feature_description: Tag and categorize content with hierarchical taxonomy systems.
        feature_icon: Tags
      - _type: feature_item
        feature_name: Control Panel
        feature_description: A polished admin interface for content editors, built with modern React.
        feature_icon: Settings
      - _type: feature_item
        feature_name: Flat-File Storage
        feature_description: All content stored as Markdown and YAML. Version control friendly, no database needed.
        feature_icon: FileText
      - _type: feature_item
        feature_name: GraphQL API
        feature_description: Auto-generated GraphQL schema from your blueprints. Query content with type safety.
        feature_icon: Zap

  - _type: basic_cta
    title: Ready to build with Madori?
    text: Get up and running in minutes. One command to scaffold, one to start.
    primary_button_text: Get Started
    primary_button_link: /getting-started
    secondary_button_text: View on GitHub
    secondary_button_link: https://github.com/madori-dev/madori

  - _type: about_the_creator
    title: About Madori
    subtitle: A passion project by a developer who wanted better tooling.
    content: |
      Madori was born from a simple idea: take the best parts of flat-file CMS systems like Statamic and bring them to the React/Next.js ecosystem.

      No database to manage. No complex hosting requirements. Just content as files — Markdown, YAML, and JSON — versioned alongside your code.

      **Key principles:**

      - Content lives in your repository
      - Blueprints define your schema
      - The control panel is optional
      - Everything is extensible
---

