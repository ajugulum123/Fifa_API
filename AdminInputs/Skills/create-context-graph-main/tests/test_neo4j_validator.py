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

"""Unit tests for neo4j_validator with mocked driver."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


from create_context_graph.neo4j_validator import validate_connection


class TestValidateConnection:
    @patch("create_context_graph.neo4j_validator.GraphDatabase")
    def test_successful_connection(self, mock_gdb):
        mock_driver = MagicMock()
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.single.return_value = {"n": 1}
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = MagicMock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = MagicMock(return_value=False)
        mock_gdb.driver.return_value = mock_driver

        success, message = validate_connection(
            "neo4j://localhost:7687", "neo4j", "password"
        )

        assert success is True
        assert "Connected successfully" in message
        mock_driver.verify_connectivity.assert_called_once()

    @patch("create_context_graph.neo4j_validator.GraphDatabase")
    def test_auth_error(self, mock_gdb):
        from neo4j.exceptions import AuthError

        mock_driver = MagicMock()
        mock_driver.verify_connectivity.side_effect = AuthError("Bad creds")
        mock_gdb.driver.return_value = mock_driver

        success, message = validate_connection(
            "neo4j://localhost:7687", "neo4j", "wrongpass"
        )

        assert success is False
        assert "Authentication failed" in message

    @patch("create_context_graph.neo4j_validator.GraphDatabase")
    def test_service_unavailable(self, mock_gdb):
        from neo4j.exceptions import ServiceUnavailable

        mock_driver = MagicMock()
        mock_driver.verify_connectivity.side_effect = ServiceUnavailable("No server")
        mock_gdb.driver.return_value = mock_driver

        success, message = validate_connection(
            "neo4j://badhost:7687", "neo4j", "password"
        )

        assert success is False
        assert "Cannot connect" in message

    @patch("create_context_graph.neo4j_validator.GraphDatabase")
    def test_generic_error(self, mock_gdb):
        mock_gdb.driver.side_effect = RuntimeError("Something broke")

        success, message = validate_connection(
            "neo4j://localhost:7687", "neo4j", "password"
        )

        assert success is False
        assert "Connection error" in message
