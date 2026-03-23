

## Plan: Add persistent "Save" button at bottom of System Settings

Currently the save button only appears at the top when changes are detected. The user wants a always-visible "Salvar Modificações" button at the bottom of the page.

### Changes

**File: `src/pages/settings/SystemSettings.tsx`**

1. Add a fixed "Salvar Modificações" button at the bottom of the page, after the KnowledgeBaseManager component
2. The button will be always visible (not conditional on `hasChanges`), but disabled when there are no changes or save is in progress
3. Uses the same `handleSave` function already in place

