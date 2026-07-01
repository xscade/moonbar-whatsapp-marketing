"use client";

import {
  Copy,
  ExternalLink,
  FileText,
  ImageIcon,
  Phone,
  Reply,
  Video
} from "lucide-react";

import type { TemplateButton, TemplateHeaderType } from "@/types/entities";
import { cn } from "@/lib/utils";

function fillVariables(text: string, samples: Record<string, string>) {
  return text.replace(/{{\s*([^{}\s]+)\s*}}/g, (_match, name: string) => {
    const value = samples[name];
    return value ? value : `{{${name}}}`;
  });
}

const mediaIcon = {
  image: ImageIcon,
  video: Video,
  document: FileText
} as const;

export type TemplatePreviewData = {
  headerType?: TemplateHeaderType;
  headerText?: string;
  headerFilename?: string;
  body?: string;
  footer?: string;
  buttons?: TemplateButton[];
  samples?: Record<string, string>;
};

export function TemplatePreview({
  data,
  className
}: {
  data: TemplatePreviewData;
  className?: string;
}) {
  const samples = data.samples ?? {};
  const isMedia =
    data.headerType === "image" ||
    data.headerType === "video" ||
    data.headerType === "document";
  const MediaIcon = isMedia ? mediaIcon[data.headerType as keyof typeof mediaIcon] : null;
  const buttons = data.buttons ?? [];

  return (
    <div
      className={cn(
        "rounded-2xl p-4",
        "bg-[#E5DDD3] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.5),transparent_60%)]",
        className
      )}
    >
      <div className="max-w-[19rem] rounded-xl rounded-tl-sm bg-white p-2.5 shadow-sm">
        {MediaIcon ? (
          <div className="mb-2 flex h-32 items-center justify-center rounded-lg bg-moon-green/10 text-moon-green/70">
            <div className="flex flex-col items-center gap-1">
              <MediaIcon className="h-8 w-8" />
              <span className="max-w-[14rem] truncate px-2 text-[11px] text-moon-ink/50">
                {data.headerFilename || `${data.headerType} header`}
              </span>
            </div>
          </div>
        ) : null}

        {data.headerType === "text" && data.headerText?.trim() ? (
          <p className="mb-1 text-sm font-semibold text-moon-ink">
            {fillVariables(data.headerText, samples)}
          </p>
        ) : null}

        <p className="whitespace-pre-line text-sm leading-relaxed text-moon-ink">
          {data.body?.trim()
            ? fillVariables(data.body, samples)
            : "Your message body will appear here."}
        </p>

        {data.footer?.trim() ? (
          <p className="mt-1.5 text-xs text-moon-ink/45">{data.footer}</p>
        ) : null}

        <div className="mt-1 text-right text-[10px] text-moon-ink/35">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {buttons.length ? (
        <div className="mt-1.5 max-w-[19rem] space-y-1">
          {buttons.map((button, index) => {
            const Icon =
              button.type === "URL"
                ? ExternalLink
                : button.type === "PHONE_NUMBER"
                  ? Phone
                  : button.type === "COPY_CODE"
                    ? Copy
                    : Reply;
            return (
              <div
                key={`${button.type}-${index}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#0a7cff] shadow-sm"
              >
                <Icon className="h-4 w-4" />
                {button.text?.trim() ||
                  (button.type === "COPY_CODE" ? "Copy code" : "Button")}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
