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
  // workspace_member: Basic member role (minimal permissions)
  // ───────────────────────────────────────────────────────────────────────────
  {
    key: "workspace_member",
    description: "Workspace Member",
    permissions: [] as PermissionKey[],
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

      // CMS Comments (AUTHZ-RBAC-2: moderate included)
      "cms.comments.create",
      "cms.comments.listForEntry",
      "cms.comments.moderate",

      // Workspaces (global)
      "accounts.workspaces.create",
      "accounts.workspaces.listForUser",
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

      // Workspaces (global)
      "accounts.workspaces.listForUser",
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
