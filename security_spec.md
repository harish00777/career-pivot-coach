# RolexIQ Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. Every workspace document at `/users/{userId}/workspaces/{workspaceId}` strictly belongs to `userId` (`ownerId == request.auth.uid == userId`).
2. Only authenticated users with verified emails (`request.auth.token.email_verified == true`) may read, create, update, or delete their own workspace.
3. Path variables (`userId`, `workspaceId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars.
4. `ownerId` and `createdAt` are immutable after creation; `createdAt` on create and `updatedAt` on update must equal `request.time`.
5. No user may read, list, or mutate another user's workspace.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read of `/users/u1/workspaces/primary` -> `PERMISSION_DENIED`
2. Unauthenticated write to `/users/u1/workspaces/primary` -> `PERMISSION_DENIED`
3. Cross-user read (`auth.uid = u2`) on `/users/u1/workspaces/primary` -> `PERMISSION_DENIED`
4. Cross-user write (`auth.uid = u2`) on `/users/u1/workspaces/primary` -> `PERMISSION_DENIED`
5. Identity spoofing on create (`auth.uid = u1`, `ownerId = u2`) -> `PERMISSION_DENIED`
6. Unverified email (`email_verified = false`) attempting write -> `PERMISSION_DENIED`
7. Client-forged `createdAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`
8. Mutating `ownerId` during update -> `PERMISSION_DENIED`
9. Mutating `createdAt` during update -> `PERMISSION_DENIED`
10. Oversized `workspaceId` (>128 chars) or invalid characters -> `PERMISSION_DENIED`
11. Shadow/unexpected top-level field (`isAdmin: true`) -> `PERMISSION_DENIED`
12. Wrong type for `version` (string instead of number/int) -> `PERMISSION_DENIED`
