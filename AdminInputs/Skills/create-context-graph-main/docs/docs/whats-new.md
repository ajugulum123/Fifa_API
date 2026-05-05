---
sidebar_position: 3
title: "What's New"
---

# What's New

Recent additions and changes to create-context-graph and its documentation.

## v0.9.0 (Current)

### New Features

- **MCP Server Integration** -- Generated projects can include an MCP server for Claude Desktop, enabling a dual-interface architecture where both the web app and Claude Desktop query the same knowledge graph. See [Connect Claude Desktop](/docs/how-to/connect-claude-desktop).
- **Chat History Import** -- Import your Claude AI or ChatGPT conversation exports into a context graph. Supports date/title filtering, deep mode for tool call decision traces, and streaming parsing for large exports (1GB+). See [Import Chat History](/docs/tutorials/import-chat-history).
- **12 SaaS Connectors** -- Added Claude Code, Claude AI, ChatGPT, and Google Workspace connectors alongside the existing GitHub, Notion, Jira, Slack, Gmail, Google Calendar, Salesforce, and Linear connectors. See [Import SaaS Data](/docs/how-to/import-saas-data).
- **22 Built-in Domains** -- Complete ontology catalog with pre-generated fixture data, domain-specific agent tools, and demo scenarios for every domain. See [Domain Catalog](/docs/reference/domain-catalog).
- **8 Agent Frameworks** -- PydanticAI, Claude Agent SDK, OpenAI Agents SDK, LangGraph, Anthropic Tools, Strands, CrewAI, and Google ADK. See [Framework Comparison](/docs/reference/framework-comparison).
- **Custom Domain Generation** -- Generate complete domain ontology YAMLs from natural language descriptions using LLM. See [Add Custom Domain](/docs/how-to/add-custom-domain).
- **Streaming Chat via SSE** -- Token-by-token text streaming with real-time tool call visualization across 6 frameworks.
- **neo4j-agent-memory Integration** -- Multi-turn conversation memory with automatic entity extraction and preference detection.

### New Documentation Pages

- [Connect Claude Desktop](/docs/how-to/connect-claude-desktop) -- MCP server setup and dual-interface architecture
- [Customizing Your Domain Ontology](/docs/tutorials/customizing-domain-ontology) -- Tutorial for modifying and creating domain ontologies
- [Import Your AI Chat History](/docs/tutorials/import-chat-history) -- Claude AI and ChatGPT import tutorial
- [Chat Import Schema](/docs/reference/chat-import-schema) -- Graph schema reference for chat history imports

### Documentation Improvements

- Full-text search across all documentation pages
- Version banner indicating current documentation version
- Troubleshooting sections added to every tutorial and how-to guide
- Time and difficulty estimates on all tutorials
- Mermaid diagrams for visual explanations
- Expanded cross-linking and "Further Reading" sections throughout
