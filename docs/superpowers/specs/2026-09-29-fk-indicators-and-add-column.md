# Design Spec: FK Indicators and Add Column Feature

## 1. Foreign Key Indicators
**Goal**: Show bi-directional relation indicators directly inside the Structure table view without adding new table cells.

- **Data Fetch**: Call `dbmsGetForeignKeys(activeDb)` whenever the active database changes, store the result in `DbmsTab.vue` state (or fetch per-table upon `loadSchemaOverview`).
- **UI Element**: Display inline badges next to the column name in the Structure table:
  - **Source (Outgoing) FK**: If the column is an FK pointing *out*, show an icon (e.g. `lucide:arrow-right-to-line` or `lucide:link-out`). Tooltip: `Berelasi ke: target_table.target_column`.
  - **Target (Incoming) FK**: If the column is referenced by another table, show an icon (e.g. `lucide:arrow-left-to-line` or `lucide:link-in`). Tooltip: `Direferensikan oleh: source_table.source_column`.

## 2. Add Column Feature
**Goal**: Allow users to append new columns to the existing table from the Structure view.

- **Location**: Add a "Tambah Kolom" (Add Column) button at the top of the Structure view container or inside the action bar when viewing table structure.
- **Modal Component**:
  - Field: `Column Name` (text).
  - Field: `Data Type` (select + manual input or simple text field with datalist of common types: VARCHAR(255), INT, TEXT, BOOLEAN, DATETIME).
  - Field: `Nullable` (checkbox).
  - Field: `Default Value` (text, optional).
- **Execution**:
  - Generate SQL: `ALTER TABLE {table} ADD COLUMN {col_name} {type} {NOT NULL} {DEFAULT '...'}`
  - Execute via `dbmsExecuteQuery`.
  - On success, close modal and trigger `loadSchemaOverview()` to refresh the structure UI.