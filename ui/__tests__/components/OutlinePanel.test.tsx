import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlinePanel } from "../../components/OutlinePanel";
import type { TocHeading } from "../../types/toc";

const HEADINGS: TocHeading[] = [
  { level: 1, text: "Introduction", pos: 0 },
  { level: 2, text: "Background", pos: 30 },
  { level: 3, text: "Details", pos: 60 },
];

describe("OutlinePanel", () => {
  afterEach(cleanup);

  it("indents headings by level", () => {
    render(<OutlinePanel headings={HEADINGS} activeIndex={-1} onHeadingSelect={vi.fn()} />);

    const h1 = screen.getByRole("button", { name: "Introduction" });
    const h2 = screen.getByRole("button", { name: "Background" });
    const h3 = screen.getByRole("button", { name: "Details" });

    expect(h1.style.paddingLeft).toBe("8px");
    expect(h2.style.paddingLeft).toBe("20px");
    expect(h3.style.paddingLeft).toBe("32px");
  });

  it("calls onHeadingSelect with the clicked heading", async () => {
    const onHeadingSelect = vi.fn();
    render(<OutlinePanel headings={HEADINGS} activeIndex={-1} onHeadingSelect={onHeadingSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "Background" }));

    expect(onHeadingSelect).toHaveBeenCalledWith(HEADINGS[1]);
  });

  it("marks only the active heading with aria-current", () => {
    render(<OutlinePanel headings={HEADINGS} activeIndex={1} onHeadingSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Background" }).getAttribute("aria-current")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "Introduction" }).hasAttribute("aria-current")).toBe(
      false
    );
    expect(screen.getByRole("button", { name: "Background" }).className).toContain("active");
  });

  it("shows an empty state when there are no headings", () => {
    render(<OutlinePanel headings={[]} activeIndex={-1} onHeadingSelect={vi.fn()} />);

    expect(screen.getByText("No headings")).not.toBeNull();
  });
});
