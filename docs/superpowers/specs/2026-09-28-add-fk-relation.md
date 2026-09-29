# Create Foreign Key Relation Design

## Overview
Adds a feature to visually create Foreign Key (FK) constraints directly from the "Structure" view in the DBMS Tab.

## Architecture
- **Location**: `DbmsTab.vue` inside the `activeViewTab === 'structure'` table.
- **SQLite Constraint**: The feature will be disabled for SQLite because it does not support `ALTER TABLE ADD CONSTRAINT` directly.

## Components
1. **Structure Table Update**:
   - Add a new "Aksi" (Actions) header.
   - Add an action button with a link (🔗) icon for each column.
   - Disable the button with a clear tooltip if the active database engine is `sqlite`.

2. **Add FK Modal**:
   - **Source Table & Column**: Read-only, based on the column clicked.
   - **Target Table**: Select dropdown populated from `schemaOverview.tables`.
   - **Target Column**: Select dropdown populated based on the chosen Target Table.
   - **On Delete / On Update**: Select dropdowns with values: `CASCADE`, `RESTRICT`, `SET NULL`, `NO ACTION`.
   - **Help Text**: Include clear UI explanations for the actions:
     - *CASCADE*: Automatically delete/update child rows.
     - *SET NULL*: Set child column to NULL.
     - *RESTRICT / NO ACTION*: Block parent deletion/update if children exist.

3. **Execution Flow**:
   - Construct the SQL: `ALTER TABLE {src_table} ADD CONSTRAINT fk_{col} FOREIGN KEY ({src_col}) REFERENCES {tgt_table}({tgt_col}) ON DELETE {action} ON UPDATE {action};`
   - Execute via `tauriBridge.dbmsExecuteQuery`.
   - On success, reload schema overview and close the modal.