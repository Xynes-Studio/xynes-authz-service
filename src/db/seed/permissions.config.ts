/**
 * AUTHZ-RBAC-2: CMS & Docs Permissions Configuration
 *
 * This file defines all permissions and role mappings for the authz service.
 * It is the single source of truth for what each workspace role can do.
 *
 * Permission key format: {service}.{resource}.{action}
 * Examples: docs.document.create, cms.content_entry.publish
 */

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHZ_PERMISSIONS = [
  // ───────────────────────────────────────────────────────────────────────────
  // Workspaces (global)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "accounts.workspaces.create", description: "Create workspaces" },
  {
    key: "accounts.workspaces.listForUser",
    description: "List workspaces for user",
  },
  {
    key: "accounts.workspace_members.listForWorkspace",
    description: "List workspace members",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Workspace Invites
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "accounts.invites.create",
    description: "Create workspace invites",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Documents (Docs Service)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "docs.document.create", description: "Create documents" },
  { key: "docs.document.read", description: "Read documents" },
  { key: "docs.document.update", description: "Update documents" },
  {
    key: "docs.document.listByWorkspace",
    description: "List documents by workspace",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Blog Entries (Legacy)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "cms.blog_entry.create", description: "Create blog entries" },
  { key: "cms.blog_entry.read", description: "Read blog entries" },
  {
    key: "cms.blog_entry.listPublished",
    description: "List published blog entries",
  },
  {
    key: "cms.blog_entry.getPublishedBySlug",
    description: "Get published blog entry by slug",
  },
  { key: "cms.blog_entry.listAdmin", description: "List blog entries (admin)" },
  {
    key: "cms.blog_entry.updateMeta",
    description: "Update blog entry metadata",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Content Types (AUTHZ-RBAC-2)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "cms.content_type.manage",
    description: "Manage content types (create, update, delete)",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Content Entries (AUTHZ-RBAC-2)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "cms.content_entry.create",
    description: "Create content entries",
  },
  {
    key: "cms.content_entry.update",
    description: "Update content entries",
  },
  {
    key: "cms.content_entry.publish",
    description: "Publish content entries",
  },
  {
    key: "cms.content_entry.listPublished",
    description: "List published content entries",
  },
  {
    key: "cms.content_entry.getPublishedBySlug",
    description: "Get published content entry by slug",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Generic Content (Legacy)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "cms.content.create", description: "Create content" },
  { key: "cms.content.listPublished", description: "List published content" },
  {
    key: "cms.content.getPublishedBySlug",
    description: "Get published content by slug",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Templates / Content Types (Legacy)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "cms.templates.listGlobal", description: "List global templates" },
  {
    key: "cms.content_types.listForWorkspace",
    description: "List content types for workspace",
  },
  {
    key: "cms.content_directories.listForWorkspace",
    description: "List content directories for workspace",
  },
  {
    key: "cms.content_directories.create",
    description: "Create content directories",
  },
  {
    key: "cms.content_directories.update",
    description: "Update content directories",
  },
  {
    key: "cms.content_directories.delete",
    description: "Delete content directories",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Entry Authoring (Directory-First)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "cms.entry.create",
    description: "Create directory-first CMS entries",
  },
  {
    key: "cms.entry.update",
    description: "Update directory-first CMS entries",
  },
  {
    key: "cms.entry.delete",
    description: "Delete directory-first CMS entries",
  },
  {
    key: "cms.entry.publish",
    description: "Publish directory-first CMS entries",
  },
  {
    key: "cms.entry.status.set",
    description: "Set lifecycle status for directory-first CMS entries",
  },
  {
    key: "cms.entry.listByDirectory",
    description: "List CMS entries by directory for authoring",
  },
  { key: "cms.entry.getById", description: "Read CMS entry by ID" },
  {
    key: "cms.entry.collaborators.set",
    description: "Set CMS entry collaborators",
  },
  {
    key: "cms.entry.favorite.toggle",
    description: "Toggle favorite state for a CMS entry",
  },
  {
    key: "cms.entry.favorite.list",
    description: "List favorited CMS entries for current actor",
  },
  {
    key: "cms.entry.share.generateInternalLink",
    description: "Generate internal share link for CMS entry",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CMS Comments (AUTHZ-RBAC-2)
  // ───────────────────────────────────────────────────────────────────────────
  { key: "cms.comments.create", description: "Create comments" },
  { key: "cms.comments.listForEntry", description: "List comments for entry" },
  {
    key: "cms.comments.moderate",
    description: "Moderate comments (approve, reject, delete)",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Telemetry (TELE-VIEW-1)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "telemetry.events.view",
    description: "View telemetry events and stats for workspace",
  },
  {
    key: "telemetry.events.listRecentForWorkspace",
    description: "List recent telemetry events for workspace",
  },
  {
    key: "telemetry.stats.summaryByRoute",
    description: "Read telemetry route summary statistics for workspace",
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Workspace Admin Integrations (Platform)
  //
  // Source of truth:
  //   - xynes/xynes-infra/infra/architecture/epics/workspace-admin-integrations.md
  //   - xynes/xynes-infra/docs/plans/2026-04-24-workspace-admin-integrations-backend-foundation.md
  //
  // Owned by the Auth dashboard (Workspace Admin). CMS consumes these
  // primitives contextually; it must not receive API key lifecycle writes.
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "platform.domains.list",
    description: "List workspace verified domains",
  },
  {
    key: "platform.domains.create",
    description: "Add a workspace verified domain (pending verification)",
  },
  {
    key: "platform.domains.verify",
    description: "Trigger DNS verification for a workspace domain",
  },
  {
    key: "platform.domains.delete",
    description: "Disable a workspace verified domain",
  },
  {
    key: "platform.domain_bindings.manage",
    description: "Manage workspace domain bindings for apps (CMS, etc.)",
  },
  {
    key: "platform.api_keys.list",
    description: "List workspace global API keys (metadata only, no secrets)",
  },
  {
    key: "platform.api_keys.create",
    description: "Create a workspace global API key (raw key shown once)",
  },
  {
    key: "platform.api_keys.revoke",
    description: "Revoke a workspace global API key",
  },
  {
    key: "platform.api_keys.usage.read",
    description: "Read workspace global API key usage telemetry",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionKey = (typeof AUTHZ_PERMISSIONS)[number]["key"];

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHZ_ROLES = [
  // ───────────────────────────────────────────────────────────────────────────
  // workspace_owner: Full access to all CMS & Docs features
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "workspace_owner",
    description: "Workspace Owner with full access",
    permissions: AUTHZ_PERMISSIONS.map((p) => p.key),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // workspace_member: Basic contributor role (authoring without admin/publish)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "workspace_member",
    description: "Workspace Member (basic contributor)",
    permissions: [
      "accounts.workspaces.listForUser",
      "accounts.workspace_members.listForWorkspace",

      // Docs: read only
      "docs.document.read",

      // CMS dashboard read primitives
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",
      "cms.content_directories.listForWorkspace",

      // CMS Entry Authoring (Directory-First): draft authoring allowed
      "cms.entry.create",
      "cms.entry.update",
      "cms.entry.listByDirectory",
      "cms.entry.getById",
      "cms.entry.favorite.toggle",
      "cms.entry.favorite.list",
      "cms.entry.share.generateInternalLink",
    ] as PermissionKey[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // content_editor: All docs & CMS permissions + comments moderation
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "content_editor",
    description: "Content Editor",
    permissions: [
      // Documents
      "docs.document.create",
      "docs.document.read",
      "docs.document.update",
      "docs.document.listByWorkspace",

      // CMS Content Types (AUTHZ-RBAC-2: included per default)
      "cms.content_type.manage",

      // CMS Content Entries (AUTHZ-RBAC-2)
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",

      // CMS Blog (Legacy)
      "cms.blog_entry.create",
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.blog_entry.listAdmin",
      "cms.blog_entry.updateMeta",

      // CMS Generic Content (Legacy)
      "cms.content.create",
      "cms.content.listPublished",
      "cms.content.getPublishedBySlug",

      // CMS Templates / Content Types (Legacy)
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",
      "cms.content_directories.listForWorkspace",

      // CMS Entry Authoring (Directory-First)
      "cms.entry.create",
      "cms.entry.update",
      "cms.entry.delete",
      "cms.entry.publish",
      "cms.entry.status.set",
      "cms.entry.listByDirectory",
      "cms.entry.getById",
      "cms.entry.collaborators.set",
      "cms.entry.favorite.toggle",
      "cms.entry.favorite.list",
      "cms.entry.share.generateInternalLink",

      // CMS Comments (AUTHZ-RBAC-2: moderate included)
      "cms.comments.create",
      "cms.comments.listForEntry",
      "cms.comments.moderate",

      // Workspaces (global)
      "accounts.workspaces.create",
      "accounts.workspaces.listForUser",
      "accounts.workspace_members.listForWorkspace",
    ] as PermissionKey[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // read_only: Only read/list published content - NO create/update/publish/moderate
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "read_only",
    description: "Read Only User",
    permissions: [
      // Docs: read only
      "docs.document.read",

      // CMS Content Entries (AUTHZ-RBAC-2): only list published
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",

      // CMS Blog (Legacy): read-style only
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.comments.listForEntry",

      // CMS Generic Content: read-style only
      "docs.document.listByWorkspace",
      "cms.content.listPublished",
      "cms.content.getPublishedBySlug",
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",
      "cms.content_directories.listForWorkspace",

      // CMS Entry Authoring (Directory-First): read-style only
      "cms.entry.listByDirectory",
      "cms.entry.getById",
      "cms.entry.favorite.list",

      // Workspaces (global)
      "accounts.workspaces.listForUser",
      "accounts.workspace_members.listForWorkspace",
    ] as PermissionKey[],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // super_admin: All permissions (system administrator)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "super_admin",
    description: "Super Admin with all permissions",
    permissions: AUTHZ_PERMISSIONS.map((p) => p.key),
  },
] as const;

export type RoleKey = (typeof AUTHZ_ROLES)[number]["key"];
