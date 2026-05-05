---
sidebar_position: 5
title: Domain Catalog
---

# Domain Catalog

create-context-graph ships with **22 built-in domains**. Each domain includes a complete ontology with entity types, relationships, agent tools, demo scenarios, and pre-generated fixture data.

## All Domains

| Domain | Name | Entity Types | Agent Tools |
|--------|------|-------------|-------------|
| `agent-memory` | 🧠 Agent Memory | 11 | 7 |
| `conservation` | 🌿 Conservation | 11 | 8 |
| `data-journalism` | 📰 Data Journalism | 11 | 8 |
| `digital-twin` | 🏭 Digital Twin | 11 | 8 |
| `financial-services` | 💰 Financial Services | 10 | 7 |
| `gaming` | 🎮 Gaming | 11 | 9 |
| `genai-llm-ops` | 🤖 GenAI & LLM Ops | 11 | 8 |
| `gis-cartography` | 🗺 GIS & Cartography | 11 | 8 |
| `golf-sports` | ⛳ Golf Sports | 11 | 8 |
| `healthcare` | 🏥 Healthcare | 12 | 6 |
| `hospitality` | 🏨 Hospitality | 11 | 8 |
| `manufacturing` | 🏭 Manufacturing | 11 | 7 |
| `oil-gas` | 🛢️ Oil & Gas | 10 | 6 |
| `personal-knowledge` | 📝 Personal Knowledge | 10 | 8 |
| `product-management` | 📋 Product Management | 12 | 7 |
| `real-estate` | 🏠 Real Estate | 10 | 8 |
| `retail-ecommerce` | 🛒 Retail & E-Commerce | 11 | 6 |
| `scientific-research` | 🔬 Scientific Research | 11 | 6 |
| `software-engineering` | 💻 Software Engineering | 11 | 7 |
| `trip-planning` | 🌍 Trip Planning | 10 | 7 |
| `vacation-industry` | 🏖 Vacation Industry | 10 | 6 |
| `wildlife-management` | 🐻 Wildlife Management | 11 | 6 |

## Domain Details

### 🧠 Agent Memory

**ID:** `agent-memory` | **Tagline:** AI-powered Agent Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Agent`, `Conversation`, `Entity`, `Memory`, `ToolCall`, `Session`

**Sample question:** "What does agent Alpha remember about the user's project preferences?"

```bash
uvx create-context-graph --domain agent-memory --framework pydanticai --demo
```

---

### 🌿 Conservation

**ID:** `conservation` | **Tagline:** AI-powered Conservation Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Site`, `Species`, `Program`, `Funding`, `Stakeholder`, `Monitoring`

**Sample question:** "Show me all endangered species and the sites where they are protected"

```bash
uvx create-context-graph --domain conservation --framework pydanticai --demo
```

---

### 📰 Data Journalism

**ID:** `data-journalism` | **Tagline:** AI-powered Investigative Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Source`, `Story`, `Dataset`, `Claim`, `Correction`, `Investigation`

**Sample question:** "Show me all active investigations and their current status"

```bash
uvx create-context-graph --domain data-journalism --framework pydanticai --demo
```

---

### 🏭 Digital Twin

**ID:** `digital-twin` | **Tagline:** AI-powered Digital Twin Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Asset`, `Sensor`, `Reading`, `Alert`, `MaintenanceRecord`, `System`

**Sample question:** "Show me all assets currently in degraded status"

```bash
uvx create-context-graph --domain digital-twin --framework pydanticai --demo
```

---

### 💰 Financial Services

**ID:** `financial-services` | **Tagline:** AI-powered Financial Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Account`, `Transaction`, `Decision`, `Policy`, `Security`

**Sample question:** "Show me a summary of all client accounts and their current balances"

```bash
uvx create-context-graph --domain financial-services --framework pydanticai --demo
```

---

### 🎮 Gaming

**ID:** `gaming` | **Tagline:** AI-powered Game Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Player`, `Character`, `Item`, `Quest`, `Guild`, `Achievement`

**Sample question:** "Show me the most active players in the NA region by play time"

```bash
uvx create-context-graph --domain gaming --framework pydanticai --demo
```

---

### 🤖 GenAI & LLM Ops

**ID:** `genai-llm-ops` | **Tagline:** AI-powered ML Operations Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Model`, `Experiment`, `Dataset`, `Prompt`, `Evaluation`, `Deployment`

**Sample question:** "Show me all models currently in production and their evaluation scores"

```bash
uvx create-context-graph --domain genai-llm-ops --framework pydanticai --demo
```

---

### 🗺 GIS & Cartography

**ID:** `gis-cartography` | **Tagline:** AI-powered Geospatial Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Feature`, `Layer`, `Survey`, `Coordinate`, `Boundary`, `MapProject`

**Sample question:** "Show me all surveys conducted in the Cedar Creek watershed"

```bash
uvx create-context-graph --domain gis-cartography --framework pydanticai --demo
```

---

### ⛳ Golf Sports

**ID:** `golf-sports` | **Tagline:** AI-powered Golf Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Course`, `Player`, `Round`, `Tournament`, `Handicap`, `Hole`

**Sample question:** "Show me all rounds played by Tiger Woods this season"

```bash
uvx create-context-graph --domain golf-sports --framework pydanticai --demo
```

---

### 🏥 Healthcare

**ID:** `healthcare` | **Tagline:** AI-powered Clinical Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Patient`, `Provider`, `Diagnosis`, `Treatment`, `Encounter`, `Facility`, `Medication`

**Sample question:** "Show me all patients with a chronic diagnosis"

```bash
uvx create-context-graph --domain healthcare --framework pydanticai --demo
```

---

### 🏨 Hospitality

**ID:** `hospitality` | **Tagline:** AI-powered Hospitality Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Hotel`, `Room`, `Reservation`, `Guest`, `Service`, `Staff`

**Sample question:** "Show me all platinum guests arriving this week"

```bash
uvx create-context-graph --domain hospitality --framework pydanticai --demo
```

---

### 🏭 Manufacturing

**ID:** `manufacturing` | **Tagline:** AI-powered Manufacturing Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Machine`, `Part`, `WorkOrder`, `Supplier`, `QualityReport`, `ProductionLine`

**Sample question:** "Show me all active work orders sorted by priority"

```bash
uvx create-context-graph --domain manufacturing --framework pydanticai --demo
```

---

### 🛢️ Oil & Gas

**ID:** `oil-gas` | **Tagline:** AI-powered Energy Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Well`, `Reservoir`, `Equipment`, `Inspection`, `Permit`, `Formation`

**Sample question:** "Show me all producing wells sorted by daily production rate"

```bash
uvx create-context-graph --domain oil-gas --framework pydanticai --demo
```

---

### 📝 Personal Knowledge

**ID:** `personal-knowledge` | **Tagline:** AI-powered Personal Knowledge Graph

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Note`, `Contact`, `Project`, `Topic`, `Bookmark`, `JournalEntry`

**Sample question:** "What notes have I written about machine learning this month?"

```bash
uvx create-context-graph --domain personal-knowledge --framework pydanticai --demo
```

---

### 📋 Product Management

**ID:** `product-management` | **Tagline:** AI-powered Product Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Feature`, `Epic`, `UserPersona`, `Metric`, `Release`, `Feedback`, `Objective`

**Sample question:** "Show me all features planned for the Q2 release"

```bash
uvx create-context-graph --domain product-management --framework pydanticai --demo
```

---

### 🏠 Real Estate

**ID:** `real-estate` | **Tagline:** AI-powered Real Estate Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Property`, `Listing`, `Agent`, `Transaction`, `Inspection`, `Neighborhood`

**Sample question:** "Find all active listings in the Downtown neighborhood under $500,000"

```bash
uvx create-context-graph --domain real-estate --framework pydanticai --demo
```

---

### 🛒 Retail & E-Commerce

**ID:** `retail-ecommerce` | **Tagline:** AI-powered Retail Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Customer`, `Product`, `Order`, `Review`, `Campaign`, `Category`

**Sample question:** "Show me the top 10 VIP customers by lifetime value"

```bash
uvx create-context-graph --domain retail-ecommerce --framework pydanticai --demo
```

---

### 🔬 Scientific Research

**ID:** `scientific-research` | **Tagline:** AI-powered Research Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Researcher`, `Paper`, `Dataset`, `Experiment`, `Grant`, `Institution`

**Sample question:** "Find the most cited papers in computational biology from the last 3 years"

```bash
uvx create-context-graph --domain scientific-research --framework pydanticai --demo
```

---

### 💻 Software Engineering

**ID:** `software-engineering` | **Tagline:** AI-powered Software Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Repository`, `Issue`, `PullRequest`, `Deployment`, `Service`, `Incident`

**Sample question:** "Show me all open pull requests across our repositories"

```bash
uvx create-context-graph --domain software-engineering --framework pydanticai --demo
```

---

### 🌍 Trip Planning

**ID:** `trip-planning` | **Tagline:** AI-powered Travel Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Destination`, `Hotel`, `Activity`, `Restaurant`, `Itinerary`, `Review`

**Sample question:** "Help me plan a 7-day trip to Japan for two people in spring"

```bash
uvx create-context-graph --domain trip-planning --framework pydanticai --demo
```

---

### 🏖 Vacation Industry

**ID:** `vacation-industry` | **Tagline:** AI-powered Vacation Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Resort`, `Booking`, `Guest`, `Activity`, `Season`, `Package`

**Sample question:** "Show me all bookings for the upcoming holiday season"

```bash
uvx create-context-graph --domain vacation-industry --framework pydanticai --demo
```

---

### 🐻 Wildlife Management

**ID:** `wildlife-management` | **Tagline:** AI-powered Conservation Intelligence

**Entity types:** `Person`, `Organization`, `Location`, `Event`, `Object`, `Species`, `Individual`, `Sighting`, `Habitat`, `Camera`, `Threat`

**Sample question:** "Show me all recent sightings of endangered species in the Serengeti habitat"

```bash
uvx create-context-graph --domain wildlife-management --framework pydanticai --demo
```

---

