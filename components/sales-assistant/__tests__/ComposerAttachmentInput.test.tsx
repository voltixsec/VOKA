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
    expect(screen.getByRole("alert")).toHaveTextContent("Only PDF, PNG, JPG, WebP, XLSX, and DXF files are supported.");
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

  // Phase 2A-7: a drawing is an attachable source artifact, so the composer
  // hands it to the same governed inspection pipeline. A DWG is not: the
  // composer accepts the .dxf extension, and the byte gate rejects a DWG that
  // was renamed, so a user gets a truthful answer instead of a broken upload.
  it("accepts a dropped .dxf drawing", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const file = new File(["0\nSECTION"], "site.dxf", { type: "image/vnd.dxf" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [file] } });
    expect(onAttachment).toHaveBeenCalledWith(file);
  });

  it("accepts a .dxf drawing the browser reported with a generic type", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const file = new File(["0\nSECTION"], "site.dxf", { type: "application/octet-stream" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [file] } });
    expect(onAttachment).toHaveBeenCalledWith(file);
  });

  it("still rejects a .dwg file at the composer", () => {
    const onAttachment = vi.fn();
    render(<Composer isArabic={false} value="" inputRef={{ current: null }} attachment={null} primaryActionLabel="Send" hasText={false} isListening={false} disabled={false} voiceUnavailable={false} onChange={vi.fn()} onKeyDown={vi.fn()} onPrimaryAction={vi.fn()} onAttachment={onAttachment} onRemoveAttachment={vi.fn()} />);
    const file = new File(["AC1027"], "site.dwg", { type: "application/octet-stream" });
    fireEvent.drop(screen.getByTestId("commercial-composer-input"), { dataTransfer: { files: [file] } });
    expect(onAttachment).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Only PDF, PNG, JPG, WebP, XLSX, and DXF files are supported.");
  });
});
