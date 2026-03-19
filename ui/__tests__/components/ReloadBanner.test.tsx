import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReloadBanner } from "../../components/ReloadBanner";

describe("ReloadBanner", () => {
  afterEach(cleanup);

  it("renders nothing when visible is false", () => {
    const { container } = render(
      <ReloadBanner visible={false} onReload={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the banner when visible is true", () => {
    render(<ReloadBanner visible={true} onReload={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/file changed on disk/i)).not.toBeNull();
  });

  it("calls onReload when Reload is clicked", async () => {
    const onReload = vi.fn();
    render(<ReloadBanner visible={true} onReload={onReload} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when Dismiss is clicked", async () => {
    const onDismiss = vi.fn();
    render(<ReloadBanner visible={true} onReload={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
