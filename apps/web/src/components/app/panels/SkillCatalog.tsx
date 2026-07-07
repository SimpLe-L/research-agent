import React, { useEffect, useState } from "react";
import { Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiBase, fetchJson } from "@/app/api";
import type { ExtensionCapability, ExtensionManifest, ExtensionRuntimeCatalog } from "@/app/types";
import { cn } from "@/lib/utils";

const skillPillClass = "inline-flex items-center rounded-full border border-border px-2 py-1 text-[11px] leading-none capitalize";
const skillMetaLabelClass = "text-[11px] font-bold uppercase text-muted-foreground";
const skillMetaValueClass = "m-0 [overflow-wrap:anywhere] text-[13px] text-foreground";

export function SkillCatalog({ initialExtensions }: { initialExtensions?: Array<{ id: string; name: string; status: string }> }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ExtensionRuntimeCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const extensions = catalog?.extensions ?? initialExtensions?.map(toMinimalExtensionManifest) ?? [];
  const activeCount = extensions.filter((extension) => extension.status === "active").length;
  const gatedCount = extensions.filter((extension) => extension.status === "degraded" || extension.status === "planned").length;
  const grouped = groupExtensions(extensions);

  async function refreshCatalog() {
    setLoading(true);
    try {
      const data = await fetchJson<ExtensionRuntimeCatalog>(`${apiBase}/extensions`);
      setCatalog(data);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Skills unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCatalog();
  }, []);

  useEffect(() => {
    if (open) void refreshCatalog();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="relative text-muted-foreground" data-testid="skill-catalog-button" />}
            />
          }
        >
          <Plug size={18} />
          {gatedCount > 0 && (
            <span
              className="absolute top-0.5 right-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-background bg-amber-600 px-1 text-[10px] leading-none font-bold text-white"
              data-testid="skill-gated-count"
            >
              {gatedCount}
            </span>
          )}
          <span className="sr-only">Review skills</span>
        </TooltipTrigger>
        <TooltipContent>Review skills</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-[min(500px,94vw)] max-w-[min(500px,94vw)] gap-0 p-0 max-[900px]:w-[min(380px,94vw)]" data-testid="skill-catalog-panel">
        <div className="flex min-h-18 items-center justify-between border-b px-5 py-4.5">
          <div>
            <h2 className="m-0 text-lg leading-tight font-bold">Skills</h2>
            <p className="text-[13px] text-muted-foreground">{activeCount} active, {gatedCount} gated</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => void refreshCatalog()} disabled={loading}>
            <RefreshCw size={16} />
          </Button>
        </div>
        {catalog?.safetyModel && (
          <div className="grid gap-2 border-b px-5 py-3 text-[13px] text-muted-foreground" data-testid="skill-safety-policy">
            <div className="flex flex-wrap gap-1.5">
              <span className={skillPillClass}>default {catalog.safetyModel.defaultToolPolicy.replace("_", " ")}</span>
              {catalog.safetyModel.disabledToolClasses.slice(0, 4).map((item) => (
                <span className={skillPillClass} key={item}>{item.replaceAll("_", " ")}</span>
              ))}
            </div>
          </div>
        )}
        {status && <p className="border-b px-5 py-2.5 text-[13px] text-muted-foreground" data-testid="skill-catalog-status">{status}</p>}
        <div className="grid min-h-0 gap-3 overflow-auto p-3.5" data-testid="skill-catalog-list">
          {extensions.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No skills available</div>
          ) : (
            grouped.map((group) => (
              <section className="grid gap-2" key={group.label} data-testid={`skill-group-${group.key}`}>
                <h3 className="mt-0.5 text-[11px] font-bold tracking-normal text-muted-foreground uppercase">{group.label}</h3>
                {group.extensions.map((extension) => (
                  <SkillCatalogItem extension={extension} key={extension.id} />
                ))}
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SkillCatalogItem({ extension }: { extension: ExtensionManifest }) {
  const [expanded, setExpanded] = useState(extension.status !== "active");
  return (
    <article className={cn("grid gap-2.5 rounded-lg border border-l-3 p-3", extensionStatusBorderClass(extension.status))}>
      <button className="grid cursor-pointer gap-1 text-left" type="button" onClick={() => setExpanded((value) => !value)} data-testid="skill-catalog-item">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <strong className="min-w-0 flex-1 truncate text-[14px] text-foreground">{extension.name}</strong>
          <span className={cn(skillPillClass, "text-foreground")}>{extension.kind}</span>
          <span className={cn(skillPillClass, "font-semibold text-muted-foreground")}>{extension.status}</span>
        </div>
        <span className="text-xs text-muted-foreground">{extension.id}</span>
      </button>
      <p className="m-0 text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">{extension.description}</p>
      {extension.degradedReason && (
        <p className="m-0 rounded-md bg-muted/45 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {extension.degradedReason}
        </p>
      )}
      {expanded && (
        <div className="grid gap-2.5" data-testid="skill-capability-list">
          {extension.capabilities.length === 0 ? (
            <span className="text-xs text-muted-foreground">No capabilities listed</span>
          ) : (
            extension.capabilities.map((capability) => (
              <div className="grid gap-1 border-t pt-2.5" key={capability.id} data-testid="skill-capability-item">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <strong className="min-w-0 flex-1 truncate text-[13px] text-foreground">{capability.label}</strong>
                  <span className={cn(skillPillClass, capabilityAuditMode(capability) === "read_only" ? "text-emerald-700" : "text-amber-700")}>
                    {capabilityAuditMode(capability) === "read_only" ? "read only" : "approval"}
                  </span>
                </div>
                <p className="m-0 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{capability.description}</p>
                <dl className="m-0 grid gap-1 text-xs text-muted-foreground">
                  <div className="grid gap-0.5">
                    <dt className={skillMetaLabelClass}>Capability</dt>
                    <dd className={skillMetaValueClass}>{capability.id}</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className={skillMetaLabelClass}>Permissions</dt>
                    <dd className={skillMetaValueClass}>{capability.permissions.join(", ") || "none"}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}

function toMinimalExtensionManifest(extension: { id: string; name: string; status: string }): ExtensionManifest {
  return {
    id: extension.id,
    name: extension.name,
    description: "Loading extension details.",
    kind: "skill",
    phase: "unknown",
    status: extensionStatus(extension.status),
    capabilities: []
  };
}

function extensionStatus(status: string): ExtensionManifest["status"] {
  if (status === "active" || status === "disabled" || status === "planned" || status === "degraded") return status;
  return "degraded";
}

function groupExtensions(extensions: ExtensionManifest[]) {
  const groups = [
    { key: "active", label: "Active", extensions: extensions.filter((extension) => extension.status === "active") },
    { key: "gated", label: "Readiness Gated", extensions: extensions.filter((extension) => extension.status === "degraded") },
    { key: "planned", label: "Planned", extensions: extensions.filter((extension) => extension.status === "planned" || extension.status === "disabled") }
  ];
  return groups.filter((group) => group.extensions.length > 0);
}

function capabilityAuditMode(capability: ExtensionCapability) {
  return capability.permissions.some((permission) => {
    const normalized = permission.toLowerCase();
    return normalized.includes("write") || normalized.includes("provider") || normalized.includes("audio:") || normalized.includes("transcribe") || normalized.includes("synthesize");
  }) ? "write_or_provider" : "read_only";
}

function extensionStatusBorderClass(status: ExtensionManifest["status"]) {
  if (status === "active") return "border-l-emerald-500";
  if (status === "degraded") return "border-l-amber-500";
  if (status === "planned") return "border-l-blue-500";
  return "border-l-slate-500";
}
