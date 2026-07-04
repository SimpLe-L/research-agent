import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { findCapability, getExtensionManifest, getExtensionRuntimeStatus } from "@sp-agent/extensions";
import {
  createMemoryCandidateSchema,
  searchMemorySchema,
  type ExtensionCapability,
  type ExtensionInvocationAudit,
  type InvokeExtensionInput
} from "@sp-agent/shared";
import { MemoryService } from "./memory.service.js";

@Injectable()
export class ExtensionsService {
  constructor(@Inject(MemoryService) private readonly memoryService: MemoryService) {}

  list() {
    return getExtensionRuntimeStatus();
  }

  get(id: string) {
    const extension = getExtensionManifest(id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    return extension;
  }

  getInvocationAudit(id: string, capabilityId?: string): ExtensionInvocationAudit {
    const extension = getExtensionManifest(id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    const requestedCapabilityId = capabilityId ?? defaultCapabilityId(id);
    return buildPermissionAudit(id, requestedCapabilityId, findCapability(extension.capabilities, requestedCapabilityId));
  }

  async invoke(id: string, request: InvokeExtensionInput) {
    const extension = getExtensionManifest(id);
    if (!extension) throw new NotFoundException(`Extension ${id} not found`);
    const requestedCapabilityId = request.capabilityId ?? defaultCapabilityId(id);
    const audit = buildPermissionAudit(id, requestedCapabilityId, findCapability(extension.capabilities, requestedCapabilityId));

    if (id === "core.agent-shell" && requestedCapabilityId === "extensions.inspect") {
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "completed",
        result: this.list()
      };
    }

    if (id === "local.memory" && requestedCapabilityId === "memory.search") {
      const input = searchMemorySchema.parse(request.input);
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "completed",
        result: await this.memoryService.search(input)
      };
    }

    if (id === "local.memory" && requestedCapabilityId === "memory.write_candidate") {
      const input = createMemoryCandidateSchema.parse(request.input);
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "completed",
        result: await this.memoryService.createCandidate(input)
      };
    }

    if (id === "local.context" && requestedCapabilityId === "context.snapshot") {
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "completed",
        result: {
          now: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          runtimeProvider: process.env.AGENT_RUNTIME_PROVIDER ?? "pi",
          extensionIds: this.list().extensions.map((item) => item.id)
        }
      };
    }

    if (id === "local.speech") {
      return {
        extensionId: id,
        capabilityId: requestedCapabilityId,
        permissionAudit: audit,
        status: "degraded",
        result: null,
        degradedReason: extension.degradedReason ?? `${id} is planned but not implemented yet.`
      };
    }

    throw new BadRequestException(`Capability ${requestedCapabilityId} is not invokable for ${id}`);
  }
}

export function isReadOnlyExtensionCapability(audit: ExtensionInvocationAudit) {
  return audit.allowed && audit.mode === "read_only";
}

function defaultCapabilityId(id: string) {
  if (id === "core.agent-shell") return "extensions.inspect";
  if (id === "local.memory") return "memory.search";
  if (id === "local.context") return "context.snapshot";
  if (id === "local.speech") return "speech.transcribe";
  return "extensions.inspect";
}

function buildPermissionAudit(extensionId: string, capabilityId: string, capability?: ExtensionCapability): ExtensionInvocationAudit {
  if (!capability) {
    return {
      extensionId,
      capabilityId,
      permissions: [],
      allowed: false,
      mode: "write_or_provider",
      reason: "Capability is not registered."
    };
  }
  const permissions = capability.permissions ?? [];
  const writeOrProvider = permissions.some((permission) => {
    const normalized = permission.toLowerCase();
    return (
      normalized.includes("write") ||
      normalized.includes("provider") ||
      normalized.includes("audio:") ||
      normalized.includes("transcribe") ||
      normalized.includes("synthesize")
    );
  });
  return {
    extensionId,
    capabilityId,
    permissions,
    allowed: true,
    mode: writeOrProvider ? "write_or_provider" : "read_only",
    reason: writeOrProvider ? "Capability may create state, use provider resources, or process audio." : "Capability is read-only."
  };
}
