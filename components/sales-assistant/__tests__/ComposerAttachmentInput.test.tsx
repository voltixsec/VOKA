// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../Composer";

describe("Sales Assistant attachment intake", () => {
  it("accepts a PDF dropped onto the composer", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const file = new File(["%PDF-1.4"], "boq.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [file] } });
    expect(onAttachment).toHaveBeenCalledWith(file);
  });

  it("accepts a pasted screenshot and rejects unsupported files honestly", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const image = new File(["image"], "screenshot.webp", { type: "image/webp" });
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [image] } });
    expect(onAttachment).toHaveBeenCalledWith(image);
    const unsupported = new File(["doc"], "document.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [unsupported] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Only PDF, PNG, JPG, WebP, and XLSX files are supported.");
  });

  // Phase 2A-6: a workbook is an attachable source artifact, so the composer
  // hands it to the same governed inspection pipeline.
  it("accepts a dropped .xlsx workbook", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const file = new File(["workbook"], "boq.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [file] } });
    expect(onAttachment).toHaveBeenCalledWith(file);
  });
});
