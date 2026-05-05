# Contributing to Create Context Graph

Thank you for your interest in contributing! This project is part of [Neo4j Labs](https://neo4j.com/labs/) and follows the Apache-2.0 license.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/neo4j-labs/create-context-graph.git
cd create-context-graph

# Create a virtual environment and install dev dependencies
uv venv && uv pip install -e ".[dev]"

# Activate and run tests
source .venv/bin/activate
pytest tests/ -v
```

## What You Can Contribute

### Adding a New Domain

1. Create `src/create_context_graph/domains/{domain-id}.yaml` following the ontology YAML schema (see `CLAUDE.md` for full spec)
2. Generate fixture data: `create-context-graph my-app --domain {domain-id} --framework pydanticai --demo-data`
3. Copy the fixture to `src/create_context_graph/fixtures/{domain-id}.json`
4. Verify: `pytest tests/test_ontology.py::TestLoadAllDomains -v`

### Adding a New Agent Framework

1. Create the template at `src/create_context_graph/templates/backend/agents/{framework_key}/agent.py.j2`
2. Add the framework key to `SUPPORTED_FRAMEWORKS`, `FRAMEWORK_DISPLAY_NAMES`, and `FRAMEWORK_DEPENDENCIES` in `config.py`
3. See `CLAUDE.md` for template requirements and patterns

### Adding a New SaaS Connector

1. Create `src/create_context_graph/connectors/{service}_connector.py` implementing `BaseConnector`
2. Use `@register_connector("service-id")` decorator
3. Create the template at `templates/backend/connectors/{service}_connector.py.j2`
4. Add tests to `tests/test_connectors.py`
5. See `CLAUDE.md` for the full connector guide

## Running Tests

```bash
# Fast tests (no Neo4j or API keys required)
pytest tests/ -v                # ~182 tests, ~5 seconds

# Full matrix (all 22 domains x 8 frameworks = 176 combos)
pytest tests/ -v --slow         # ~358 tests, ~30 seconds
```

Tests are organized by module:

| File | What it tests |
|------|---------------|
| `test_config.py` | ProjectConfig model |
| `test_ontology.py` | Domain YAML loading and validation |
| `test_renderer.py` | Jinja2 template rendering |
| `test_generator.py` | Synthetic data generation |
| `test_cli.py` | CLI integration (8 domain/framework combos) |
| `test_custom_domain.py` | LLM-powered domain generation |
| `test_connectors.py` | SaaS connector mocks |
| `test_generated_project.py` | Deep validation of scaffolded projects |
| `test_matrix.py` | Full 176-combo matrix (slow) |

## Code Style

- Follow existing patterns in the codebase
- Use type annotations (Python 3.11+ syntax)
- All `.py` files must include the Apache-2.0 license header
- Jinja2 templates use `{% raw %}...{% endraw %}` for JSX/Python dict literals

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes and add tests
3. Ensure all tests pass: `pytest tests/ -v`
4. Submit a pull request against `main`
5. Describe what you changed and why

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0. All source files must include the standard license header.
