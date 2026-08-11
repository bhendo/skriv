import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockMessage } = vi.hoisted(() => ({
  mockMessage: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: mockMessage,
}));

import { promptUnsavedChanges } from "../../utils/unsavedChanges";

describe("promptUnsavedChanges", () => {
  beforeEach(() => {
    mockMessage.mockReset();
  });

  it("asks with Save / Don't Save / Cancel buttons", async () => {
    mockMessage.mockResolvedValue("Cancel");

    await promptUnsavedChanges();

    expect(mockMessage).toHaveBeenCalledWith(
      "Do you want to save your changes?",
      expect.objectContaining({
        buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
      })
    );
  });

  it.each([
    ["Save", "save"],
    ["Don't Save", "dont-save"],
    ["Cancel", "cancel"],
  ])("maps button label %j to %j", async (label, choice) => {
    mockMessage.mockResolvedValue(label);
    expect(await promptUnsavedChanges()).toBe(choice);
  });

  it("maps a dismissed dialog to cancel", async () => {
    mockMessage.mockResolvedValue(undefined);
    expect(await promptUnsavedChanges()).toBe("cancel");
  });
});
