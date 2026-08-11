import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarToggle } from "../../components/SidebarToggle";

describe("SidebarToggle", () => {
  afterEach(cleanup);

  it("reflects visibility via aria-pressed", () => {
    render(<SidebarToggle visible={true} onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: /toggle sidebar/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects hidden state via aria-pressed", () => {
    render(<SidebarToggle visible={false} onToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: /toggle sidebar/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    render(<SidebarToggle visible={true} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
