import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBanner } from "../../components/ErrorBanner";

describe("ErrorBanner", () => {
  afterEach(cleanup);

  it("renders nothing when message is null", () => {
    const { container } = render(<ErrorBanner message={null} onDismiss={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the error message", () => {
    render(<ErrorBanner message="Something went wrong" onDismiss={vi.fn()} />);
    expect(screen.queryByText("Something went wrong")).not.toBeNull();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner message="Error" onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
