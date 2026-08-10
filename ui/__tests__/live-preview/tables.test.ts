import { describe, it, expect } from "vitest";
import { renderTablePreview, parseAlignments } from "../../live-preview/tables";

describe("parseAlignments", () => {
  it("maps delimiter cells to alignments", () => {
    expect(parseAlignments("| :--- | :---: | ---: | --- |")).toEqual([
      "left",
      "center",
      "right",
      null,
    ]);
  });

  it("handles delimiter rows without outer pipes", () => {
    expect(parseAlignments(":--- | ---:")).toEqual(["left", "right"]);
  });
});

describe("renderTablePreview", () => {
  const basic = "| Name | Age |\n| --- | ---: |\n| Bob | 42 |";

  it("renders header and body cells", () => {
    const dom = renderTablePreview(basic);
    const ths = dom.querySelectorAll("th");
    const tds = dom.querySelectorAll("td");
    expect(ths).toHaveLength(2);
    expect(ths[0].textContent).toBe("Name");
    expect(tds[0].textContent).toBe("Bob");
    expect(tds[1].textContent).toBe("42");
  });

  it("applies column alignment from the delimiter row", () => {
    const dom = renderTablePreview(basic);
    const tds = dom.querySelectorAll("td");
    expect(tds[0].style.textAlign).toBe("");
    expect(tds[1].style.textAlign).toBe("right");
  });

  it("renders inline markdown in cells without syntax markers", () => {
    const source =
      "| **b** | *i* | `c` | ~~s~~ | [t](https://x.test) |\n| --- | --- | --- | --- | --- |\n| a | b | c | d | e |";
    const dom = renderTablePreview(source);
    const ths = dom.querySelectorAll("th");
    expect(ths[0].querySelector("strong")?.textContent).toBe("b");
    expect(ths[1].querySelector("em")?.textContent).toBe("i");
    expect(ths[2].querySelector("code")?.textContent).toBe("c");
    expect(ths[3].querySelector("s")?.textContent).toBe("s");
    const link = ths[4].querySelector(".cm-table-link");
    expect(link?.textContent).toBe("t");
    // No real anchor — a href would navigate the webview away
    expect(ths[4].querySelector("a")).toBeNull();
  });

  it("falls back to raw text when the source is not a table", () => {
    const dom = renderTablePreview("just a paragraph");
    expect(dom.querySelector("table")).toBeNull();
    expect(dom.querySelector("pre")?.textContent).toBe("just a paragraph");
  });
});
