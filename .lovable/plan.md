

## Problem

When a beneficiary has services, the system creates contracts in the beneficiary's name. This is wrong because:
1. Beneficiaries can be minors
2. Contracts must always be in the titular's name
3. Beneficiary services should be added to the titular's open contract group, or a new group should be created on the titular's profile

## Current Behavior

- `ContactDetail.tsx` renders `ContractGroupsSection` for both titular and beneficiary contacts independently (lines 1188-1213)
- When creating a contract group from a beneficiary's page, it creates a standalone contract linked to the beneficiary's leads/opportunities
- There is no cross-linking to the titular's contract groups

## Plan

### 1. Redirect beneficiary contract group creation to the titular

**File: `src/components/crm/ContractGroupsSection.tsx`**

- Add new optional props: `isBeneficiary: boolean`, `titularContactId: string | null`
- When `isBeneficiary` is true and user tries to create a contract group or add services:
  - Fetch the titular's existing draft contracts (via titular's leads -> contract_leads -> contracts with status `EM_ELABORACAO`)
  - If an open draft exists on the titular, add the beneficiary's selected leads to that draft
  - If no open draft exists, create a new contract under the titular (using titular's first opportunity as `opportunity_id`) and link the beneficiary's leads to it
  - Show a toast indicating the service was added to the titular's contract
- Hide "Concluir" (finalize) button on beneficiary's view since finalization should happen from the titular's page

### 2. Pass titular info from ContactDetail to ContractGroupsSection

**File: `src/pages/crm/ContactDetail.tsx`**

- For beneficiary contacts (line 1204-1213), pass additional props:
  - `isBeneficiary={true}`
  - `titularContactId={contactTitular?.contact_id}`
  - `titularContactName={contactTitular?.full_name}`

### 3. Fetch titular's contract groups in ContractGroupsSection when beneficiary

**File: `src/components/crm/ContractGroupsSection.tsx`**

- When `isBeneficiary` is true, add a query to fetch the titular's leads and their contract_leads
- In `handleCreateContractGroup`:
  - Look for titular's draft contracts first
  - If found, use `handleAddToContract` logic to add beneficiary leads to that draft
  - If not found, create a new contract using a titular lead's opportunity as the `opportunity_id`, then link both titular and beneficiary leads
- Display a note on the beneficiary's page indicating contracts are managed via the titular

### 4. Show beneficiary services on the titular's ContractGroupsSection

**File: `src/pages/crm/ContactDetail.tsx`**

- For titular contacts (line 1188-1200), enhance `allServiceLeads` to also include leads from all beneficiaries
- Fetch beneficiary leads and merge them into `contactLeads` passed to `ContractGroupsSection`
- Mark beneficiary leads with a visual indicator (e.g., small badge with beneficiary name)

### Technical Details

- The `contract_leads` junction table already supports linking any lead to any contract, so beneficiary leads can be linked to titular's contracts without schema changes
- The `opportunity_id` on the contract table must reference a valid opportunity; we'll use the titular's first available opportunity
- No database migration needed -- this is purely frontend logic

