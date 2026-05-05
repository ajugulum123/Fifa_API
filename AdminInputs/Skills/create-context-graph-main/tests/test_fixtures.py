# Copyright 2026 Neo4j Labs
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Cross-validation tests for fixture data against domain ontology schemas."""

import json
import re
from pathlib import Path

import pytest

from create_context_graph.ontology import list_available_domains, load_domain


FIXTURES_DIR = Path(__file__).parent.parent / "src" / "create_context_graph" / "fixtures"

# Properties that are computed at runtime (e.g., vector embeddings) — not expected in fixtures
RUNTIME_PROPERTIES = {"embedding", "fastrp_embedding", "domain"}


def _get_all_domains():
    """Return list of domain IDs that have fixture files."""
    return [d["id"] for d in list_available_domains() if (FIXTURES_DIR / f"{d['id']}.json").exists()]


def _extract_property_refs_from_cypher(cypher: str) -> list[tuple[str, str]]:
    """Extract (alias, property) pairs from Cypher query property references.

    Matches patterns like n.property_name, e.some_prop, but excludes
    function calls and known Cypher keywords.
    """
    # Match alias.property patterns, excluding db.index, db.schema, etc.
    refs = re.findall(r'\b([a-z]\w?)\.([a-z_]\w*)\b', cypher, re.IGNORECASE)
    # Filter out known non-property patterns
    excluded_aliases = {"db", "gds", "apoc", "neo4j"}
    excluded_props = {"index", "schema", "vector", "queryNodes", "visualization", "labels", "type"}
    return [
        (alias, prop) for alias, prop in refs
        if alias.lower() not in excluded_aliases
        and prop not in excluded_props
        and not prop.startswith("__")
    ]


def _get_fixture_properties(fixture_data: dict, label: str) -> set[str]:
    """Get the set of all properties present across entities of a given label."""
    entities = fixture_data.get("entities", {}).get(label, [])
    props = set()
    for entity in entities:
        props.update(entity.keys())
    return props


class TestFixtureSchemaAlignment:
    """Verify that fixture data includes properties referenced by agent tools."""

    @pytest.mark.parametrize("domain_id", _get_all_domains())
    def test_fixture_entities_have_required_yaml_properties(self, domain_id: str):
        """Each entity in fixtures should have all required properties from the YAML schema."""
        ontology = load_domain(domain_id)
        fixture_path = FIXTURES_DIR / f"{domain_id}.json"
        fixture_data = json.loads(fixture_path.read_text())

        missing = []
        for et in ontology.entity_types:
            required_props = [p.name for p in et.properties if p.required]
            fixture_entities = fixture_data.get("entities", {}).get(et.label, [])
            if not fixture_entities:
                continue
            # Check first entity has required properties
            first_entity = fixture_entities[0]
            for prop_name in required_props:
                if prop_name not in first_entity:
                    missing.append(f"{et.label}.{prop_name}")

        assert not missing, (
            f"Domain '{domain_id}': fixture entities missing required properties: {missing}"
        )

    @pytest.mark.parametrize("domain_id", _get_all_domains())
    def test_agent_tools_reference_existing_properties(self, domain_id: str):
        """Agent tool Cypher queries should only reference properties that exist in fixtures or schema."""
        ontology = load_domain(domain_id)
        fixture_path = FIXTURES_DIR / f"{domain_id}.json"
        fixture_data = json.loads(fixture_path.read_text())

        # Build a map of label -> known properties (from YAML schema)
        schema_props = {}
        for et in ontology.entity_types:
            schema_props[et.label] = {p.name for p in et.properties} | {"name", "description"} | RUNTIME_PROPERTIES

        # Check each agent tool's Cypher query
        issues = []
        for tool in ontology.agent_tools:
            cypher = tool.cypher
            refs = _extract_property_refs_from_cypher(cypher)

            # Try to map aliases to labels from MATCH clauses
            alias_to_label = {}
            match_patterns = re.findall(r'\((\w+):(\w+)', cypher)
            for alias, label in match_patterns:
                alias_to_label[alias] = label

            for alias, prop in refs:
                label = alias_to_label.get(alias)
                if not label:
                    continue  # Can't resolve alias to label
                if label in schema_props:
                    known = schema_props[label]
                    fixture_props = _get_fixture_properties(fixture_data, label)
                    all_known = known | fixture_props | RUNTIME_PROPERTIES | {"$" + prop}
                    if prop not in all_known and not prop.startswith("$"):
                        issues.append(f"Tool '{tool.name}': {alias}.{prop} not in {label} schema or fixture")

        assert not issues, (
            f"Domain '{domain_id}': agent tools reference unknown properties:\n" +
            "\n".join(f"  - {i}" for i in issues)
        )

    @pytest.mark.parametrize("domain_id", _get_all_domains())
    def test_fixture_has_entities_for_all_schema_labels(self, domain_id: str):
        """Fixture should have at least one entity for each label defined in the YAML schema."""
        ontology = load_domain(domain_id)
        fixture_path = FIXTURES_DIR / f"{domain_id}.json"
        fixture_data = json.loads(fixture_path.read_text())

        fixture_labels = set(fixture_data.get("entities", {}).keys())
        schema_labels = {et.label for et in ontology.entity_types}

        missing = schema_labels - fixture_labels
        assert not missing, (
            f"Domain '{domain_id}': schema labels missing from fixtures: {missing}"
        )


class TestFixtureDataQuality:
    """Validate that fixture data has realistic values."""

    # Reasonable ranges for common numeric property names
    REASONABLE_RANGES = {
        "price_per_night": (10.0, 5000.0),
        "daily_cost": (10.0, 10000.0),
        "duration_hours": (0.1, 48.0),
        "rating": (0.0, 5.0),
        "confidence": (0.0, 1.0),
        "latitude": (-90.0, 90.0),
        "longitude": (-180.0, 180.0),
    }

    @pytest.mark.parametrize("domain_id", _get_all_domains())
    def test_numeric_values_in_reasonable_range(self, domain_id: str):
        """Numeric property values should be within domain-appropriate ranges."""
        fixture_path = FIXTURES_DIR / f"{domain_id}.json"
        fixture_data = json.loads(fixture_path.read_text())

        violations = []
        for label, items in fixture_data.get("entities", {}).items():
            for entity in items:
                for prop, value in entity.items():
                    if prop in self.REASONABLE_RANGES and isinstance(value, (int, float)):
                        lo, hi = self.REASONABLE_RANGES[prop]
                        if value < lo or value > hi:
                            violations.append(
                                f"{label}.{prop}={value} (expected {lo}-{hi}) in entity '{entity.get('name', '?')}'"
                            )

        assert not violations, (
            f"Domain '{domain_id}': unrealistic numeric values:\n" +
            "\n".join(f"  - {v}" for v in violations[:10])
        )
