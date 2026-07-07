import React from "react";
import { ActionBarPrimitive, BranchPickerPrimitive, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, type AssistantState } from "@assistant-ui/react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, MoreHorizontal, Plus, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VoiceRecorderButton } from "./VoiceRecorderButton";
import { cn } from "@/lib/utils";

function isNewChatView(state: AssistantState) {
  return state.thread.messages.length === 0 && (!state.thread.isLoading || state.threads.isLoading);
}

export function AssistantThread() {
  const isEmpty = useAuiState(isNewChatView);
  return (
    <ThreadPrimitive.Root
      className="aui-root flex min-h-0 flex-1 flex-col bg-background"
      style={
        {
          "--thread-max-width": "44rem",
          "--composer-bg": "color-mix(in oklab, var(--color-muted) 34%, var(--color-background))",
          "--composer-radius": "1.5rem",
          "--composer-padding": "8px"
        } as React.CSSProperties
      }
    >
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth px-3 pt-3 md:px-4" turnAnchor="top">
        <div className={cn("mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col gap-6 pt-3 pb-6", isEmpty && "justify-center")}>
          <AssistantEmptyState />
          <ThreadPrimitive.Messages>{() => <AssistantThreadMessage />}</ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-3 bg-background pb-5",
            !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)"
          )}
        >
          <ThreadPrimitive.ScrollToBottom className="absolute -top-11 self-center rounded-full border bg-background p-2 text-foreground shadow-sm disabled:invisible" title="Scroll to bottom">
            <ArrowDown className="size-4" />
          </ThreadPrimitive.ScrollToBottom>
          <AssistantComposer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function AssistantEmptyState() {
  const isEmpty = useAuiState(isNewChatView);
  if (!isEmpty) return null;
  return (
    <div className="mb-2 text-center" data-testid="assistant-empty-state">
      <h1 className="animate-in fade-in slide-in-from-bottom-1 text-2xl font-semibold duration-200 md:text-[30px]">
        How can I help you today?
      </h1>
    </div>
  );
}

function AssistantThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  const isRunning = useAuiState((state) => state.message.status?.type === "running");
  return (
    <MessagePrimitive.Root
      data-role={role}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-150",
        role === "user"
          ? "grid grid-cols-[minmax(72px,1fr)_auto] px-2 [&>*]:col-start-2"
          : "px-2"
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,740px)] [overflow-wrap:anywhere] text-[15px] leading-relaxed",
          role === "user"
            ? "rounded-xl bg-muted px-4 py-2 text-foreground"
            : "text-foreground"
        )}
      >
        <AssistantMessageParts />
      </div>
      {role === "assistant" && isRunning && (
        <span className="mt-2 inline-flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="thinkingGlyph grid size-4 grid-cols-4 gap-0.5" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, index) => (
              <span key={index} className="size-0.5 rounded-full bg-current opacity-40" />
            ))}
          </span>
          <span>Connecting</span>
        </span>
      )}
      <MessageActions role={role} />
    </MessagePrimitive.Root>
  );
}

function AssistantMessageParts() {
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "text" || part.type === "reasoning") return <p>{part.text}</p>;
        if (part.type === "tool-call") return <p>{`Tool: ${part.toolName}`}</p>;
        if (part.type === "source") return <p>{part.title ?? part.url ?? "Source"}</p>;
        return null;
      }}
    </MessagePrimitive.Parts>
  );
}

function MessageActions({ role }: { role: "user" | "assistant" | "system" | "tool" }) {
  if (role !== "assistant") return null;
  return (
    <div className="mt-1.5 flex min-h-7 items-center gap-1 text-muted-foreground" data-testid="assistant-message-actions">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-xs">
        <BranchPickerPrimitive.Previous className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">‹</BranchPickerPrimitive.Previous>
        <span>
          <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
        </span>
        <BranchPickerPrimitive.Next className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">›</BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <ActionBarPrimitive.Root hideWhenRunning className="inline-flex items-center gap-1">
        <ActionBarPrimitive.Copy className="group/copy inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground data-[copied=true]:text-emerald-700" title="Copy" copiedDuration={1600} data-testid="assistant-copy-action">
          <Copy className="copyDefault size-3.5 group-data-[copied=true]/copy:hidden" />
          <Check className="copyDone hidden size-3.5 group-data-[copied=true]/copy:inline-flex" />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground" title="Refresh">
          <RefreshCw className="size-3.5" />
        </ActionBarPrimitive.Reload>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground" title="More">
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <ActionBarPrimitive.ExportMarkdown asChild>
              <DropdownMenuItem>Export Markdown</DropdownMenuItem>
            </ActionBarPrimitive.ExportMarkdown>
          </DropdownMenuContent>
        </DropdownMenu>
      </ActionBarPrimitive.Root>
    </div>
  );
}

function AssistantComposer() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col" data-testid="assistant-composer">
      <div className="flex w-full flex-col gap-2 rounded-(--composer-radius) border border-border/70 bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgb(0_0_0/0.1),0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] focus-within:border-border focus-within:shadow-[0_6px_24px_-8px_rgb(0_0_0/0.14),0_1px_2px_rgb(0_0_0/0.05)]">
        <ComposerPrimitive.Input
          placeholder="Ask anything"
          rows={2}
          className="max-h-36 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex min-h-8 items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-8 rounded-full text-foreground" title="Add attachment" disabled>
            <Plus className="size-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 min-w-0 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-semibold text-foreground hover:bg-muted data-popup-open:bg-muted">
              Base Agent
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="min-w-48 p-1.5">
              <DropdownMenuItem className="justify-between rounded-lg px-2.5 py-2 font-medium">
                <span>Base Agent</span>
                <Check className="size-4" />
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between rounded-lg px-2.5 py-2 text-muted-foreground" data-disabled>
                <span>Pi Runtime</span>
                <span className="text-xs">planned</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1" />
          <VoiceRecorderButton />
          {isRunning ? (
            <ComposerPrimitive.Cancel className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" title="Stop generating">
              <Square className="size-4 fill-current" />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50" title="Send message">
              <ArrowUp className="size-4.5" />
            </ComposerPrimitive.Send>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
