# Visual Database Schema (ERD) Design

## Overview
A new sub-tab in the BOBA DBMS panel that provides an interactive, visual representation of the database schema (Entity-Relationship Diagram). Designed for performance and visual clarity on large databases by minimizing line clutter and separating layout storage from the main encrypted vault.

## Goals & Constraints
- Render tables and their columns efficiently.
- Highlight relationships (Foreign Keys) without cluttering the screen.
- Persist custom table positions across sessions without bloating the main `VaultData`.
- Seamlessly integrate with the existing `DbmsTab.vue` architecture.

## Architecture & Data Flow

### 1. Data Retrieval
- **Schema Data:** Uses the existing `dbmsStore.schemaOverview` which already fetches tables and columns.
- **Relations Data:** A new or existing backend Tauri command (e.g., `get_foreign_keys`) will be called asynchronously to fetch foreign key definitions for the current database.

### 2. Layout Persistence
- **Storage Strategy:** Layout coordinates (X, Y) are stored in individual JSON files per database connection, completely separate from the encrypted `VaultData`.
- **Location:** Managed via Tauri's `fs` and `path` plugins, ideally saved in a directory like `<APP_DATA>/.boba/erd-layouts/erd_layout_<db_id>.json`.
- **Format:** 
  ```json
  {
    "tables": {
      "users": { "x": 100, "y": 200 },
      "orders": { "x": 400, "y": 200 }
    }
  }
  ```
- **Updates:** A debounced mechanism (e.g., 500ms after a drag ends) updates the local JSON file.

### 3. Rendering Approach (`ErdCanvas.vue`)
- **Hybrid DOM & SVG:**
  - **Tables:** HTML `<div>` elements absolutely positioned over the canvas area. This allows for rich text rendering, easy scrolling within the table if columns are long, and native drag-and-drop interactions.
  - **Connections (Edges):** An `<svg>` layer sitting directly behind the HTML tables used solely for drawing `<path>` or `<line>` elements representing foreign keys.
- **Pan & Zoom:** The entire canvas container will use CSS `transform: scale(z) translate(x, y)` to handle infinite panning and zooming efficiently without re-rendering the DOM nodes.

### 4. Interaction Design
- **Default State:** All tables are rendered at their saved (or auto-calculated default) coordinates. To prevent visual chaos ("spaghetti lines"), **all relationship lines are hidden by default**.
- **Focused State:** When a user clicks on a table:
  - The clicked table is highlighted.
  - Relationship lines connecting to/from that specific table become visible.
  - Unrelated tables decrease in opacity (dimmed) to focus the user's attention on the current relations.
- **Dragging:** Dragging a table updates its reactive X, Y coordinates, which instantly updates the SVG lines and triggers the debounced save to the layout JSON.

## Unknowns & Edge Cases
- **Initial Auto-Layout:** If a layout file doesn't exist, we need a simple grid-based placement logic to prevent tables from spawning on top of each other at `(0,0)`.
- **Schema Changes:** If a table is dropped from the DB, the layout JSON might retain its coordinates. This is benign but should be ignored during rendering. If a new table is added, it should be appended to the next available empty space in the grid.
- **Tauri FS Permissions:** Ensure the app has the correct Tauri FS scopes to read/write to the `.boba/erd-layouts/` directory in the `AppLocalData` path.

## Dependencies
- Existing `dbmsStore` and Tauri DB commands.
- VueUse (for `useDraggable`, `useMouse`, or custom drag implementation).
- No heavy third-party ERD libraries (e.g., GoJS, jsPlumb) to keep the app bundle small and fully styled with Tailwind CSS.