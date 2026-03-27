import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TocSidebar } from "../../components/TocSidebar";
import type { TocHeading } from "../../types/toc";

describe("TocSidebar", () => {
  afterEach(cleanup);

  const headings: TocHeading[] = [
    { level: 1, text: "Introduction", pos: 0 },
    { level: 2, text: "Background", pos: 50 },
    { level: 2, text: "Motivation", pos: 120 },
    { level: 1, text: "Conclusion", pos: 200 },
  ];

  const defaultProps = {
    headings,
    activeIndex: 0,
    isOpen: true,
    onToggle: vi.fn(),
    onHeadingClick: vi.fn(),
  };

  it("renders all headings", () => {
    render(<TocSidebar {...defaultProps} />);
    expect(screen.getByText("Introduction")).not.toBeNull();
    expect(screen.getByText("Background")).not.toBeNull();
    expect(screen.getByText("Motivation")).not.toBeNull();
    expect(screen.getByText("Conclusion")).not.toBeNull();
  });

  it("marks the active heading", () => {
    render(<TocSidebar {...defaultProps} activeIndex={1} />);
    const bg = screen.getByText("Background").closest("button");
    expect(bg?.getAttribute("aria-current")).toBe("true");
  });

  it("calls onHeadingClick with pos when heading is clicked", async () => {
    const onHeadingClick = vi.fn();
    render(<TocSidebar {...defaultProps} onHeadingClick={onHeadingClick} />);
    await userEvent.click(screen.getByText("Background"));
    expect(onHeadingClick).toHaveBeenCalledWith(50);
  });

  it("calls onToggle when collapse button is clicked", async () => {
    const onToggle = vi.fn();
    render(<TocSidebar {...defaultProps} onToggle={onToggle} />);
    await userEvent.click(screen.getByLabelText("Collapse table of contents"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows empty state when no headings", () => {
    render(<TocSidebar {...defaultProps} headings={[]} />);
    expect(screen.getByText("No headings")).not.toBeNull();
  });

  it("is hidden when isOpen is false", () => {
    const { container } = render(<TocSidebar {...defaultProps} isOpen={false} />);
    const sidebar = container.querySelector(".toc-sidebar");
    expect(sidebar?.classList.contains("toc-sidebar--collapsed")).toBe(true);
  });
});
