---
sidebar_position: 2
title: Add a Custom Domain
---

# Add a Custom Domain

Beyond the 22 built-in domains, you can define your own domain ontology. There are three ways to do this: let the LLM generate one from a description, pass a description via CLI flags, or write the YAML by hand.

## Option 1: Interactive Wizard

Run the CLI and select the custom domain option:

```bash
create-context-graph my-app
```

1. At the domain selection step, choose **"Custom (describe your domain)"**.
2. Enter a natural-language description of your domain (e.g., `"veterinary clinic management with patients, owners, appointments, and treatments"`).
3. The LLM generates a full ontology YAML -- entity types, relationships, agent tools, system prompt, visualization config, and demo scenarios.
4. Review the generated ontology summary. Accept it, or refine your description and regenerate.

This requires an Anthropic API key. The wizard prompts for one if `ANTHROPIC_API_KEY` is not set in your environment.

## Option 2: CLI Flags

Skip the wizard entirely:

```bash
create-context-graph my-app \
  --custom-domain "veterinary clinic management with patients, owners, appointments, and treatments" \
  --anthropic-api-key $ANTHROPIC_API_KEY \
  --framework pydanticai \
  --demo-data
```

The `--custom-domain` flag triggers LLM ontology generation and bypasses the domain selection step. All other flags (`--framework`, `--demo-data`, `--connector`, etc.) work as usual.

## Option 3: Manual YAML

Write a domain YAML file from scratch and point the CLI at it:

```bash
create-context-graph my-app --ontology-file ./my-domain.yaml --framework langgraph
```

Your YAML must follow the domain ontology schema. At minimum, include:

```yaml
inherits: _base

domain:
  id: veterinary
  name: Veterinary Clinic
  description: Veterinary clinic management system
  tagline: "AI-powered veterinary care coordination"
  emoji: "🐾"

entity_types:
  - label: Patient
    pole_type: PERSON
    subtype: Animal
    color: "#4CAF50"
    icon: pet
    properties:
      - name: name
        type: string
        required: true
      - name: species
        type: string
        required: true
        enum: ["dog", "cat", "bird", "reptile", "other"]

relationships:
  - type: OWNS
    source: Person
    target: Patient

agent_tools:
  - name: find_patient
    description: Find a patient by name
    cypher: "MATCH (p:Patient) WHERE p.name CONTAINS $name RETURN p"
    parameters:
      - name: name
        type: string

system_prompt: |
  You are a veterinary clinic assistant with access to patient and appointment records.

visualization:
  node_colors:
    Patient: "#4CAF50"
  default_cypher: "MATCH (n) RETURN n LIMIT 50"
```

See the [Ontology YAML Schema](/docs/reference/ontology-yaml-schema) for the complete specification with examples. The `_base.yaml` file defines the inherited POLE+O entity types (Person, Organization, Location, Event, Object) that your domain will automatically include. In the generated project, your ontology lives at `data/ontology.yaml`.

## Saving Custom Domains for Reuse

LLM-generated ontologies are saved to `~/.create-context-graph/custom-domains/` by default. You can reuse a previously generated domain:

```bash
# List saved custom domains
ls ~/.create-context-graph/custom-domains/

# Reuse a saved domain
create-context-graph my-app \
  --ontology-file ~/.create-context-graph/custom-domains/veterinary.yaml
```

Generated domains are also copied into the scaffolded project at `data/ontology.yaml`, so each project is self-contained.

## Tips for Writing Good Domain Descriptions

- **Be specific about entities.** "Healthcare with patients, doctors, diagnoses, medications, and appointments" produces better results than "healthcare."
- **Mention key relationships.** "Students enroll in courses taught by professors" helps the LLM define the correct graph edges.
- **Include domain actions.** "Track shipments, manage inventory, handle returns" gives the LLM material for generating agent tools.
- **Keep it to 1-3 sentences.** The LLM works best with focused descriptions rather than long paragraphs.
