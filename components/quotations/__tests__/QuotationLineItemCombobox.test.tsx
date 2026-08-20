// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { QuotationLineItemCombobox } from "../QuotationLineItemCombobox";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QuotationLineItemCombobox keyboard navigation", () => {
  it("reaches Create & Edit with ArrowDown and commits it with Enter", () => {
    const onCreateAndEdit = vi.fn();

    render(
      createElement(
        QuotationLineItemCombobox,
        {
          ariaLabel: "Item 1",
          value: "New product",
          placeholder: "Item",
          items: [
            {
              id: "catalog-1",
              name: "Existing product",
              code: "PROD-1",
            },
          ],
          createLabel: (value: string) =>
            `Create "${value}"`,
          createAndEditLabel: (value: string) =>
            `Create & Edit "${value}"`,
          onValueChange: vi.fn(),
          onSelectItem: vi.fn(),
          onCreateCustom: vi.fn(),
          onCreateAndEdit,
        },
      ),
    );

    const input = screen.getByRole(
      "combobox",
      {
        name: "Item 1",
      },
    );

    fireEvent.focus(input);

    fireEvent.keyDown(input, {
      key: "ArrowDown",
    });

    fireEvent.keyDown(input, {
      key: "ArrowDown",
    });

    fireEvent.keyDown(input, {
      key: "Enter",
    });

    expect(
      onCreateAndEdit,
    ).toHaveBeenCalledTimes(1);

    expect(
      onCreateAndEdit,
    ).toHaveBeenCalledWith(
      "New product",
    );
  });
});
