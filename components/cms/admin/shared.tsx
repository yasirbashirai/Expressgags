"use client";

/**
 * Shared bits for the CMS admin screens: types, upload helper, media preview URL and status badges.
 */
import { API_URL, ApiError, api } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";

export const staffMediaUrl = (id: string) => `${API_URL}/v1/admin/cms/media/${id}`;

/** Multipart upload to a CMS admin endpoint. Returns the parsed JSON body. */
export async function uploadTo<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return api<T>(path, { method: "POST", body: form });
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverUploadId: string | null;
  category: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  language: "en" | "es";
  authorLabel: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Testimonial = {
  id: string;
  quote: string;
  attribution: string;
  permissionGranted: boolean;
  permissionNote: string | null;
  rating: number | null;
  published: boolean;
  sourceSurveyId: string | null;
  sortOrder: number;
  createdAt: string;
};

export type GalleryItem = { id: string; uploadId: string; caption: string; alt: string; category: string | null; published: boolean; sortOrder: number; createdAt: string };

export type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  uploadId: string | null;
  published: boolean;
  sortOrder: number;
  file: { id: string; originalName: string; sizeBytes: number; mimeType: string; isPublic: boolean } | null;
};

export type HistoryRow = {
  id: string;
  year: string;
  title: string;
  genericTitle: string;
  contractingCustomer: string | null;
  endClient: string | null;
  projectType: string | null;
  locations: string[];
  operationalNotes: string | null;
  evidenceLevel: "contracting-customer" | "end-client-project" | "company-recollection" | "operating-environment";
  visibility: "HIDDEN" | "GENERIC" | "NAMED";
  genericSummary: string | null;
  sortOrder: number;
  permissionGranted: boolean;
  permissionNote: string;
  grantedAt: string | null;
};

/** Post status incl. "scheduled" (published with a future date). */
export function postState(p: Pick<Post, "status" | "publishedAt">) {
  if (p.status === "PUBLISHED" && p.publishedAt && new Date(p.publishedAt) > new Date()) return "SCHEDULED" as const;
  return p.status;
}

const STATE_STYLE: Record<string, string> = {
  DRAFT: "bg-cloud text-muted ring-line",
  PUBLISHED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  SCHEDULED: "bg-sky-50 text-sky-800 ring-sky-200",
  ARCHIVED: "bg-rose-50 text-rose-800 ring-rose-200",
  HIDDEN: "bg-cloud text-muted ring-line",
  GENERIC: "bg-navy-50 text-navy ring-navy-100",
  NAMED: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function StateBadge({ state, label }: { state: string; label?: string }) {
  return <Badge className={STATE_STYLE[state] ?? STATE_STYLE.DRAFT}>{label ?? state.charAt(0) + state.slice(1).toLowerCase()}</Badge>;
}

export const EVIDENCE_LABEL: Record<HistoryRow["evidenceLevel"], string> = {
  "contracting-customer": "Contracting customer (payer)",
  "end-client-project": "End-client / project (named in invoice)",
  "company-recollection": "Company recollection (not yet in records)",
  "operating-environment": "Operating environment",
};

export const GALLERY_CATEGORIES = ["fleet", "team-in-action", "port", "airport", "hotel", "event", "storage", "other"] as const;
