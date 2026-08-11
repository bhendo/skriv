import { message } from "@tauri-apps/plugin-dialog";

export type UnsavedChoice = "save" | "dont-save" | "cancel";

const SAVE = "Save";
const DONT_SAVE = "Don't Save";
const CANCEL = "Cancel";

/**
 * Three-button unsaved-changes prompt. With custom button labels, message()
 * resolves to the clicked label text; a dismissed dialog maps to "cancel".
 */
export async function promptUnsavedChanges(): Promise<UnsavedChoice> {
  const result = await message("Do you want to save your changes?", {
    title: "Unsaved Changes",
    kind: "warning",
    buttons: { yes: SAVE, no: DONT_SAVE, cancel: CANCEL },
  });

  if (result === SAVE) return "save";
  if (result === DONT_SAVE) return "dont-save";
  return "cancel";
}
