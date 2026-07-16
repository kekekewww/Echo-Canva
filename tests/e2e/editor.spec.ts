import { expect, test } from "@playwright/test";

test.describe("editor workbench", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads presets deterministically and exposes mode controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Concrete Partition" })).toBeVisible();
    await page.getByLabel("Scene preset").selectOption("hard-room");
    await expect(page.getByRole("heading", { name: "Hard Room" })).toBeVisible();
    await expect(page.getByTestId("wall-hard_north")).toHaveAttribute("data-material", "concrete_hard");

    await page.getByRole("button", { name: "Simulated" }).click();
    await expect(page.getByRole("button", { name: "Simulated" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Raw" }).click();
    await expect(page.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Start Audio" }).click();
    await expect(page.getByRole("button", { name: "Stop Audio" })).toBeVisible();
    await expect(page.getByText("Control shell ready")).toBeVisible();
  });

  test("drags a source and listener in world coordinates", async ({ page }) => {
    const source = page.getByTestId("source-radio");
    const listener = page.getByTestId("listener");
    const sourceBefore = await source.getAttribute("data-position");
    const listenerBefore = await listener.getAttribute("data-position");

    await source.dragTo(page.getByTestId("scene-canvas"), {
      targetPosition: { x: 600, y: 220 },
    });
    await listener.dragTo(page.getByTestId("scene-canvas"), {
      targetPosition: { x: 280, y: 380 },
    });

    await expect(source).not.toHaveAttribute("data-position", sourceBefore!);
    await expect(listener).not.toHaveAttribute("data-position", listenerBefore!);
  });

  test("adds and deletes a wall, changes material, and toggles a portal", async ({ page }) => {
    await page.getByRole("button", { name: "Add wall" }).click();
    const newWall = page.getByTestId(/^wall-user_wall_/);
    await expect(newWall).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Wall settings" })).toBeVisible();

    await page.getByLabel("Wall material").selectOption("wood_medium");
    await expect(newWall).toHaveAttribute("data-material", "wood_medium");
    await page.getByRole("button", { name: "Delete selected wall" }).click();
    await expect(newWall).toHaveCount(0);

    await page.getByTestId("portal-partition_door").click();
    await expect(page.getByRole("heading", { name: "Portal settings" })).toBeVisible();
    await page.getByRole("switch", { name: "Portal open" }).click();
    await expect(page.getByRole("switch", { name: "Portal open" })).toHaveAttribute("aria-checked", "false");
  });
});
