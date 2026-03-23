

## Plan: Update Fred William's Role

**User**: Fred William (agencialigabr@gmail.com) — ID: `45d55019-6d49-4593-9441-7eec800d01d9`

**Current role**: ADMIN
**Desired role**: EXPEDIENTE

### Steps

1. **Remove ADMIN role** — Delete the record from `user_roles` where `user_id = '45d55019-...'` and `role = 'ADMIN'`
2. **Add EXPEDIENTE role** — Insert a new record into `user_roles` with `user_id = '45d55019-...'` and `role = 'EXPEDIENTE'`

### Technical Details

Two SQL operations via the database insert tool:
```sql
DELETE FROM user_roles WHERE user_id = '45d55019-6d49-4593-9441-7eec800d01d9' AND role = 'ADMIN';
INSERT INTO user_roles (user_id, role) VALUES ('45d55019-6d49-4593-9441-7eec800d01d9', 'EXPEDIENTE');
```

Also need to verify the user has at least one sector assigned (required by system constraints). If not, a sector assignment will be added.

