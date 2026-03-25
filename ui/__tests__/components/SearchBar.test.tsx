import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar } from "../../components/SearchBar";

describe("SearchBar", () => {
  afterEach(cleanup);

  const defaultProps = {
    matchCount: 0,
    activeIndex: -1,
    caseSensitive: false,
    onQueryChange: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onToggleCaseSensitive: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders input, buttons, and match count", () => {
    render(<SearchBar {...defaultProps} matchCount={3} activeIndex={0} />);
    expect(screen.getByRole("textbox")).not.toBeNull();
    expect(screen.getByText("1/3")).not.toBeNull();
    expect(screen.getByLabelText("Previous match")).not.toBeNull();
    expect(screen.getByLabelText("Next match")).not.toBeNull();
    expect(screen.getByLabelText("Case sensitive")).not.toBeNull();
    expect(screen.getByLabelText("Close search")).not.toBeNull();
  });

  it("shows 'No results' after typing a query with no matches", async () => {
    render(<SearchBar {...defaultProps} matchCount={0} activeIndex={-1} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "xyz");
    expect(screen.getByText("No results")).not.toBeNull();
  });

  it("shows empty count area before typing", () => {
    render(<SearchBar {...defaultProps} matchCount={0} activeIndex={-1} />);
    expect(screen.queryByText("No results")).toBeNull();
  });

  it("calls onQueryChange when typing", async () => {
    const onQueryChange = vi.fn();
    render(<SearchBar {...defaultProps} onQueryChange={onQueryChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");
    expect(onQueryChange).toHaveBeenCalledWith("hello");
  });

  it("calls onNext when Enter is pressed in input", async () => {
    const onNext = vi.fn();
    render(<SearchBar {...defaultProps} onNext={onNext} matchCount={2} activeIndex={0} />);
    const input = screen.getByRole("textbox");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    expect(onNext).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed in input", async () => {
    const onClose = vi.fn();
    render(<SearchBar {...defaultProps} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onPrev when Shift+Enter is pressed", async () => {
    const onPrev = vi.fn();
    render(<SearchBar {...defaultProps} onPrev={onPrev} matchCount={2} activeIndex={1} />);
    const input = screen.getByRole("textbox");
    await userEvent.click(input);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onPrev).toHaveBeenCalled();
  });

  it("toggles case sensitivity", async () => {
    const onToggle = vi.fn();
    render(<SearchBar {...defaultProps} onToggleCaseSensitive={onToggle} />);
    await userEvent.click(screen.getByLabelText("Case sensitive"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("auto-focuses input on render", () => {
    render(<SearchBar {...defaultProps} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
});
